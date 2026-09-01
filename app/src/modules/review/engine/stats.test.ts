import { describe, expect, it } from 'vitest'
import { insightTimeline, monthlyTrend, scenarioDistribution, topPatterns } from './stats'
import { emptyClap, type InsightRecord, type ReviewRecord } from '../types/models'

function makeReview(id: string, createdAt: string, deltas: ('up' | 'down' | 'zero' | 'new' | 'gone')[] = []): ReviewRecord {
  const clap = emptyClap()
  clap.comparison.gaps = deltas.map((delta, i) => ({ goalRef: i, resultRef: i, delta, good: delta !== 'down' && delta !== 'gone' }))
  return {
    id,
    type: 'personal',
    scenario: 'weekly',
    templateId: 'personal-weekly',
    title: id,
    createdAt,
    updatedAt: createdAt,
    status: 'archived',
    quick: false,
    clap,
    summary: [],
  }
}

function makeInsight(id: string, createdAt: string, text = id, patternGroup = id): InsightRecord {
  return {
    id,
    reviewId: 'r',
    text,
    tags: [],
    kind: 'inductive',
    verified: false,
    patternGroup,
    createdAt,
    revisit: [],
  }
}

describe('月度趋势', () => {
  const now = new Date(2026, 7, 29) // 2026-08 本地

  it('返回 6 个桶且最后一个是当前月', () => {
    const trend = monthlyTrend([], [], 6, now)
    expect(trend).toHaveLength(6)
    expect(trend[5].month).toBe('2026-08')
    expect(trend[0].month).toBe('2026-03')
  })

  it('复盘/洞察/达成分档各自归入正确月份', () => {
    const reviews = [
      makeReview('r1', '2026-08-05T00:00', ['up', 'down']),
      makeReview('r2', '2026-06-05T00:00', ['zero', 'gone', 'new']),
    ]
    const insights = [makeInsight('i1', '2026-07-05T00:00')]
    const trend = monthlyTrend(reviews, insights, 6, now)
    const aug = trend.find((b) => b.month === '2026-08')!
    const jun = trend.find((b) => b.month === '2026-06')!
    const jul = trend.find((b) => b.month === '2026-07')!
    expect(aug.reviews).toBe(1)
    expect(aug.met).toBe(1)
    expect(aug.missed).toBe(1)
    expect(jun.reviews).toBe(1)
    expect(jun.met).toBe(2)
    expect(jun.missed).toBe(1)
    expect(jul.insights).toBe(1)
  })

  it('窗口外的复盘不计入', () => {
    const reviews = [makeReview('r9', '2025-01-05T00:00')]
    const trend = monthlyTrend(reviews, [], 6, now)
    expect(trend.reduce((s, b) => s + b.reviews, 0)).toBe(0)
  })
})

describe('场景分布', () => {
  it('按场景计数并降序', () => {
    const a = makeReview('a', '2026-08-01T00:00')
    const b = { ...makeReview('b', '2026-08-01T00:00'), scenario: 'daily' as const }
    const c = { ...makeReview('c', '2026-08-01T00:00'), scenario: 'daily' as const }
    const slices = scenarioDistribution([a, b, c])
    expect(slices[0]).toEqual({ scenario: 'daily', label: '日复盘', count: 2 })
    expect(slices[1].count).toBe(1)
  })
})

describe('高频主题', () => {
  it('聚合同指纹洞察、按次数降序、可限制条数', () => {
    const insights = [
      makeInsight('i1', '2026-08-01T00:00', '缓冲时间', 'buffer'),
      makeInsight('i2', '2026-08-02T00:00', '留缓冲', 'buffer'),
      makeInsight('i3', '2026-08-03T00:00', '要留缓冲', 'buffer'),
      makeInsight('i4', '2026-08-04T00:00', '先说结论', 'conclusion'),
    ]
    const top = topPatterns(insights, 5)
    expect(top[0].count).toBe(3)
    expect(top[0].sample).toBe('缓冲时间')
    // 单次主题（先说结论）不入榜
    expect(top).toHaveLength(1)
  })

  it('单次主题不入榜（≥2 才算模式）', () => {
    const insights = [makeInsight('i1', '2026-08-01T00:00', '孤例', 'solo')]
    expect(topPatterns(insights, 5)).toEqual([])
  })
})

describe('认知时间线', () => {
  it('按月计数', () => {
    const insights = [
      makeInsight('i1', '2026-08-01T00:00'),
      makeInsight('i2', '2026-08-09T00:00'),
      makeInsight('i3', '2026-06-01T00:00'),
    ]
    const line = insightTimeline(insights, 6, new Date(2026, 7, 29))
    expect(line.find((x) => x.month === '2026-08')?.count).toBe(2)
    expect(line.find((x) => x.month === '2026-06')?.count).toBe(1)
  })
})
