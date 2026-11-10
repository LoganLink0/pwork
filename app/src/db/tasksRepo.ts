/**
 * 任务库数据访问层 —— 行动项的 SSOT（02 铁律 4 / PRD §4.5 / §6.2）。
 * 其他模块只持 origin.refId / taskId 引用；任务闭环反向同步复盘 ActionItem 状态。
 */
import { db } from './schema'
import { newId } from './repo'
import { closeAction } from '../modules/review/db/repo'
import type { ActionItem } from '../modules/review/types/models'
import type { TaskItem, TaskLane, TaskOriginKind } from '../types/models'
import { todayLocal } from '../engine/datetime'

export const TASK_SCHEMA_VERSION = 1

/** 循环待办合法间隔（1.5 批）：1=每天 7=每周 14=两周 30=每月 90=每季 */
export const RECURRENCE_DAYS = [1, 7, 14, 30, 90] as const
export type RecurrenceInterval = (typeof RECURRENCE_DAYS)[number]
/** 间隔 → 界面叫法（徽章/下拉/镜像 frontmatter 共用，同一概念全站同名） */
export const RECURRENCE_LABEL: Record<RecurrenceInterval, string> = { 1: '每天', 7: '每周', 14: '每两周', 30: '每月', 90: '每季' }
/** 完成记录保留条数：习惯数据看趋势用一年量足够，防无限增长 */
export const DONE_DATES_CAP = 52

export interface CreateTaskInput {
  title: string
  due?: string
  ifThen?: string
  lane?: TaskLane
  origin?: { kind: TaskOriginKind; refId?: string | null }
  recurrenceDays?: RecurrenceInterval
}

const ORIGIN_KINDS: readonly TaskOriginKind[] = ['review', 'note', 'item', 'manual', 'todo-file'] as const

const LOCAL_DATE = /^\d{4}-\d{2}-\d{2}$/

function normalizeTask(raw: TaskItem): TaskItem {
  const kind = (raw.origin?.kind ?? 'manual') as TaskOriginKind
  const dates = Array.isArray(raw.doneDates) ? raw.doneDates.filter((d) => typeof d === 'string' && LOCAL_DATE.test(d)) : []
  return {
    ...raw,
    status: raw.status ?? 'todo',
    lane: raw.lane ?? undefined,
    due: raw.due ?? undefined,
    ifThen: raw.ifThen ?? undefined,
    // 旧备份可能带已退役的来源类型（如投标），归一为手动，防运行时死分支
    origin: raw.origin && ORIGIN_KINDS.includes(kind) ? raw.origin : { kind: 'manual', refId: null },
    recurrenceDays: (RECURRENCE_DAYS as readonly number[]).includes(raw.recurrenceDays as number)
      ? raw.recurrenceDays
      : undefined,
    doneDates: dates.length > 0 ? [...new Set(dates)].slice(-DONE_DATES_CAP) : undefined,
    closedAt: raw.closedAt ?? null,
    deletedAt: raw.deletedAt ?? null,
    schemaVersion: raw.schemaVersion ?? TASK_SCHEMA_VERSION,
  }
}

export { normalizeTask }

