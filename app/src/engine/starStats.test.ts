import { describe, expect, it } from 'vitest'
import { starStats } from './starStats'
import type { Item } from '../types/models'

/** 星级反馈统计（方案 A）：4–5 星条目的兴趣词/信源/主题域聚合 */

function mk(over: Partial<Item> & { stars: number; title: string; sourceId?: string; sourceName?: string; tags?: string[] }): Item {
  const now = new Date().toISOString()
  return {
    id: `item_${Math.random().toString(36).slice(2, 8)}`,
    sourceId: over.sourceId ?? 'src_a',
    sourceName: over.sourceName ?? '源甲',
    url: `https://e.com/${Math.random().toString(36).slice(2, 6)}`,
    title: over.title,
    summary: over.summary ?? '',
    fingerprint: `fp_${Math.random().toString(36).slice(2, 8)}`,
    eventGroup: null,
    publishedAt: null,
    fetchedAt: now,
    stage: 'kept',
    score: { total: 70, source: 1, novelty: 1, relevance: 0.5, utility: 0.3 },
    scoreReason: '',
    aiBy: 'rules',
    tags: over.tags ?? [],
    otFlag: null,
    expiresAt: null,
    annotation: { notes: '', stars: over.stars, keepForever: false, linkedReviewId: null },
    createdAt: now,
    updatedAt: now,
    schemaVersion: 1,
    deletedAt: null,
  }
}

const SOURCES = [
  { id: 'src_a', name: '源甲', domain: 'ai' },
  { id: 'src_b', name: '源乙', domain: 'frontend' },
]

describe('starStats', () => {
  it('空库 → 全零不报错', () => {
    const s = starStats([], ['AI 应用'], SOURCES)
    expect(s).toMatchObject({ rated: 0, avgStars: 0, high: 0 })
    expect(s.interestHits).toEqual([])
  })

  it('只有低分（≤3 星）→ 计入 rated/avg 但不进高分聚合', () => {
    const s = starStats(
      [mk({ stars: 2, title: 'AI 应用某工具发布' }), mk({ stars: 3, title: '普通条目' })],
      ['AI 应用'],
      SOURCES,
    )
    expect(s.rated).toBe(2)
    expect(s.avgStars).toBe(2.5)
    expect(s.high).toBe(0)
    expect(s.interestHits).toEqual([])
    expect(s.sources).toEqual([])
  })

  it('4–5 星条目聚合并按次数排序', () => {
    const items = [
      mk({ stars: 5, title: 'AI 应用开源工具发布', sourceId: 'src_a', sourceName: '源甲' }),
      mk({ stars: 4, title: 'AI 应用实践案例复盘', sourceId: 'src_a', sourceName: '源甲' }),
      mk({ stars: 5, title: '前端工程化教程', sourceId: 'src_b', sourceName: '源乙' }),
      mk({ stars: 1, title: 'AI 应用软文一条', sourceId: 'src_a', sourceName: '源甲' }),
    ]
    const s = starStats(items, ['AI 应用', '前端工程化'], SOURCES)
    expect(s.rated).toBe(4)
    expect(s.high).toBe(3)
    // 兴趣词：AI 应用 ×2 > 前端工程化 ×1；低分条目的命中不计入
    expect(s.interestHits[0]).toEqual({ label: 'AI 应用', count: 2 })
    expect(s.interestHits[1]).toEqual({ label: '前端工程化', count: 1 })
    // 信源：源甲 ×2 > 源乙 ×1
    expect(s.sources[0]).toEqual({ label: '源甲', count: 2 })
    // 主题域：ai ×2（1 星那条不计）> frontend ×1，显示中文名
    expect(s.domains[0]).toEqual({ label: 'AI', count: 2 })
    expect(s.domains.some((d) => d.label === '前端')).toBe(true)
  })

  it('信源表缺该条目的 sourceId 时回退 tags 里的域', () => {
    const s = starStats([mk({ stars: 5, title: '某开源工具发布', sourceId: 'src_x', tags: ['career'] })], [], SOURCES)
    expect(s.domains[0]).toEqual({ label: '职业', count: 1 })
  })
})
