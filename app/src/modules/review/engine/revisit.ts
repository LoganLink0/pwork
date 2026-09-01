/**
 * 洞察回访引擎（PRD 2.4 间隔重复 / 5.3 F5）。
 * 周期：首次回访 = 沉淀后 7 天；之后每 30 天。
 * 回访不是重读——是提取练习："这条认知还成立吗？"
 */
import type { InsightRecord } from '../types/models'

export const REVISIT_FIRST_DAYS = 7
export const REVISIT_NEXT_DAYS = 30

const DAY_MS = 24 * 60 * 60 * 1000

/** 回访锚点：从未回访用 createdAt，回访过用最后一次回访时间 */
export function revisitAnchor(insight: InsightRecord): number {
  if (insight.revisit.length > 0) {
    const last = insight.revisit.reduce((a, b) => (a.at > b.at ? a : b))
    return new Date(last.at).getTime()
  }
  return insight.createdAt ? new Date(insight.createdAt).getTime() : 0
}

export function nextDueAt(insight: InsightRecord): number {
  const days = insight.revisit.length > 0 ? REVISIT_NEXT_DAYS : REVISIT_FIRST_DAYS
  return revisitAnchor(insight) + days * DAY_MS
}

export function isDue(insight: InsightRecord, now = Date.now()): boolean {
  return now >= nextDueAt(insight)
}

/** 最近一次回访是否判定"已修正" */
export function lastRevisitInvalid(insight: InsightRecord): boolean {
  if (insight.revisit.length === 0) return false
  const last = insight.revisit.reduce((a, b) => (a.at > b.at ? a : b))
  return !last.stillValid
}