/** 本地日期 +N 天（纯函数；跨月/跨年/闰日交给 Date 求解，输出仍为本地 'YYYY-MM-DD'） */
export function addDaysLocal(dateLocal: string, days: number): string {
  const [y, m, d] = dateLocal.split('-').map(Number)
  const dt = new Date(y, m - 1, d + days, 12)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${dt.getFullYear()}-${p(dt.getMonth() + 1)}-${p(dt.getDate())}`
}

/**
 * 循环完成派生（纯函数，1.5 批）：勾选完成时从完成日派生下一期到期日并立即重开——
 * 逾期不雪崩（连欠三周也只欠这一期），完成记录 +1（近 52 条，截最旧的）。
 * 复盘来源的行动项是一次性承诺：循环的下一期不回写复盘，行动项保持其闭环态。
 */
export function deriveRecurrenceNext(
  raw: TaskItem,
  doneLocal: string,
): Pick<TaskItem, 'status' | 'due' | 'doneDates' | 'closedAt' | 'updatedAt'> {
  const interval = raw.recurrenceDays as RecurrenceInterval
  return {
    status: 'todo',
    due: addDaysLocal(doneLocal, interval),
    doneDates: [...(raw.doneDates ?? []), doneLocal].slice(-DONE_DATES_CAP),
    closedAt: null,
    updatedAt: new Date().toISOString(),
  }
}

export async function createTask(input: CreateTaskInput): Promise<TaskItem> {
  const now = new Date().toISOString()
  const task: TaskItem = normalizeTask({
    id: newId('task'),
    title: input.title.trim(),
    status: 'todo',
    lane: input.lane,
    due: input.due,
    ifThen: input.ifThen,
    recurrenceDays: input.recurrenceDays,
    origin: { kind: input.origin?.kind ?? 'manual', refId: input.origin?.refId ?? null },
    closedAt: null,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    schemaVersion: TASK_SCHEMA_VERSION,
  })
  await db.tasks.put(task)
  return task
}

/** 全部未删除任务：未完成在前（按 due 升序、无日期殿后），已完成按闭环时间倒序 */
export async function listTasks(): Promise<TaskItem[]> {
  const all = await db.tasks.toArray()
  return all
    .map(normalizeTask)
    .filter((t) => t.deletedAt === null)
    .sort((a, b) => {
      const aDone = a.status === 'done' || a.status === 'dropped'
      const bDone = b.status === 'done' || b.status === 'dropped'
      if (aDone !== bDone) return aDone ? 1 : -1
      if (aDone && bDone) return (b.closedAt ?? '').localeCompare(a.closedAt ?? '')
      return (a.due ?? '9999').localeCompare(b.due ?? '9999')
    })
}

export async function getTask(id: string): Promise<TaskItem | undefined> {
  const raw = await db.tasks.get(id)
  return raw ? normalizeTask(raw) : undefined
}

/** 闭环/重开/放弃 —— 任务库是状态 SSOT；复盘来源反向同步 ActionItem（FUPAN 统计口径不变）。
 *  循环待办（1.5 批）：勾选完成走派生重开（deriveRecurrenceNext），复盘来源的行动项保持闭环不回写 */
export async function setTaskStatus(id: string, status: TaskItem['status']): Promise<void> {
  const raw = await db.tasks.get(id)
  if (!raw) return
  if (status === 'done' && raw.recurrenceDays) {
    const next = deriveRecurrenceNext(normalizeTask(raw), todayLocal())
    await db.tasks.put({ ...normalizeTask(raw), ...next })
    // 复盘来源的行动项是一次性承诺：行动项保持其闭环态，循环的下一期不回写复盘
    return
  }
  const closing = status === 'done' || status === 'dropped'
  await db.tasks.put({
    ...normalizeTask(raw),
    status,
    closedAt: closing ? new Date().toISOString() : null,
    updatedAt: new Date().toISOString(),
  })
  const origin = raw.origin
  if (origin?.kind === 'review' && origin.refId) {
    if (status === 'done' || status === 'dropped') {
      await closeAction(origin.refId, status)
    } else {
      // 重开：closeAction 只接受终态，重置为 open 走直更
      await db.actions.update(origin.refId, { status: 'open', closedAt: null })
    }
  }
}

/** 本地日期辅助：今天 / 本周日（周一起算）'YYYY-MM-DD' */
export function todayDue(now = new Date()): string {
  return todayLocal(now)
}

export function weekEnd(now = new Date()): string {
  const day = now.getDay() === 0 ? 7 : now.getDay() // 周一=1…周日=7
  const end = new Date(now)
  end.setDate(now.getDate() + (7 - day))
  return todayLocal(end)
}

/** 软删除任务（铁律 3；三类任务的"直接删除"出口） */
export async function softDeleteTask(id: string): Promise<void> {
  const raw = await db.tasks.get(id)
  if (!raw || raw.deletedAt) return
  await db.tasks.put({ ...normalizeTask(raw), deletedAt: new Date().toISOString(), updatedAt: new Date().toISOString() })
}

/** 调整分类（用户手动覆盖） */
export async function setTaskLane(id: string, lane: TaskLane): Promise<void> {
  const raw = await db.tasks.get(id)
  if (!raw) return
  await db.tasks.put({ ...normalizeTask(raw), lane, updatedAt: new Date().toISOString() })
}

/** 编辑待办（标题/期限/重复间隔；期限空串=清除，重复间隔 null=改回一次性）。行内编辑入口的后端（2026-10-24）。
 *  复盘行动项生成的任务（origin.refId=行动项 id）：标题/期限同步回写行动项，防双份漂移 */
export async function updateTaskFields(
  id: string,
  patch: { title?: string; due?: string; recurrenceDays?: RecurrenceInterval | null },
): Promise<void> {
  const raw = await db.tasks.get(id)
  if (!raw) return
  const next = {
    ...normalizeTask(raw),
    title: patch.title !== undefined ? patch.title.trim() || raw.title : raw.title,
    due: patch.due !== undefined ? patch.due || undefined : raw.due,
    recurrenceDays:
      patch.recurrenceDays === undefined
        ? raw.recurrenceDays
        : patch.recurrenceDays === null
          ? undefined
          : patch.recurrenceDays,
    updatedAt: new Date().toISOString(),
  }
  await db.tasks.put(next)
  await syncActionFromTask(next)
}

/** 推迟：due 顺延 N 天（无期限则设为今天+N）；行动项生成的任务同步回写 */
export async function postponeTask(id: string, days = 7): Promise<void> {
  const raw = await db.tasks.get(id)
  if (!raw) return
  const base = raw.due && raw.due > todayLocal() ? new Date(raw.due + 'T12:00:00') : new Date()
  base.setDate(base.getDate() + days)
  const next = {
    ...normalizeTask(raw),
    due: todayLocal(base),
    updatedAt: new Date().toISOString(),
  }
  await db.tasks.put(next)
  await syncActionFromTask(next)
}

/** 任务侧 → 行动项侧的标题/期限回写（状态同步已有 setTaskStatus 负责，这里补齐另外两个字段） */
async function syncActionFromTask(task: TaskItem): Promise<void> {
  if (task.origin.kind !== 'review' || !task.origin.refId) return
  const patch: { text?: string; due?: string | undefined } = {}
  if (task.title) patch.text = task.title
  if (task.due !== undefined) patch.due = task.due
  if (Object.keys(patch).length === 0) return
  await db.actions.update(task.origin.refId, patch)
}

/** 首页/侧边栏统计：今天到期（含逾期）、本周 */
export async function dueStats(now = new Date()): Promise<{ today: number; week: number; open: number; done: number; total: number }> {
  const all = await db.tasks.toArray()
  const open = all.filter((t) => t.deletedAt === null && t.status === 'todo')
  const today = todayDue(now)
  const week = weekEnd(now)
  return {
    today: open.filter((t) => (t.due ?? '9999') <= today).length,
    week: open.filter((t) => (t.due ?? '9999') > today && (t.due ?? '9999') <= week).length,
    open: open.length,
    done: all.filter((t) => t.deletedAt === null && t.status === 'done').length,
    total: all.filter((t) => t.deletedAt === null).length,
  }
}

/**
 * W3 桥接（03 §4 行动项桥接）：复盘归档的行动项批量落任务库，
 * 并把 taskId 回写到 ActionItem（字段只增不删）。返回建好的 TaskItem[]。
 */
export async function createTasksFromActions(actions: ActionItem[]): Promise<TaskItem[]> {
  const created: TaskItem[] = []
  for (const a of actions) {
    if (!a.text.trim()) continue
    const task = await createTask({
      title: a.text,
      due: a.due,
      ifThen: a.ifThen,
      origin: { kind: 'review', refId: a.id },
    })
    created.push(task)
    await db.actions.update(a.id, { taskId: task.id })
  }
  return created
}
