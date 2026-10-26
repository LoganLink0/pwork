/**
 * 统一导入（备份先行铁律 6 的另一半）：接受三种格式，按 id + updatedAt last-writer-wins 合并（02 §4）。
 * ① PWORK v2：{ version:2, entities: { notes, sources?, items?, collectConfig?, reviews?, actions?, insights?, tasks?, goals?, snapshots?, blocks?, profiles?, caseFiles? } }
 * ② PWORK v1：{ version:1, entities: { notes } }
 * ③ FUPAN v1（旧复盘工作台导出）：{ version:1, exportedAt, reviews[], actions[], insights[] }
 */
import { db } from './schema'
import { normalizeNote } from './repo'
import { normalizeItem } from './collect'
import { normalizeTask } from './tasksRepo'
import { normalizeGoal } from './goalsRepo'
import { normalizeBlock } from './blocksRepo'
import { normalizeProfile } from './profilesRepo'
import { normalizeCaseFile } from './caseFilesRepo'
import { saveCollectConfig } from '../content/collect'
import type { CaseFile, DataBlock, Goal, Item, Note, Profile, ReportSnapshot, Source, TaskItem } from '../types/models'
import type { ActionItem, InsightRecord, ReviewRecord } from '../modules/review/types/models'

export interface ImportResult {
  format: 'pwork-v2' | 'pwork-v1' | 'fupan-v1'
  counts: Record<string, number>
}

/* LWW 合并：updatedAt 更新（或不存在）才写入 */
async function merge<T extends { id: string; updatedAt?: string }>(
  table: { get(id: string): Promise<T | undefined>; put(v: T): Promise<unknown> },
  incoming: T[],
): Promise<number> {
  let n = 0
  for (const raw of incoming) {
    if (!raw?.id) continue
    const existing = await table.get(raw.id)
    if (!existing || (raw.updatedAt ?? '') > (existing.updatedAt ?? '')) {
      await table.put(raw)
      n++
    }
  }
  return n
}

/** 旧备份的信源可能缺 health/deletedAt 等后加字段（铁律 2 读取防御） */
function normalizeSource(raw: Source): Source {
  return {
    ...raw,
    kind: raw.kind ?? 'rss',
    checkEvery: raw.checkEvery ?? 'daily',
    active: raw.active ?? true,
    health: raw.health ?? { failStreak: 0, lastOkAt: null, lastError: null },
    deletedAt: raw.deletedAt ?? null,
    schemaVersion: raw.schemaVersion ?? 1,
  }
}

/* 以下四实体（B14，2026-10-26）：云端拉回的 payload 可能来自旧 schema——
 * 缺必填字段的坏行直接跳过，可选字段补默认，防渲染层读到 undefined 崩 */

function normalizeReview(raw: ReviewRecord): ReviewRecord | null {
  if (!raw || typeof raw.id !== 'string' || typeof raw.title !== 'string') return null
  return { ...raw, summary: Array.isArray(raw.summary) ? raw.summary : [], status: raw.status === 'archived' ? 'archived' : 'in-progress', quick: raw.quick === true }
}

function normalizeAction(raw: ActionItem): ActionItem | null {
  if (!raw || typeof raw.id !== 'string' || typeof raw.text !== 'string') return null
  return { ...raw, status: raw.status === 'done' || raw.status === 'dropped' ? raw.status : 'open', closedAt: raw.closedAt ?? null }
}

function normalizeInsight(raw: InsightRecord): InsightRecord | null {
  if (!raw || typeof raw.id !== 'string' || typeof raw.text !== 'string') return null
  return { ...raw, tags: Array.isArray(raw.tags) ? raw.tags : [], verified: raw.verified === true, revisit: Array.isArray(raw.revisit) ? raw.revisit : [] }
}

function normalizeSnapshot(raw: ReportSnapshot): ReportSnapshot | null {
  if (!raw || typeof raw.id !== 'string' || typeof raw.day !== 'string') return null
  return raw
}

export async function importBundle(text: string): Promise<ImportResult> {
  const data = JSON.parse(text) as Record<string, unknown>
  const entities = (data.entities ?? null) as Record<string, unknown> | null
  const counts: Record<string, number> = {}

  // ③ FUPAN v1：reviews/actions/insights 在顶层
  if (!entities && Array.isArray(data.reviews)) {
    counts.reviews = await merge<ReviewRecord>(db.reviews, (data.reviews as ReviewRecord[]).map(normalizeReview).filter((r): r is ReviewRecord => r !== null))
    counts.actions = await merge<ActionItem>(db.actions, ((data.actions ?? []) as ActionItem[]).map(normalizeAction).filter((a): a is ActionItem => a !== null))
    counts.insights = await merge<InsightRecord>(db.insights, ((data.insights ?? []) as InsightRecord[]).map(normalizeInsight).filter((i): i is InsightRecord => i !== null))
    return { format: 'fupan-v1', counts }
  }
  if (!entities) throw new Error('无法识别的备份格式（缺少 entities 与 reviews）')

  // ①/② PWORK 包裹
  if (Array.isArray(entities.notes)) counts.notes = await merge<Note>(db.notes, (entities.notes as Note[]).map(normalizeNote))
  if (Array.isArray(entities.sources)) counts.sources = await merge<Source>(db.sources, (entities.sources as Source[]).map(normalizeSource))
  if (Array.isArray(entities.items)) counts.items = await merge<Item>(db.items, (entities.items as Item[]).map(normalizeItem))
  if (Array.isArray(entities.tasks)) counts.tasks = await merge<TaskItem>(db.tasks, (entities.tasks as TaskItem[]).map(normalizeTask))
  if (Array.isArray(entities.reviews)) counts.reviews = await merge<ReviewRecord>(db.reviews, (entities.reviews as ReviewRecord[]).map(normalizeReview).filter((r): r is ReviewRecord => r !== null))
  if (Array.isArray(entities.actions)) counts.actions = await merge<ActionItem>(db.actions, (entities.actions as ActionItem[]).map(normalizeAction).filter((a): a is ActionItem => a !== null))
  if (Array.isArray(entities.insights)) counts.insights = await merge<InsightRecord>(db.insights, (entities.insights as InsightRecord[]).map(normalizeInsight).filter((i): i is InsightRecord => i !== null))
  if (Array.isArray(entities.goals)) counts.goals = await merge<Goal>(db.goals, (entities.goals as Goal[]).map(normalizeGoal))
  if (Array.isArray(entities.blocks)) counts.blocks = await merge<DataBlock>(db.blocks, (entities.blocks as DataBlock[]).map(normalizeBlock))
  if (Array.isArray(entities.profiles)) counts.profiles = await merge<Profile>(db.profiles, (entities.profiles as Profile[]).map(normalizeProfile))
  if (Array.isArray(entities.caseFiles)) counts.caseFiles = await merge<CaseFile>(db.caseFiles, (entities.caseFiles as CaseFile[]).map(normalizeCaseFile))
  // 周趋势快照无 updatedAt 字段——只补缺，不覆盖（重复生成覆盖是生成侧的语义）
  if (Array.isArray(entities.snapshots)) counts.snapshots = await merge<ReportSnapshot>(db.snapshots, (entities.snapshots as ReportSnapshot[]).map(normalizeSnapshot).filter((s): s is ReportSnapshot => s !== null))
  if (entities.collectConfig && typeof entities.collectConfig === 'object') {
    saveCollectConfig(entities.collectConfig as Parameters<typeof saveCollectConfig>[0])
    counts.collectConfig = 1
  }
  return { format: data.version === 2 ? 'pwork-v2' : 'pwork-v1', counts }
}
