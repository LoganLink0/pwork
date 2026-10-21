import { beforeEach, describe, expect, it } from 'vitest'
import { useCollect } from './collect'
import { putItem } from '../db/collect'
import { db } from '../db/schema'
import type { Item } from '../types/models'

/** 机会/威胁/趋势标记的切换顺序：未标记 → 机会 → 威胁 → 趋势 → 取消 */

function mk(over: Partial<Item> = {}): Item {
  const now = new Date().toISOString()
  return {
    id: `item_${Math.random().toString(36).slice(2, 8)}`,
    sourceId: 'src_t',
    sourceName: '测试源',
    url: `https://e.com/${Math.random().toString(36).slice(2, 6)}`,
    title: '标记切换测试条目',
    summary: '',
    fingerprint: `fp_${Math.random().toString(36).slice(2, 8)}`,
    eventGroup: null,
    publishedAt: null,
    fetchedAt: now,
    stage: 'scored',
    score: { total: 70, source: 1, novelty: 1, relevance: 0.5, utility: 0.3 },
    scoreReason: '',
    aiBy: 'rules',
    tags: [],
    otFlag: null,
    expiresAt: null,
    annotation: { notes: '', vote: null, keepForever: false, linkedReviewId: null },
    createdAt: now,
    updatedAt: now,
    schemaVersion: 1,
    ...over,
  }
}

describe('cycleOt 标记切换', () => {
  beforeEach(async () => {
    await db.items.clear()
    const s = useCollect.getState()
    s.digestDate = new Date().toISOString().slice(0, 10)
  })

  it('未标记 → 机会 → 威胁 → 趋势 → 取消（回到未标记）', async () => {
    const item = mk()
    await putItem(item)
    const cycle = useCollect.getState().cycleOt
    const flagOf = async () => (await db.items.get(item.id))?.otFlag

    await cycle(item.id)
    expect(await flagOf()).toBe('opportunity')
    await cycle(item.id)
    expect(await flagOf()).toBe('threat')
    await cycle(item.id)
    expect(await flagOf()).toBe('trend')
    await cycle(item.id)
    expect(await flagOf()).toBeNull()
  })
})

describe('页面跨天长开：日报日期自动翻篇（2026-10-21）', () => {
  beforeEach(async () => {
    await db.items.clear()
  })

  it('未手动选过日期 → load() 把停在昨天的 digestDate 翻到今天', async () => {
    const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10)
    useCollect.setState({ digestDate: yesterday, dateManuallySet: false })
    await useCollect.getState().load()
    expect(useCollect.getState().digestDate).toBe(new Date().toISOString().slice(0, 10))
  })

  it('手动选过历史日期 → load() 不强改（尊重用户的选择）', async () => {
    const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10)
    await useCollect.getState().setDigestDate(yesterday)
    expect(useCollect.getState().dateManuallySet).toBe(true)
    await useCollect.getState().load()
    expect(useCollect.getState().digestDate).toBe(yesterday)
  })
})
