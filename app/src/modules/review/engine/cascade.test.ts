import { describe, expect, it } from 'vitest'
import { removeGapAt, removeGoalAt, removeResultAt } from './cascade'

const gap = (goalRef: number, resultRef: number) => ({
  goalRef,
  resultRef,
  delta: 'down' as const,
  good: false,
})
const cause = (gapRef: number) => ({
  id: `c${gapRef}`,
  text: `原因${gapRef}`,
  gapRef,
  controllability: 'full' as const,
  tool: 'none' as const,
  depth: [],
})

describe('删除目标的索引级联', () => {
  it('删除中间目标：gaps 引用前移，指向被删目标的差异被移除', () => {
    const { goals, gaps } = removeGoalAt([g('A'), g('B'), g('C')], [gap(0, 0), gap(2, 0), gap(1, 0)], 1)
    expect(goals.map((x) => x.text)).toEqual(['A', 'C'])
    // 三个差异分别指向 A(0)、C(2)、B(1)：指向 B 的被删除，指向 C 的前移为 1
    expect(gaps.map((x) => x.goalRef)).toEqual([0, 1])
  })

  it('删除第一个目标', () => {
    const { gaps } = removeGoalAt([g('A'), g('B')], [gap(0, 0), gap(1, 0)], 0)
    expect(gaps.map((x) => x.goalRef)).toEqual([0])
  })
})

describe('删除结果的索引级联', () => {
  it('与目标同理处理 resultRef', () => {
    const { results, gaps } = removeResultAt([r('X'), r('Y')], [gap(0, 0), gap(0, 1)], 0)
    expect(results).toHaveLength(1)
    expect(gaps.map((x) => x.resultRef)).toEqual([0])
  })
})

describe('删除差距的原因级联', () => {
  it('挂在被删差距上的原因一并删除，其余原因 gapRef 前移', () => {
    const { gaps, causes } = removeGapAt([gap(0, 0), gap(1, 0), gap(2, 0)], [cause(0), cause(1), cause(2), cause(1)], 1)
    expect(gaps).toHaveLength(2)
    // 原因1、原因1(第二条) 随差距1删除；原因2 前移为 1
    expect(causes.map((c) => c.gapRef)).toEqual([0, 1])
  })
})

function g(text: string) {
  return { text, lockedAt: '', source: 'manual' as const }
}
function r(text: string) {
  return { text }
}
