import { describe, expect, it } from 'vitest'
import { obsidianDaily } from './obsidian'
import type { Item } from '../types/models'

function mkItem(over: Partial<Item> = {}): Item {
  const now = '2026-08-31T08:00:00.000Z'
  return {
    id: 'itm_t',
    sourceId: 'src_t',
    sourceName: '少数派',
    url: 'https://sspai.com/1',
    title: 'AI 应用开源工具发布',
    summary: '摘要文本',
    fingerprint: 'fp',
    eventGroup: null,
    publishedAt: null,
    fetchedAt: now,
    stage: 'kept',
    score: { total: 82, source: 1, novelty: 1, relevance: 0.5, utility: 0.4 },
    scoreReason: '源1.0·新信息',
    aiBy: 'rules',
    tags: ['AI 应用'],
    otFlag: 'opportunity',
    expiresAt: null,
    annotation: { notes: '', vote: null, keepForever: false, linkedReviewId: null },
    createdAt: now,
    updatedAt: now,
    schemaVersion: 1,
    ...over,
  }
}

describe('obsidianDaily（04 §6.2 vault 日报格式）', () => {
  it('frontmatter + 条目块（来源/标签/OT/想法占位；2026-10-20 起不带评分数字）', () => {
    const md = obsidianDaily([mkItem()], '2026-08-31')
    expect(md).toContain('---')
    expect(md).toContain('date: 2026-08-31')
    expect(md).toContain('count: 1')
    expect(md).toContain('sources: ["少数派"]')
    expect(md).toContain('### 1. [AI 应用开源工具发布](https://sspai.com/1)')
    expect(md).toContain('来源：少数派 ｜ #AI 应用 ｜ 🎯机会')
    expect(md).toContain('> 我的想法：')
    expect(md).not.toContain('评分')
  })

  it('无条目 → 引导占位', () => {
    const md = obsidianDaily([], '2026-08-31')
    expect(md).toContain('今日无条目')
  })

  it('多来源去重列于 sources', () => {
    const md = obsidianDaily([mkItem(), mkItem({ id: 'b', sourceName: 'Hacker News', otFlag: null })], '2026-08-31')
    expect(md).toContain('sources: ["少数派", "Hacker News"]')
    expect(md).toContain('### 2. ')
  })
})
