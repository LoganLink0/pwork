import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '../db/schema'
import { createSource } from '../db/collect'
import { newId } from '../db/repo'
import { applySourceCredit, tierFromRate, voteStatsBySource } from './sourceCredit'
import type { Item } from '../types/models'

function mkItem(sourceId: string, vote: 'want' | 'meh' | 'no' | null, dayOffset = 0): Item {
  const at = new Date(Date.now() - dayOffset * 86_400_000).toISOString()
  return {
    id: newId('itm'),
    sourceId,
    sourceName: '源',
    url: `https://a.com/${newId('x')}`,
    title: '标题足够长的条目内容',
    summary: '摘要',
    fingerprint: newId('fp'),
    eventGroup: null,
    publishedAt: null,
    fetchedAt: at,
    stage: 'scored',
    score: { total: 70, source: 1, novelty: 1, relevance: 0.5, utility: 0.3 },
    scoreReason: '源1.0·新信息',
    aiBy: 'rules',
    tags: [],
    otFlag: null,
    expiresAt: null,
    annotation: { notes: '', vote, keepForever: false, linkedReviewId: null },
    createdAt: at,
    updatedAt: at,
    schemaVersion: 1,
  }
}

beforeEach(async () => {
  await db.clearAll()
})

describe('tierFromRate（want 率 → 档位刻度）', () => {
  it('≥60% → T1；30–59% → T1.5；<30% → T2', () => {
    expect(tierFromRate(0.6)).toBe(1)
    expect(tierFromRate(0.95)).toBe(1)
    expect(tierFromRate(0.59)).toBe(1.5)
    expect(tierFromRate(0.3)).toBe(1.5)
    expect(tierFromRate(0.29)).toBe(2)
    expect(tierFromRate(0)).toBe(2)
  })
})

describe('voteStatsBySource（近 60 天投票统计）', () => {
  it('只统计有投票且未删除的近 60 天条目', () => {
    const items = [
      mkItem('s1', 'want'),
      mkItem('s1', 'want'),
      mkItem('s1', 'meh'),
      mkItem('s1', null), // 未投票不计
      { ...mkItem('s1', 'want'), deletedAt: new Date().toISOString() }, // 已删不计
      mkItem('s1', 'no', 70), // 超出 60 天不计
      mkItem('s2', 'no'),
    ]
    const stats = voteStatsBySource(items)
    expect(stats.get('s1')).toEqual({ rated: 3, want: 2 })
    expect(stats.get('s2')).toEqual({ rated: 1, want: 0 })
  })
})

describe('applySourceCredit（自动升降，样本保护）', () => {
  it('够样本且档位该变 → 写库并返回变更；样本不足/档位未变 → 不动', async () => {
    const good = await createSource({ name: '好源', url: 'https://good.com/rss', domain: 'ai', tier: 2 })
    const bad = await createSource({ name: '差源', url: 'https://bad.com/rss', domain: 'ai', tier: 1 })
    const thin = await createSource({ name: '样本少', url: 'https://thin.com/rss', domain: 'ai', tier: 1 })
    // 好源：8 票 7 want（87.5%）→ 应升 T1；差源：8 票 1 want（12.5%）→ 应降 T2；样本少：3 票全 want → 不动
    await db.items.bulkPut([
      ...Array.from({ length: 7 }, () => mkItem(good.id, 'want')),
      mkItem(good.id, 'meh'),
      mkItem(bad.id, 'want'),
      ...Array.from({ length: 7 }, () => mkItem(bad.id, 'no')),
      ...Array.from({ length: 3 }, () => mkItem(thin.id, 'want')),
    ])
    const changes = await applySourceCredit()
    expect(changes).toHaveLength(2)
    const goodChange = changes.find((c) => c.sourceId === good.id)!
    expect(goodChange.toTier).toBe(1)
    const badChange = changes.find((c) => c.sourceId === bad.id)!
    expect(badChange.toTier).toBe(2)
    // 档位与权重已同步写库
    const goodRow = await db.sources.get(good.id)
    expect(goodRow?.tier).toBe(1)
    expect(goodRow?.weight).toBe(1.0)
    const thinRow = await db.sources.get(thin.id)
    expect(thinRow?.tier).toBe(1) // 样本不足原档不动
    // 再跑一次：全部已到位 → 无变更
    expect(await applySourceCredit()).toHaveLength(0)
  })
})
