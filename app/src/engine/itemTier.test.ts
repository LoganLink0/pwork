import { describe, expect, it } from 'vitest'
import { alignmentStats, itemTiers } from './itemTier'
import { newId } from '../db/repo'
import type { Item } from '../types/models'

function mk(day: string, total: number, over: Partial<Item> = {}): Item {
  return {
    id: newId('itm'),
    sourceId: 's',
    sourceName: '源',
    url: `https://a.com/${newId('x')}`,
    title: '标题足够长的条目',
    summary: '',
    fingerprint: newId('fp'),
    eventGroup: null,
    publishedAt: null,
    fetchedAt: `${day}T10:00:00.000Z`,
    stage: 'scored',
    score: { total, source: 1, novelty: 1, relevance: 0.5, utility: 0.3 },
    scoreReason: 'r',
    aiBy: 'rules',
    tags: [],
    otFlag: null,
    expiresAt: null,
    annotation: { notes: '', vote: null, keepForever: false, linkedReviewId: null },
    createdAt: `${day}T10:00:00.000Z`,
    updatedAt: `${day}T10:00:00.000Z`,
    schemaVersion: 1,
    ...over,
  }
}

describe('itemTiers（同日排名分层：前 2 必看 / 3–8 可看 / 其余可略）', () => {
  it('同日按分数降序排名；跨日各自排名', () => {
    const d1 = ['2026-10-20', '2026-10-19']
    const items = [
      mk(d1[0], 68), mk(d1[0], 74), mk(d1[0], 60), mk(d1[0], 55), mk(d1[0], 50),
      mk(d1[1], 70), mk(d1[1], 65),
    ]
    // 10-20 排名：74→must, 68→must, 60→may, 55→may, 50→may；10-19：70→must, 65→must
    const t = itemTiers(items)
    const by = (i: Item) => t.get(i.id)
    expect(by(items[1])).toBe('must') // 74
    expect(by(items[0])).toBe('must') // 68
    expect(by(items[2])).toBe('may') // 60（第 3 名）
    expect(by(items[4])).toBe('may') // 50（第 5 名）
    expect(by(items[5])).toBe('must') // 次日 70
    expect(by(items[6])).toBe('must') // 次日 65
  })

  it('第九名起为可略；已筛除/已删除不参与排名', () => {
    const day = '2026-10-20'
    const items = Array.from({ length: 10 }, (_, i) => mk(day, 90 - i))
    items.push(mk(day, 99, { stage: 'discarded' }))
    items.push(mk(day, 99, { deletedAt: new Date().toISOString() }))
    const t = itemTiers(items)
    expect(t.size).toBe(10)
    expect([...t.values()].filter((v) => v === 'must')).toHaveLength(2)
    expect([...t.values()].filter((v) => v === 'may')).toHaveLength(6)
    expect([...t.values()].filter((v) => v === 'skip')).toHaveLength(2)
  })

  it('alignmentStats：只统计近 30 天 vote=want 的条目；无投票返回 null', () => {
    const today = new Date().toISOString().slice(0, 10)
    const old = new Date(Date.now() - 40 * 86_400_000).toISOString().slice(0, 10)
    const want = { notes: '', vote: 'want' as const, keepForever: false, linkedReviewId: null }
    const no = { notes: '', vote: 'no' as const, keepForever: false, linkedReviewId: null }
    const items = [
      { ...mk(today, 90), annotation: want },
      { ...mk(today, 85), annotation: want },
      { ...mk(today, 60), annotation: want },
      { ...mk(today, 55), annotation: no }, // 非想要不计
      { ...mk(old, 90), annotation: want }, // 超出 30 天窗口不计
    ]
    expect(alignmentStats(items)).toEqual({ want: 3, must: 2, may: 1, skip: 0 })
    expect(alignmentStats([items[3]!])).toBeNull()
  })

  it('同分时按抓取时间先后稳定排序', () => {
    const day = '2026-10-20'
    const a = { ...mk(day, 68), fetchedAt: `${day}T08:00:00.000Z` }
    const b = { ...mk(day, 68), fetchedAt: `${day}T10:00:00.000Z` }
    const c = { ...mk(day, 68), fetchedAt: `${day}T07:00:00.000Z` }
    const t = itemTiers([b, a, c])
    expect(t.get(c.id)).toBe('must') // 07:00 最早 → 第 1
    expect(t.get(a.id)).toBe('must') // 08:00 → 第 2
    expect(t.get(b.id)).toBe('may') // 10:00 最晚 → 第 3
  })
})
