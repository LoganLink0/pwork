/**
 * 闭环率唯一实现（2026-11-16 外部审查报告 P0：同一指标曾在待办页/周报/数据卡片
 * 三处各算各的，20% 与 14% 并存）。口径（用户拍板）：
 *   分母 = 全部未完成 + 已完成（搁置/放弃计入分母，不剔除）
 *   分子 = 已完成
 * 注意：周报场景传「窗口内」的 done/open/dropped 计数，全量场景传库级计数——
 * 公式唯一，统计范围由调用方决定。
 */
export function computeClosureRate(doneCount: number, openCount: number): number {
  const denominator = doneCount + openCount
  if (denominator === 0) return 0
  return Math.round((doneCount / denominator) * 100)
}
