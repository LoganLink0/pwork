import { describe, expect, it } from 'vitest'
import { discoverLeads } from './sourceDiscover'
import type { Item, Source } from '../types/models'

function item(url: string, fetchedAt: string): Item {
  return {
    id: `i_${Math.random().toString(36).slice(2)}`, sourceId: 's1', sourceName: 's1', url,
    title: `t-${url}`, summary: '', fingerprint: url, eventGroup: null, publishedAt: null, fetchedAt,
    stage: 'scored', score: { total: 0, source: 0, novelty: 0, relevance: 0, utility: 0 }, scoreReason: '', aiBy: 'rules',
    tags: [], otFlag: null, expiresAt: null, annotation: { notes: '', vote: null, keepForever: false, linkedReviewId: null },
    createdAt: fetchedAt, updatedAt: fetchedAt, schemaVersion: 1,
  }
}

const sources = [
  { id: 's1', url: 'https://feed1.example.com/rss' },
  { id: 's2', url: 'https://www.feed2.example.com/rss' },
] as unknown as Source[]

describe('discoverLeads', () => {
  const now = new Date('2026-11-01T12:00:00')
  const fresh = new Date(now.getTime() - 5 * 86_400_000).toISOString()
  const stale = new Date(now.getTime() - 60 * 86_400_000).toISOString()

  it('非订阅域名达到阈值才上榜，www 前缀归一', () => {
    const items = [
      item('https://blog.target.com/a', fresh),
      item('https://blog.target.com/b', fresh),
      item('https://www.blog.target.com/c', fresh),
      item('https://once.example.com/x', fresh),
    ]
    const leads = discoverLeads(items, sources, now)
    expect(leads).toHaveLength(1)
    expect(leads[0].domain).toBe('blog.target.com')
    expect(leads[0].count).toBe(3)
    expect(leads[0].samples).toHaveLength(2)
  })

  it('已订阅域名与其文章不算发现；30 天外不计；软删除不计', () => {
    const deleted = item('https://blog.target.com/d', fresh)
    deleted.deletedAt = fresh
    const items = [
      item('https://feed1.example.com/a', fresh),
      item('https://feed2.example.com/a', fresh),
      item('https://blog.target.com/e', stale),
      deleted,
    ]
    expect(discoverLeads(items, sources, now)).toHaveLength(0)
  })

  it('同注册域不算发现（yt-dlp 场景：feed 是 space.bilibili.com、条目是 www.bilibili.com）', () => {
    const ytdlpSources = [{ id: 's1', url: 'https://space.bilibili.com/946974/video' }] as unknown as Source[]
    const items = [
      item('https://www.bilibili.com/video/BV1', fresh),
      item('https://www.bilibili.com/video/BV2', fresh),
      item('https://www.bilibili.com/video/BV3', fresh),
    ]
    expect(discoverLeads(items, ytdlpSources, now)).toHaveLength(0)
  })
})
