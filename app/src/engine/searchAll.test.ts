import { afterEach, describe, expect, it } from 'vitest'
import { searchAll } from './searchAll'
import { putItem } from '../db/collect'
import type { Item } from '../types/models'

function makeItem(id: string, over: Partial<Item>): Item {
  const now = new Date().toISOString()
  return {
    id, sourceId: 'src_x', sourceName: '测试源', url: 'https://a.com/p', title: '普通标题',
    summary: '普通摘要', fingerprint: `fp_${id}`, eventGroup: null, publishedAt: null,
    fetchedAt: now, stage: 'scored',
    score: { total: 50, source: 10, novelty: 10, relevance: 20, utility: 10 }, scoreReason: '', aiBy: 'rules',
    tags: [], otFlag: null, expiresAt: null,
    annotation: { notes: '', vote: null, keepForever: false, linkedReviewId: null },
    createdAt: now, updatedAt: now, schemaVersion: 1, ...over,
  }
}

afterEach(async () => {
  await dbTestClear()
})

async function dbTestClear(): Promise<void> {
  const { db } = await import('../db/schema')
  await db.items.clear()
}

describe('searchAll 正文级检索（G1 批：item.content 参与命中）', () => {
  it('词只在正文里、标题/摘要都没有 → 条目命中且带上下文片段', async () => {
    await putItem(makeItem('itm_c1', { content: '这篇讲的是仓储机器人夜间自主充电的调度策略细节。' }))
    const hits = await searchAll('自主充电')
    const itemHit = hits.find((h) => h.kind === 'item')
    expect(itemHit).toBeTruthy()
    expect(itemHit?.snippet).toContain('自主充电')
  })

  it('筛除层与已删除条目不参与正文命中', async () => {
    await putItem(makeItem('itm_c2', { stage: 'discarded', content: '仅有正文提到量子纠缠通信协议。' }))
    await putItem(makeItem('itm_c3', { deletedAt: '2026-11-01T00:00:00.000Z', content: '另一篇正文提到量子纠缠通信协议。' }))
    const hits = await searchAll('量子纠缠')
    expect(hits.filter((h) => h.kind === 'item')).toHaveLength(0)
  })
})
