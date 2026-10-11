import { describe, expect, it } from 'vitest'
import { starAdvice } from './starAdvice'
import type { StarStats } from './starStats'
import type { CollectConfig } from '../types/models'

/** 调参建议（方案 B）：统计 → 可解释建议 → 可采纳的权重补丁 */

const CONFIG: CollectConfig = {
  interests: ['AI 应用'],
  dislikes: [],
  context: '',
  topN: 10,
  weights: { source: 0.3, novelty: 0.25, relevance: 0.25, utility: 0.2 },
}

function stats(over: Partial<StarStats>): StarStats {
  return { rated: 0, avgStars: 0, high: 0, interestHits: [], sources: [], domains: [], ...over }
}

describe('starAdvice', () => {
  it('没打过星 → 无建议', () => {
    expect(starAdvice(stats({}), CONFIG)).toEqual([])
  })

  it('高分≥3 且零兴趣命中 → 提示补锚（无可采纳补丁）', () => {
    const list = starAdvice(stats({ rated: 5, high: 3, interestHits: [] }), CONFIG)
    const a = list.find((x) => x.id === 'anchor-missing')
    expect(a).toBeDefined()
    expect(a!.apply).toBeUndefined()
    expect(a!.text).toContain('兴趣词')
  })

  it('高分集中在单一信源（≥60%）→ 上调 source +5pp，并给信源页入口', () => {
    const list = starAdvice(
      stats({ rated: 6, high: 5, sources: [{ label: '量子位', count: 4 }] }),
      CONFIG,
    )
    const a = list.find((x) => x.id === 'source-undervalued')
    expect(a).toBeDefined()
    expect(a!.apply?.weights?.source).toBeCloseTo(0.35)
    expect(a!.goTo).toBe('/input/sources')
  })

  it('打星多但高分占比≤20% → 下调 relevance，且不低于 0', () => {
    const list = starAdvice(stats({ rated: 10, high: 1 }), CONFIG)
    const a = list.find((x) => x.id === 'relevance-overvalued')
    expect(a).toBeDefined()
    expect(a!.apply?.weights?.relevance).toBeCloseTo(0.2)
    // 权重已很低时不再建议下调
    const low = starAdvice(stats({ rated: 10, high: 1 }), { ...CONFIG, weights: { source: 0.4, novelty: 0.3, relevance: 0.1, utility: 0.2 } })
    expect(low.find((x) => x.id === 'relevance-overvalued')).toBeUndefined()
  })

  it('样本不足（高分<4 但集中）→ 不给信源建议', () => {
    const list = starAdvice(stats({ rated: 3, high: 3, sources: [{ label: '某源', count: 3 }] }), CONFIG)
    expect(list.find((x) => x.id === 'source-undervalued')).toBeUndefined()
  })
})
