/**
 * 洞察回访引擎（间隔重复，2026-10-24 对齐 SM-2 思路重做）。
 * 首访 = 沉淀后 7 天；此后按回访结果调间隔：
 *   成立（valid）→ 间隔翻倍（封顶 180 天）——认知越站得住，问得越稀
 *   部分失效（partial）→ 间隔重置 30 天——认知要修，近期再问
 *   需要修正（invalid）→ 回访终结（isDue 永假，标记已修正）
 * 旧记录无 result 字段：按 stillValid 推导（true→valid / false→invalid）。
 */
import type { InsightRecord } from '../types/models'

export const REVISIT_FIRST_DAYS = 7
export const REVISIT_MIN_DAYS = 30
export const REVISIT_MAX_DAYS = 180

const DAY_MS = 24 * 60 * 60 * 1000

export type RevisitResult = 'valid' | 'partial' | 'invalid'

type Visit = InsightRecord['revisit'][number]

/** 单条回访记录的三态结果（含旧记录推导） */
export function resultOf(v: Visit): RevisitResult {
  if (v.result) return v.result
  return v.stillValid ? 'valid' : 'invalid'
}

function history(insight: InsightRecord): Visit[] {
  return [...insight.revisit].sort((a, b) => a.at.localeCompare(b.at))
}

/** 回访终结：最近一次判定"需要修正" */
export function isRetired(insight: InsightRecord): boolean {
  const h = history(insight)
  return h.length > 0 && resultOf(h[h.length - 1]!) === 'invalid'
}

/** 当前间隔（天）：按历史逐条演进；终结时为 0 */
export function currentIntervalDays(insight: InsightRecord): number {
  let days = REVISIT_FIRST_DAYS
  for (const v of history(insight)) {
    const r = resultOf(v)
    if (r === 'invalid') return 0
    if (r === 'valid') days = Math.min(days * 2, REVISIT_MAX_DAYS)
    else days = REVISIT_MIN_DAYS
  }
  return days
}

/** 回访锚点：从未回访用 createdAt，回访过用最后一次回访时间 */
export function revisitAnchor(insight: InsightRecord): number {
  const h = history(insight)
  if (h.length > 0) return new Date(h[h.length - 1]!.at).getTime()
  return insight.createdAt ? new Date(insight.createdAt).getTime() : 0
}

export function nextDueAt(insight: InsightRecord): number {
  if (isRetired(insight)) return Number.POSITIVE_INFINITY
  return revisitAnchor(insight) + currentIntervalDays(insight) * DAY_MS
}

export function isDue(insight: InsightRecord, now = Date.now()): boolean {
  return now >= nextDueAt(insight)
}

/** 距下次回访还有几天（已到期/已终结返回 0） */
export function daysUntilDue(insight: InsightRecord, now = Date.now()): number {
  const ms = nextDueAt(insight) - now
  return ms <= 0 ? 0 : Math.ceil(ms / DAY_MS)
}

/** 最近一次回访是否判定"已修正"（终结态的展示依据） */
export function lastRevisitInvalid(insight: InsightRecord): boolean {
  return isRetired(insight)
}

/** 最近一次回访是否"部分失效" */
export function lastRevisitPartial(insight: InsightRecord): boolean {
  const h = history(insight)
  return h.length > 0 && resultOf(h[h.length - 1]!) === 'partial'
}
