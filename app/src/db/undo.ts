/**
 * 整库撤销栈（2026-11-15 外部研读报告改动 2 写库部分）：用户显式操作的撤销支持。
 * 存储：kv 单行（pwork-undo-stack），瞬时态不入备份/wipeAndImport/守卫口径。
 * 语义（media-desk revertChange 三方合并的同款）：撤销是一次「新写入」——
 *   对每个被改键：current==after（后来没被动过）→ 回滚到 before；
 *   current==before（用户已手动改回）→ 保持；current 两边都不等（之后又被改过）→ 保留现在的值。
 * 关键约束（LWW 防线）：撤销写入把 updatedAt 推进到撤销时刻并打 undoOf 标记——
 *   否则撤销后的旧值会被云端 LWW 用更晚的 updatedAt 压回（undo.test 有断言守护此行为）。
 * origin 约定：撤销栈只记录用户显式操作；后台自动化（成稿/抓取/同步）写入不入栈。
 */
import { db } from './schema'
import { BUSINESS_TABLES } from './schema'

export const UNDO_KEY = 'pwork-undo-stack'

export interface UndoChange {
  table: string
  id: string
  before: Record<string, unknown> | null
  after: Record<string, unknown> | null
}

export interface UndoEntry {
  label: string
  ts: string
  changes: UndoChange[]
}

export interface UndoState {
  entries: UndoEntry[]
}

const MAX_ENTRIES = 10

export async function loadUndo(): Promise<UndoState> {
  const row = await db.kv.get(UNDO_KEY)
  const v = row?.value as UndoState | undefined
  return v && Array.isArray(v.entries) ? { entries: v.entries } : { entries: [] }
}

export async function pushUndo(entry: UndoEntry): Promise<void> {
  const s = await loadUndo()
  s.entries.push(entry)
  const trimmed = s.entries.slice(-MAX_ENTRIES)
  await db.kv.put({ key: UNDO_KEY, value: { entries: trimmed } satisfies UndoState })
}

/**
 * 三方合并撤销（纯函数）：对每键判「这次改动改了它吗 / 之后又被动过吗」。
 * 返回 null 表示该实体应被移除（新增的撤销）；返回对象为回滚后的行。
 */
export function revertChange(
  before: Record<string, unknown> | null,
  after: Record<string, unknown> | null,
  current: Record<string, unknown> | null,
): Record<string, unknown> | null {
  // 新增的撤销：before 为 null → current 还在就移除
  if (before === null) return current === null ? null : null
  // 删除的撤销：current 已不存在 → 放回 before
  if (current === null) return { ...before }
  const out: Record<string, unknown> = { ...current }
  const keys = new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})])
  for (const k of keys) {
    const b = before?.[k]
    const a = after?.[k]
    const c = current?.[k]
    if (b === a) continue // 本次改动没碰它
    if (c === a) out[k] = b // 之后没被动过 → 回滚
    // c === b（用户已改回）或 c 两边都不等（之后又被改）→ 保留现在的值
  }
  return out
}

/** 撤销栈顶：逐表回滚并弹出栈顶。返回给调用方展示的人话结果 */
export async function undoLast(now: Date = new Date()): Promise<{ label: string; applied: number; skipped: number }> {
  const s = await loadUndo()
  const top = s.entries[s.entries.length - 1]
  if (!top) throw new Error('没有可撤销的操作')
  let applied = 0
  let skipped = 0
  for (const c of top.changes) {
    if (!BUSINESS_TABLES.includes(c.table as (typeof BUSINESS_TABLES)[number])) {
      skipped++
      continue
    }
    const b = (c.before ?? null) as Record<string, unknown> | null
    const a = (c.after ?? null) as Record<string, unknown> | null
    const cur = ((await db.table(c.table).get(c.id)) ?? null) as Record<string, unknown> | null
    const reverted = revertChange(b, a, cur)
    if (reverted === null) {
      if (cur !== null) {
        await db.table(c.table).delete(c.id)
        applied++
      } else {
        skipped++
      }
      continue
    }
    const rec = reverted as Record<string, unknown>
    if (typeof rec.updatedAt !== 'undefined') rec.updatedAt = now.toISOString()
    rec.undoOf = now.toISOString()
    await db.table(c.table).put(rec)
    applied++
  }
  s.entries.pop()
  await db.kv.put({ key: UNDO_KEY, value: { entries: s.entries } satisfies UndoState })
  return { label: top.label, applied, skipped }
}
