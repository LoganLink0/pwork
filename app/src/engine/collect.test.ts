import { afterEach, describe, expect, it, vi } from 'vitest'
import { runCollect } from './collect'
import { createSource, listAllSources } from '../db/collect'
import { digestFor } from '../db/collect'
import { todayLocal } from './datetime'
import { DEFAULT_COLLECT_CONFIG } from '../content/collect'

const RSS_OK = (n: number) => `<?xml version="1.0"?><rss version="2.0"><channel>${Array.from(
  { length: n },
  (_, i) => `<item><title>AI 应用开源工具发布 第${i + 1}条</title><link>https://example.com/p${i}</link><description>可直接借鉴的实践案例 ${i}</description></item>`,
).join('')}</channel></rss>`

const RSS_DISCARDED = `<?xml version="1.0"?><rss version="2.0"><channel>
<item><title>某公司完成新一轮融资</title><link>https://example.com/funding</link><description>融资金额</description></item>
<item><title>太短</title><link>https://example.com/short</link><description></description></item>
</channel></rss>`

function mockFetch(map: Record<string, { status?: number; body?: string } | { error: 'network' }>) {
  return vi.fn(async (url: string) => {
    // 本地网关代理通路在测试环境不存在——模拟连接拒绝，让 fetchFeed 走 mock 的直连/转接路径
    if (url.includes('127.0.0.1:8788')) throw new TypeError('connect ECONNREFUSED')
    const hit = map[url]
    if (!hit) return new Response('not found', { status: 404 })
    if ('error' in hit) throw new TypeError('network error')
    return new Response(hit.body ?? '', { status: hit.status ?? 200 })
  })
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('runCollect 流水线（C1：Fetch → Dedup → PreFilter → 规则评分 → Top N）', () => {
  it('成功入库、规则评分、Top N 标 kept、health 重置', async () => {
    const url = 'https://a.com/rss'
    vi.stubGlobal('fetch', mockFetch({ [url]: { body: RSS_OK(12) } }))
    const src = await createSource({ name: '好源', url, domain: 'ai', tier: 1 })
    await runCollect([src], { ...DEFAULT_COLLECT_CONFIG, topN: 10 })

    const digest = await digestFor(todayLocal(), 10)
    expect(digest).toHaveLength(10) // 12 条 → Top 10 硬顶
    expect(digest.every((i) => i.stage === 'kept')).toBe(true)
    expect(digest[0]!.score.total).toBeGreaterThanOrEqual(80)
    expect(digest[0]!.aiBy).toBe('rules')
    expect(digest[0]!.scoreReason).toBeTruthy()
    const s = (await listAllSources()).find((x) => x.id === src.id)!
    expect(s.health.failStreak).toBe(0)
    expect(s.health.lastOkAt).toBeTruthy()
  })

  it('预筛：屏蔽词/过短 → discarded 且带 TTL', async () => {
    const url = 'https://b.com/rss'
    vi.stubGlobal('fetch', mockFetch({ [url]: { body: RSS_DISCARDED } }))
    const src = await createSource({ name: '杂源', url, domain: 'ai', tier: 2 })
    const summary = await runCollect([src], DEFAULT_COLLECT_CONFIG)
    expect(summary.totalNew).toBe(0)
    expect(summary.totalDiscarded).toBe(2)
    const digest = await digestFor(todayLocal(), 10)
    expect(digest).toHaveLength(0)
  })

  it('重复抓取：同条目 fingerprint 去重（第二次 0 新增）', async () => {
    const url = 'https://c.com/rss'
    vi.stubGlobal('fetch', mockFetch({ [url]: { body: RSS_OK(3) } }))
    const src = await createSource({ name: '稳定源', url, domain: 'ai', tier: 1 })
    const r1 = await runCollect([src], DEFAULT_COLLECT_CONFIG)
    const r2 = await runCollect([src], DEFAULT_COLLECT_CONFIG)
    expect(r1.totalNew).toBe(3)
    expect(r2.totalNew).toBe(0)
    expect(r2.results[0]!.duplicateCount).toBe(3)
  })

  it('失败源：failStreak 累计，第 3 次自动停用并置 inactive', async () => {
    const url = 'https://dead.com/rss'
    vi.stubGlobal('fetch', mockFetch({ [url]: { status: 500 } }))
    const src = await createSource({ name: '死源', url, domain: 'ai', tier: 2 })
    await runCollect([src], DEFAULT_COLLECT_CONFIG)
    await runCollect([src], DEFAULT_COLLECT_CONFIG)
    const r3 = await runCollect([src], DEFAULT_COLLECT_CONFIG)
    expect(r3.results[0]!.autoStopped).toBe(true)
    const s = (await listAllSources()).find((x) => x.id === src.id)!
    expect(s.active).toBe(false)
    expect(r3.results[0]!.error).toContain('500')
  })

  it('直连失败自动走 rss2json 转接（CORS 兜底）', async () => {
    const url = 'https://cors-blocked.com/rss'
    const via = `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(url)}`
    vi.stubGlobal(
      'fetch',
      mockFetch({
        [url]: { error: 'network' },
        [via]: {
          body: JSON.stringify({
            status: 'ok',
            items: [{ title: '转接来的 AI 应用条目', link: 'https://via.com/1', description: '描述', pubDate: '2026-08-30T08:00:00Z' }],
          }),
        },
      }),
    )
    const src = await createSource({ name: '转接源', url, domain: 'ai', tier: 1 })
    const r = await runCollect([src], DEFAULT_COLLECT_CONFIG)
    expect(r.totalNew).toBe(1)
    expect((await digestFor(todayLocal(), 10))[0]!.url).toBe('https://via.com/1')
  })
})
