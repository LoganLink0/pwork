/**
 * 向导草稿状态（Zustand）。
 * 关键行为：先同步置内存、再异步落库——每步修改即刻持久化，意外关闭不丢步（PRD 8 可靠性）。
 */
import { create } from 'zustand'
import {
  defaultMeeting,
  emptyClap,
  type ActionItem,
  type ClapSections,
  type InsightRecord,
  type MeetingMeta,
  type ReviewRecord,
  type ReviewType,
  type ScenarioKey,
} from '../types/models'
import { addInsight, getReview, newId, saveReview, upsertActions } from '../db/repo'
import { attachReviewToNote } from '../../../db/repo'
import { generateSummary } from '../engine/summary'
import { hashTheme } from '../engine/theme'
import { ARCHIVE } from '../content/copy'
import { createTasksFromActions } from '../../../db/tasksRepo'
import { useTasks } from '../../../store/tasks'

interface StartOpts {
  templateId: string
  type: ReviewType
  scenario: ScenarioKey
  title: string
  quick: boolean
  /** 从速记"挂到复盘"带入的速记 id */
  noteIds?: string[]
}

interface DraftState {
  draft: ReviewRecord | null
  step: number
  startDraft: (opts: StartOpts) => Promise<void>
  loadDraft: (id: string) => Promise<void>
  setStep: (step: number) => void
  update: (patch: Partial<ReviewRecord>) => Promise<void>
  /** 对 CLAP 四环节做不可变更新并持久化 */
  updateClap: (fn: (clap: ClapSections) => ClapSections) => Promise<void>
  /** 对会议元数据做不可变更新并持久化（个人复盘无 meeting 时自动创建） */
  updateMeeting: (fn: (m: MeetingMeta) => MeetingMeta) => Promise<void>
  /** 归档：生成小结、落行动项与洞察卡；返回档案 id */
  archive: () => Promise<string | null>
}

export const useDraft = create<DraftState>((set, get) => ({
  draft: null,
  step: 0,

  startDraft: async (opts) => {
    const now = new Date().toISOString()
    const draft: ReviewRecord = {
      id: newId('rev'),
      type: opts.type,
      scenario: opts.scenario,
      templateId: opts.templateId,
      title: opts.title,
      createdAt: now,
      updatedAt: now,
      status: 'in-progress',
      quick: opts.quick,
      clap: emptyClap(),
      noteIds: opts.noteIds?.length ? opts.noteIds : undefined,
      meeting: opts.type === 'team' ? defaultMeeting() : undefined,
      summary: [],
    }
    set({ draft, step: 0 })
    await saveReview(draft)
    // 反向回写 note.links.reviewIds（铁律 4：ID 引用双向可溯源）
    if (opts.noteIds?.length) {
      for (const nid of opts.noteIds) await attachReviewToNote(nid, draft.id)
    }
  },

  updateMeeting: async (fn) => {
    const current = get().draft
    if (!current) return
    const meeting = fn(current.meeting ?? defaultMeeting())
    const next: ReviewRecord = { ...current, meeting }
    set({ draft: next })
    await saveReview(next)
  },

  loadDraft: async (id) => {
    const draft = await getReview(id)
    if (draft) set({ draft, step: 0 })
  },

  setStep: (step) => set({ step: Math.max(0, Math.min(step, 3)) }),

  update: async (patch) => {
    const current = get().draft
    if (!current) return
    const next: ReviewRecord = { ...current, ...patch }
    set({ draft: next })
    await saveReview(next)
  },

  updateClap: async (fn) => {
    const current = get().draft
    if (!current) return
    const next: ReviewRecord = { ...current, clap: fn(current.clap) }
    set({ draft: next })
    await saveReview(next)
  },

  archive: async () => {
    const current = get().draft
    if (!current) return null
    const next: ReviewRecord = {
      ...current,
      status: 'archived',
      summary: generateSummary(current),
      thinkingQuestion: ARCHIVE.thinkingQuestion,
    }
    set({ draft: next })
    await saveReview(next)

    // 行动项进入独立待办池（跨复盘追踪，M2 仪表盘使用）
    const actions: ActionItem[] = next.clap.project.actions.map((a) => ({
      id: newId('act'),
      reviewId: next.id,
      kind: a.kind,
      text: a.text,
      ifThen: a.ifThen,
      owner: a.owner,
      due: a.due,
      status: 'open',
      closedAt: null,
    }))
    await upsertActions(next.id, actions)

    // W3 桥接：行动项落任务库（SSOT，02 铁律 4）；ActionItem 持 taskId 引用
    await createTasksFromActions(actions)
    // 跨模块联动后刷新任务库状态（首页瓦片/侧边栏计数即时反映）
    void useTasks.getState().load()

    // 洞察卡进入认知资产库
    for (const ins of next.clap.acknowledge.insights) {
      if (!ins.text.trim()) continue
      const record: InsightRecord = {
        id: newId('ins'),
        reviewId: next.id,
        text: ins.text,
        tags: [],
        kind: ins.kind,
        verified: ins.kind === 'deductive',
        patternGroup: hashTheme(ins.text),
        createdAt: new Date().toISOString(),
        revisit: [],
      }
      await addInsight(record)
    }
    return next.id
  },
}))
