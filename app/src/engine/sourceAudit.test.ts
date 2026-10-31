import { describe, expect, it } from 'vitest'
import { auditOne, auditSources } from './sourceAudit'
import type { Item, Source } from '../types/models'

describe('auditOne 分类规则', () => {
  it('抓取不足 5 条 → 观察中，不下结论', () => {
    expect(auditOne(4, 4, 4, 0).verdict).toBe('young')
    expect(auditOne(0, 0, 0, 0).verdict).toBe('young')
  })
  it('互动充分且多推率达标 → 产出健康', () => {
    expect(auditOne(20, 10, 6, 2).verdict).toBe('good')
  })
  it('互动充分但多推率低 → 噪声偏高', () => {
    const r = auditOne(50, 12, 1, 9)
    expect(r.verdict).toBe('noisy')
    expect(r.advice).toContain('噪声偏高')
  })
  it('抓取不少但零互动 → 零命中', () => {
    expect(auditOne(30, 0, 0, 0).verdict).toBe('idle')
  })
  it('样本夹在中间（1-4 票）→ 观察中', () => {
    expect(auditOne(20, 3, 3, 0).verdict).toBe('young')
  })
})

function item(sourceId: string, fetchedAt: string, vote: 'want' | 'meh' | 'no' | null, url = 'https://a.example.com/x'): Item {
  return {
    id: `i_${Math.random().toString(36).slice(2)}`, sourceId, sourceName: sourceId, url,
    title: 't', summary: '', fingerprint: url, eventGroup: null, publishedAt: null, fetchedAt,
    stage: 'scored', score: { total: 0, parts: {} } as Item['score'], scoreReason: '', aiBy: 'rules',
    tags: [], otFlag: null, expiresAt: null, annotation: { notes: '', vote, keepForever: false, linkedReviewId: null },
    createdAt: fetchedAt, updatedAt: fetchedAt, schemaVersion: 1,
  }
}

function source(id: string, url: string): Source {
  return {
    id, name: id, url, domain: 'ai', tier: 1.5, weight: 0.7, active: true,
    health: { failStreak: 0, lastOkAt: null, lastError: null }, createdAt: '', updatedAt: '',
  } as unknown as Source
}

describe('auditSources 窗口与归属', () => {
  const now = new Date('2026-11-01T12:00:00')
  it('只统计 30 天内且未删除的条目', () => {
    const fresh = new Date(now.getTime() - 5 * 86_400_000).toISOString()
    const stale = new Date(now.getTime() - 60 * 86_400_000).toISOString()
    const items = [item('s1', fresh, 'want'), item('s1', stale, 'want'), item('s1', fresh, null)]
    items[2].deletedAt = fresh
    const audits = auditSources(items, [source('s1', 'https://s1.example.com/feed')], now)
    expect(audits[0].fetched).toBe(1)
    expect(audits[0].want).toBe(1)
  })
})
