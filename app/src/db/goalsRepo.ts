/**
 * 目标数据访问层（C-2 最小实体，2026-08-31 决议）。
 * 拥有者：工作台目标模块；复盘向导只读引用（02 §3 字段所有权表）。
 */
import { db } from './schema'
import { newId } from './repo'
import type { Goal } from '../types/models'

export const GOAL_SCHEMA_VERSION = 1

export function normalizeGoal(raw: Goal): Goal {
  return {
    ...raw,
    status: raw.status ?? 'active',
    due: raw.due ?? undefined,
    progressNote: raw.progressNote ?? undefined,
    progressLog: raw.progressLog ?? undefined,
    closedAt: raw.closedAt ?? null,
    deletedAt: raw.deletedAt ?? null,
    schemaVersion: raw.schemaVersion ?? GOAL_SCHEMA_VERSION,
  }
}

export interface CreateGoalInput {
  title: string
  due?: string
}

export async function createGoal(input: CreateGoalInput): Promise<Goal> {
  const now = new Date().toISOString()
  const goal: Goal = normalizeGoal({
    id: newId('goal'),
    title: input.title.trim(),
    status: 'active',
    due: input.due,
    closedAt: null,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    schemaVersion: GOAL_SCHEMA_VERSION,
  })
  await db.goals.put(goal)
  return goal
}

export async function listActiveGoals(): Promise<Goal[]> {
  const all = await db.goals.toArray()
  return all
    .map(normalizeGoal)
    .filter((g) => g.deletedAt === null && g.status === 'active')
    .sort((a, b) => (a.due ?? '9999').localeCompare(b.due ?? '9999'))
}

export async function listAllGoals(): Promise<Goal[]> {
  const all = await db.goals.toArray()
  return all
    .map(normalizeGoal)
    .filter((g) => g.deletedAt === null)
    .sort((a, b) => {
      const aDone = a.status !== 'active'
      const bDone = b.status !== 'active'
      if (aDone !== bDone) return aDone ? 1 : -1
      return (a.due ?? '9999').localeCompare(b.due ?? '9999')
    })
}

/** 状态流转；done/dropped 记 closedAt */
export async function setGoalStatus(id: string, status: Goal['status']): Promise<void> {
  const raw = await db.goals.get(id)
  if (!raw) return
  const closing = status !== 'active'
  await db.goals.put({
    ...normalizeGoal(raw),
    status,
    closedAt: closing ? new Date().toISOString() : null,
    updatedAt: new Date().toISOString(),
  })
}

/** 预填用：更新进度快照（复盘时人工/自动写入）；轨迹追加不改写（02 铁律 2） */
export async function updateProgress(id: string, progressNote: string): Promise<void> {
  const raw = await db.goals.get(id)
  if (!raw) return
  const now = new Date().toISOString()
  const log = [...(raw.progressLog ?? []), { at: now, note: progressNote }]
  await db.goals.put({ ...normalizeGoal(raw), progressNote, progressLog: log, updatedAt: now })
}

/** 设定/清除目标期限（SMART 的 Time-bound：字段已有，此处补入口） */
export async function updateDue(id: string, due: string | undefined): Promise<void> {
  const raw = await db.goals.get(id)
  if (!raw) return
  await db.goals.put({ ...normalizeGoal(raw), due: due || undefined, updatedAt: new Date().toISOString() })
}

/** 编辑目标标题（期限走 updateDue；行内编辑入口的后端，2026-10-24） */
export async function updateGoalTitle(id: string, title: string): Promise<void> {
  const raw = await db.goals.get(id)
  if (!raw) return
  const next = title.trim()
  if (!next) return
  await db.goals.put({ ...normalizeGoal(raw), title: next, updatedAt: new Date().toISOString() })
}
