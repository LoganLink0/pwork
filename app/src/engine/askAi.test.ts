import { beforeEach, describe, expect, it } from 'vitest'
import { pickBlocks } from './askAi'
import { db } from '../db/schema'
import { searchAll } from './searchAll'

/** AI 全库问答（0.4-4）：上下文装配纯函数 + 检索正文级命中。AI 真调用走真机验证 */

beforeEach(async () => {
  await Promise.all([db.notes.clear(), db.items.clear(), db.insights.clear(), db.tasks.clear(), db.reviews.clear()])
})

describe('pickBlocks（上下文装配）', () => {
  it('编号连续、空文本跳过', () => {
    const blocks = pickBlocks(['第一条', '', '第二条'])
    expect(blocks).toEqual(['[1] 第一条', '[2] 第二条'])
  })
  it('超长单条截断到单条预算', () => {
    const blocks = pickBlocks(['x'.repeat(2000)], 4000, 600)
    expect(blocks[0]!.length).toBeLessThanOrEqual(600 + 5) // [n] 前缀 + 省略号
    expect(blocks[0]!.endsWith('…')).toBe(true)
  })
  it('总预算约束：装不下的整块放弃', () => {
    const blocks = pickBlocks(['a'.repeat(500), 'b'.repeat(500), 'c'.repeat(500)], 1100, 600)
    expect(blocks).toHaveLength(2)
  })
})

describe('searchAll 正文级命中（0.4-4 升级）', () => {
  it('速记正文命中返回 snippet；条目摘要命中；标题命中不带 snippet', async () => {
    await db.notes.put({
      id: 'n1', title: '', body: `随手记的一段开场的铺垫内容，先把上下文写长一点。${'背景补充。'.repeat(4)}昨晚跟张三聊了季度目标的拆解方式`, tags: [],
      links: { itemIds: [], reviewIds: [], taskIds: [] }, source: 'manual',
      createdAt: '2026-10-29T00:00:00.000Z', updatedAt: '2026-10-29T00:00:00.000Z', deletedAt: null, schemaVersion: 1,
    })
    await db.items.put({
      id: 'i1', sourceId: 's1', sourceName: '源', url: 'https://x.com/1', title: '无关标题',
      summary: '文中提到嵌入索引的落地路径', fingerprint: 'fp1', eventGroup: null, publishedAt: null,
      fetchedAt: '2026-10-29T00:00:00.000Z', stage: 'kept',
      score: { total: 0, source: 0, novelty: 0, relevance: 0, utility: 0 }, scoreReason: '', aiBy: 'rules',
      tags: [], otFlag: null, expiresAt: null, annotation: { notes: '', vote: null, keepForever: false, linkedReviewId: null },
      createdAt: '2026-10-29T00:00:00.000Z', updatedAt: '2026-10-29T00:00:00.000Z', schemaVersion: 1,
    })
    const hits = await searchAll('季度目标')
    const noteHit = hits.find((h) => h.kind === 'note')
    expect(noteHit).toBeDefined()
    expect(noteHit!.snippet).toContain('季度目标')

    const itemHits = await searchAll('嵌入索引')
    expect(itemHits.find((h) => h.kind === 'item')).toBeDefined()

    const titleHits = await searchAll('无关标题')
    expect(titleHits.find((h) => h.kind === 'item')?.snippet).toBeUndefined()
  })

  it('软删除的速记不参与命中', async () => {
    await db.notes.put({
      id: 'n2', title: '秘密项目', body: '', tags: [],
      links: { itemIds: [], reviewIds: [], taskIds: [] }, source: 'manual',
      createdAt: '2026-10-29T00:00:00.000Z', updatedAt: '2026-10-29T00:00:00.000Z',
      deletedAt: '2026-10-29T01:00:00.000Z', schemaVersion: 1,
    })
    const hits = await searchAll('秘密项目')
    expect(hits.find((h) => h.kind === 'note')).toBeUndefined()
  })
})
