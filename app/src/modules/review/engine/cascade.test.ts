import { describe, expect, it } from 'vitest'
import { removeGapAt, removeGoalAt, removeResultAt } from './cascade'

const gap = (goalRef: number, resultRef: number) => ({
  goalRef,
  resultRef,
  delta: 'down' as const,
  good: false,
})
const cause = (gapRef: number) => ({
  id: `c${gapRef}-${Math.random().toString(36).slice(2, 6)}`,
  text: `原因${gapRef}`,
  gapRef,
  controllability: 'full' as const,
  tool: 'none' as const,
  depth: [],
})

describe('删除目标的索引级联', () => {
  it('删除中间目标：gaps 引用前移，指向被删目标的差异被移除', () => {
    const { goals, gaps } = removeGoalAt([g('A'), g('B'), g('C')], [gap(0, 0), gap(2, 0), gap(1, 0)], [], 1)
    expect(goals.map((x) => x.text)).toEqual(['A', 'C'])
    // 三个差异分别指向 A(0)、C(2)、B(1)：指向 B 的被删除，指向 C 的前移为 1
    expect(gaps.map((x) => x.goalRef)).toEqual([0, 1])
  })

  it('删除第一个目标', () => {
    const { gaps } = removeGoalAt([g('A'), g('B')], [gap(0, 0), gap(1, 0)], [], 0)
    expect(gaps.map((x) => x.goalRef)).toEqual([0])
  })

  it('删除目标连带删除差异时，挂在被删差异上的原因一并删除、后方前移', () => {
    // 目标 0 上挂两个差异（gap0、gap1），原因分别挂 gap0/gap1/gap2（gap2 挂在目标 1 的差异上）
    const gaps = [gap(0, 0), gap(0, 0), gap(1, 0)]
    const causes = [cause(0), cause(1), cause(2)]
    const res = removeGoalAt([g('A'), g('B')], gaps, causes, 0)
    expect(res.gaps).toHaveLength(1)
    // 原因0/原因1 随 gap0/gap1 删除；原因2 从 gap2 前移到 gap0
    expect(res.causes.map((c) => c.gapRef)).toEqual([0])
  })
})

describe('删除结果的索引级联', () => {
  it('与目标同理处理 resultRef', () => {
    const { results, gaps } = removeResultAt([r('X'), r('Y')], [gap(0, 0), gap(0, 1)], [], 0)
    expect(results).toHaveLength(1)
    expect(gaps.map((x) => x.resultRef)).toEqual([0])
  })

  it('删除结果连带删除差异时，原因同步级联', () => {
    // gap0 挂 result0；gap1/gap2 挂 result1。删 result0 → gap0 被删，gap1/gap2 前移为 0/0（goalRef 不变）
    const res = removeResultAt([r('X'), r('Y')], [gap(0, 0), gap(0, 1), gap(1, 1)], [cause(0), cause(1), cause(2)], 0)
    expect(res.gaps.map((x) => x.resultRef)).toEqual([0, 0])
    // 原因0 随 gap0 删除；原因1 从 gap1 前移为 0；原因2 从 gap2 前移为 1
    expect(res.causes.map((c) => c.gapRef)).toEqual([0, 1])
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
