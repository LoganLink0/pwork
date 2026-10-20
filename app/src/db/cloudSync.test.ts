import { beforeEach, describe, expect, it, vi } from 'vitest'
import { cloudConfigured, loadCloudConfig, saveCloudConfig, syncFromCloud } from './cloudSync'
import { db } from './schema'

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()))
  localStorage.clear()
  vi.unstubAllGlobals()
})

describe('cloudSync（W4/C2 本地拉取端）', () => {
  it('未配置端点 → 明确报错', async () => {
    const r = await syncFromCloud()
    expect(r.ok).toBe(false)
    expect(r.error).toContain('未配置')
  })

  it('拉取合并：新条目入库、同指纹跳过、serverTime 记录水位', async () => {
    saveCloudConfig({ mode: 'endpoint', endpoint: 'https://w.example', token: 'tk', accountId: '', databaseId: '' })
    const item = (id: string, fp: string) => ({
      cloudId: id, sourceId: 'src', sourceName: '源', url: `https://e.com/${id}`, title: `标题${id}`,
      summary: '', fingerprint: fp, publishedAt: null, fetchedAt: '2026-08-31T08:00:00.000Z', stage: 'scored',
      score: { total: 70, source: 1, novelty: 1, relevance: 0.5, utility: 0.3 }, scoreReason: 'r', aiBy: 'rules',
      tags: [], otFlag: null,
    })
    vi.stubGlobal('fetch', vi.fn(async () =>
      new Response(JSON.stringify({ serverTime: '2026-08-31T09:00:00.000Z', items: [item('a', 'fp_a'), item('b', 'fp_b')] }), { status: 200 }),
    ))
    const r1 = await syncFromCloud()
    expect(r1.ok).toBe(true)
    expect(r1.newCount).toBe(2)
    expect(localStorage.getItem('pwork-cloud-lastsync')).toBe('2026-08-31T09:00:00.000Z')
    expect(loadCloudConfig().endpoint).toBe('https://w.example')

    // 同指纹再拉 → 跳过（本地有标注/编辑不被覆盖）
    vi.stubGlobal('fetch', vi.fn(async () =>
      new Response(JSON.stringify({ serverTime: '2026-08-31T10:00:00.000Z', items: [item('a', 'fp_a')] }), { status: 200 }),
    ))
    const r2 = await syncFromCloud()
    expect(r2.newCount).toBe(0)
    expect(r2.skipCount).toBe(1)
  })

  it('HTTP 500 → 失败带原因', async () => {
    saveCloudConfig({ mode: 'endpoint', endpoint: 'https://w.example', token: '', accountId: '', databaseId: '' })
    vi.stubGlobal('fetch', vi.fn(async () => new Response('x', { status: 500 })))
    const r = await syncFromCloud()
    expect(r.ok).toBe(false)
    expect(r.error).toContain('500')
  })
})

describe('D1 直连模式（大陆网络绕过 workers.dev）', () => {
  it('经本地网关代理查询 D1 并按 snake_case 映射入库', async () => {
    saveCloudConfig({ mode: 'd1', endpoint: '', token: 'cf-token', accountId: 'acc1', databaseId: 'db1' })
    const row = {
      id: 'cloud_1', source_id: 'src_1', source_name: 'HNRSS', url: 'https://e.com/x', title: 'AI 应用开源工具发布',
      summary: '摘要', fingerprint: 'fp_d1', published_at: null, fetched_at: '2026-08-31T08:00:00.000Z', stage: 'scored',
      score_total: 77, score_source: 0.7, score_novelty: 1, score_relevance: 0.34, score_utility: 0.4,
      score_reason: '源0.7·新信息', ai_by: 'deepseek-chat', tags: '["AI"]', ot_flag: 'opportunity',
    }
    const calls: string[] = []
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: { body?: string }) => {
      calls.push(url)
      const payload = JSON.parse(init!.body!)
      expect(payload.sql).toContain('fetched_at > ?')
      return new Response(JSON.stringify({ success: true, result: [{ results: [row] }] }), { status: 200 })
    }))
    const r = await syncFromCloud()
    expect(r.ok).toBe(true)
    expect(r.newCount).toBe(1)
    // 2026-10-20 起 D1 查询先走本地网关代理（api.cloudflare.com 无 CORS 头，浏览器直连必被拦）
    expect(calls[0]).toBe('http://127.0.0.1:8788/d1/query')
    const stored = await db.items.where('fingerprint').equals('fp_d1').first()
    expect(stored?.title).toBe('AI 应用开源工具发布')
    expect(stored?.otFlag).toBe('opportunity')
    expect(stored?.score.total).toBe(77)
  })

  it('网关不在 → 回退直连 api.cloudflare.com', async () => {
    saveCloudConfig({ mode: 'd1', endpoint: '', token: 'cf-token', accountId: 'acc1', databaseId: 'db1' })
    const calls: string[] = []
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      calls.push(url)
      if (String(url).includes('127.0.0.1:8788')) throw new TypeError('Failed to fetch')
      return new Response(JSON.stringify({ success: true, result: [{ results: [] }] }), { status: 200 })
    }))
    const r = await syncFromCloud()
    expect(r.ok).toBe(true)
    expect(calls[1]).toContain('/accounts/acc1/d1/database/db1/query')
  })

  it('D1 缺配置 → 明确报错', async () => {
    saveCloudConfig({ mode: 'd1', endpoint: '', token: '', accountId: '', databaseId: '' })
    const r = await syncFromCloud()
    expect(r.ok).toBe(false)
    expect(r.error).toContain('D1 直连需要')
  })
})

describe('cloudConfigured（打开应用自动同步的门槛，2026-10-12）', () => {
  it('全空 → false（未配置不自动拉，普通用户零打扰）', () => {
    expect(cloudConfigured()).toBe(false)
  })

  it('端点模式：只看端点是否非空', () => {
    saveCloudConfig({ mode: 'endpoint', endpoint: 'https://w.example', token: '', accountId: '', databaseId: '' })
    expect(cloudConfigured()).toBe(true)
  })

  it('D1 模式：三项缺一 → false；填齐 → true', () => {
    saveCloudConfig({ mode: 'd1', endpoint: '', token: 'tk', accountId: 'acc', databaseId: '' })
    expect(cloudConfigured()).toBe(false)
    saveCloudConfig({ mode: 'd1', endpoint: '', token: 'tk', accountId: 'acc', databaseId: 'db' })
    expect(cloudConfigured()).toBe(true)
  })
})
