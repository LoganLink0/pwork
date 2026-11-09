import { afterEach, describe, expect, it } from 'vitest'
import { askKeywords, searchAll, searchMulti } from './searchAll'
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

  it('Markdown 正文命中时预览片段不露记号（标题井号/加粗/行内代码，2026-11-10 自查）', async () => {
    await putItem(makeItem('itm_md1', { content: '## 部署要点\n\n把 **环境变量** 写进 `gateway.env` 再重启进程即可生效。' }))
    const hits = await searchAll('gateway.env')
    const itemHit = hits.find((h) => h.kind === 'item')
    expect(itemHit).toBeTruthy()
    expect(itemHit?.snippet).toContain('gateway.env')
    expect(itemHit?.snippet).not.toContain('##')
    expect(itemHit?.snippet).not.toContain('**')
    expect(itemHit?.snippet).not.toContain('`gateway.env`')
  })
})

describe('askKeywords 自然语言问句切词（2026-11-08 AI 问答空态根因修复）', () => {
  it('标点与填充词切分后得到 2-gram 实词：问句里含有库内容词', () => {
    const terms = askKeywords('我现在有哪些待办要做？')
    expect(terms).toContain('待办')
    expect(terms.every((t) => t.length >= 2)).toBe(true)
  })

  it('英文与数字版本号被标点切分后仍保留可用片段', () => {
    const terms = askKeywords('月之暗面开放 Kimi K3.1 Pro 权重是怎么回事？')
    expect(terms).toContain('月之')
    expect(terms.some((t) => t.toLowerCase().startsWith('k3'))).toBe(true)
    expect(terms.some((t) => t.includes('权重'))).toBe(true)
  })

  it('整句即单词时直接返回该词（单词式提问零损耗）', () => {
    expect(askKeywords('测试')).toEqual(['测试'])
  })
})

describe('searchMulti 多词检索（askLibrary 的自然语言入口）', () => {
  it('问句含正文里的词 → 自然语言也能命中（修复前整句匹配必空）', async () => {
    await putItem(makeItem('itm_m1', { title: 'Kimi K3.1 权重开放', summary: '月之暗面开放 2.8 万亿参数权重。', content: '登顶 Agent Arena 开源模型榜。' }))
    const hits = await searchMulti('月之暗面开放 Kimi K3.1 Pro 权重是怎么回事？')
    const itemHit = hits.find((h) => h.kind === 'item' && h.id === 'itm_m1')
    expect(itemHit).toBeTruthy()
  })

  it('被更多词命中的实体排更前', async () => {
    await putItem(makeItem('itm_m2', { title: 'Kimi 开放权重', content: 'Kimi 开放权重细节说明。' }))
    await putItem(makeItem('itm_m3', { content: 'Kimi 相关的一条普通记录。' }))
    const hits = await searchMulti('Kimi 开放权重是怎么回事？')
    const ranked = hits.filter((h) => h.kind === 'item')
    expect(ranked[0]?.id).toBe('itm_m2')
    expect(ranked.indexOf(ranked.find((h) => h.id === 'itm_m3')!)).toBeGreaterThan(0)
  })
})
