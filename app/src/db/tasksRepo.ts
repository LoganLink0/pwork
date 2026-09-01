/**
 * 任务库数据访问层 —— 行动项的 SSOT（02 铁律 4 / PRD §4.5 / §6.2）。
 * 其他模块只持 origin.refId / taskId 引用；任务闭环反向同步复盘 ActionItem 状态。
 */
import { db } from './schema'
import { newId } from './repo'
import { closeAction } from '../modules/review/db/repo'
import type { ActionItem } from '../modules/review/types/models'
import type { TaskItem, TaskOriginKind } from '../types/models'
import { todayLocal } from '../engine/datetime'

export const TASK_SCHEMA_VERSION = 1

export interface CreateTaskInput {
  title: string
  due?: string
  ifThen?: string
  origin?: { kind: TaskOriginKind; refId?: string | null }
}

function normalizeTask(raw: TaskItem): TaskItem {
  return {
    ...raw,
    status: raw.status ?? 'todo',
    due: raw.due ?? undefined,
    ifThen: raw.ifThen ?? undefined,
    origin: raw.origin ?? { kind: 'manual', refId: null },
    closedAt: raw.closedAt ?? null,
    deletedAt: raw.deletedAt ?? null,
    schemaVersion: raw.schemaVersion ?? TASK_SCHEMA_VERSION,
  }
}

export { normalizeTask }

export async function createTask(input: CreateTaskInput): Promise<TaskItem> {
  const now = new Date().toISOString()
  const task: TaskItem = normalizeTask({
    id: newId('task'),
    title: input.title.trim(),
    status: 'todo',
    due: input.due,
    ifThen: input.ifThen,
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

/** 闭环/重开/放弃 —— 任务库是状态 SSOT；复盘来源反向同步 ActionItem（FUPAN 统计口径不变） */
export async function setTaskStatus(id: string, status: TaskItem['status']): Promise<void> {
  const raw = await db.tasks.get(id)
  if (!raw) return
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

/** 首页/侧边栏统计：今天到期（含逾期）、本周 */
export async function dueStats(now = new Date()): Promise<{ today: number; week: number; open: number; done: number; total: number }> {
  const all = await db.tasks.toArray()
  const open = all.filter((t) => t.deletedAt === null && (t.status === 'todo' || t.status === 'doing'))
  const today = todayDue(now)
  const week = weekEnd(now)
  return {
    today: open.filter((t) => (t.due ?? '9999') <= today).length,
    week: open.filter((t) => (t.due ?? '9999') > today && (t.due ?? '9999') <= week).length,
    open: open.length,
    done: all.filter((t) => t.status === 'done').length,
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
