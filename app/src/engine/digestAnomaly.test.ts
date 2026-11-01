import { describe, expect, it } from 'vitest'
import { topicAnomalies } from './digestAnomaly'
import type { Item } from '../types/models'

function item(title: string, fetchedAt: string): Item {
  return {
    id: `i_${Math.random().toString(36).slice(2)}`, sourceId: 's1', sourceName: 's1', url: 'https://a.example.com/x',
    title, summary: '', fingerprint: title, eventGroup: null, publishedAt: null, fetchedAt,
    stage: 'scored', score: { total: 0, source: 0, novelty: 0, relevance: 0, utility: 0 }, scoreReason: '', aiBy: 'rules',
    tags: [], otFlag: null, expiresAt: null, annotation: { notes: '', vote: null, keepForever: false, linkedReviewId: null },
    createdAt: fetchedAt, updatedAt: fetchedAt, schemaVersion: 1,
  }
}

function daysAgo(n: number): string {
  return new Date(new Date('2026-11-05T12:00:00').getTime() - n * 86_400_000).toISOString()
}

describe('topicAnomalies', () => {
  const localDateOf = (iso: string) => iso.slice(0, 10) // 测试用简化口径（种子统一 UTC 正午，无时区边界问题）

  it('当日远超基线 → 判异动；零基线不判；小幅波动不判', () => {
    const items: Item[] = []
    // 基线：过去 30 天里隔天 1 条（基线 ≈ 0.5/天）
    for (let d = 1; d <= 30; d += 2) items.push(item(`AI 智能体进展 ${d}`, daysAgo(d)))
    // 当日 4 条（≥3 且 ≈8 倍基线）→ 异动
    for (let i = 0; i < 4; i++) items.push(item(`AI 智能体今日快讯 ${i}`, daysAgo(0)))
    const anomalies = topicAnomalies(items, ['AI 智能体'], '2026-11-05', localDateOf)
    expect(anomalies).toHaveLength(1)
    expect(anomalies[0].today).toBe(4)
  })

  it('当日只有零星一两条 → 不判异动', () => {
    const items: Item[] = []
    for (let d = 1; d <= 30; d += 2) items.push(item(`AI 智能体进展 ${d}`, daysAgo(d)))
    items.push(item('AI 智能体今日快讯', daysAgo(0)))
    expect(topicAnomalies(items, ['AI 智能体'], '2026-11-05', localDateOf)).toHaveLength(0)
  })

  it('从没出现过的主题（零基线）→ 不判异动', () => {
    const items = [item('量子计算突破', daysAgo(0)), item('量子计算突破续', daysAgo(0)), item('量子计算突破三', daysAgo(0)), item('量子计算突破四', daysAgo(0))]
    expect(topicAnomalies(items, ['量子计算'], '2026-11-05', localDateOf)).toHaveLength(0)
  })

  it('兴趣域为空 → 空结果', () => {
    expect(topicAnomalies([item('随便', daysAgo(0))], [], '2026-11-05', localDateOf)).toHaveLength(0)
  })
})
