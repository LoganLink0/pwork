/**
 * 删除目标/结果/差距时的索引级联（体检发现的 Bug 1 修复）。
 * 之前直接 filter 会留下悬空引用：gaps 的 goalRef/resultRef 指错行，
 * causes 的 gapRef 悬空后原因在界面上永远不再显示（隐形丢数据）。
 * 全部纯函数，便于单测。
 */
import type { CauseItem, GapItem, GoalItem, ResultItem } from '../types/models'

export function removeGoalAt(
  goals: GoalItem[],
  gaps: GapItem[],
  index: number,
): { goals: GoalItem[]; gaps: GapItem[] } {
  return {
    goals: goals.filter((_, i) => i !== index),
    gaps: gaps
      .filter((g) => g.goalRef !== index)
      .map((g) => (g.goalRef > index ? { ...g, goalRef: g.goalRef - 1 } : g)),
  }
}

export function removeResultAt(
  results: ResultItem[],
  gaps: GapItem[],
  index: number,
): { results: ResultItem[]; gaps: GapItem[] } {
  return {
    results: results.filter((_, i) => i !== index),
    gaps: gaps
      .filter((g) => g.resultRef !== index)
      .map((g) => (g.resultRef > index ? { ...g, resultRef: g.resultRef - 1 } : g)),
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
