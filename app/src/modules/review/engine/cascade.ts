/**
 * 删除目标/结果/差距时的索引级联（体检发现的 Bug 1 修复）。
 * 之前直接 filter 会留下悬空引用：gaps 的 goalRef/resultRef 指错行，
 * causes 的 gapRef 悬空后原因在界面上永远不再显示（隐形丢数据）。
 * 删除目标/结果连带删除 gaps 时，挂在其上的 causes 一并级联（第三层引用）。
 * 全部纯函数，便于单测。
 */
import type { CauseItem, GapItem, GoalItem, ResultItem } from '../types/models'

export function removeGoalAt(
  goals: GoalItem[],
  gaps: GapItem[],
  causes: CauseItem[],
  index: number,
): { goals: GoalItem[]; gaps: GapItem[]; causes: CauseItem[] } {
  const removedGapIdx = new Set(gaps.map((g, i) => (g.goalRef === index ? i : -1)).filter((i) => i >= 0))
  const nextGaps = gaps
    .filter((g) => g.goalRef !== index)
    .map((g) => (g.goalRef > index ? { ...g, goalRef: g.goalRef - 1 } : g))
  return {
    goals: goals.filter((_, i) => i !== index),
    gaps: nextGaps,
    causes: cascadeCauses(causes, removedGapIdx),
  }
}

export function removeResultAt(
  results: ResultItem[],
  gaps: GapItem[],
  causes: CauseItem[],
  index: number,
): { results: ResultItem[]; gaps: GapItem[]; causes: CauseItem[] } {
  const removedGapIdx = new Set(gaps.map((g, i) => (g.resultRef === index ? i : -1)).filter((i) => i >= 0))
  const nextGaps = gaps
    .filter((g) => g.resultRef !== index)
    .map((g) => (g.resultRef > index ? { ...g, resultRef: g.resultRef - 1 } : g))
  return {
    results: results.filter((_, i) => i !== index),
    gaps: nextGaps,
    causes: cascadeCauses(causes, removedGapIdx),
  }
}

export function removeGapAt(
  gaps: GapItem[],
  causes: CauseItem[],
  index: number,
): { gaps: GapItem[]; causes: CauseItem[] } {
  return {
    gaps: gaps.filter((_, i) => i !== index),
    causes: causes
      .filter((c) => c.gapRef !== index)
      .map((c) => (c.gapRef > index ? { ...c, gapRef: c.gapRef - 1 } : c)),
  }
}

/** 被删 gap 索引集合 → causes 级联：挂在其上的删除，后方索引前移 */
function cascadeCauses(causes: CauseItem[], removedGapIdx: Set<number>): CauseItem[] {
  return causes
    .filter((c) => !removedGapIdx.has(c.gapRef))
    .map((c) => {
      let shift = 0
      for (const r of removedGapIdx) if (c.gapRef > r) shift += 1
      return shift ? { ...c, gapRef: c.gapRef - shift } : c
    })
}
