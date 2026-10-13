import { afterEach, describe, expect, it, vi } from 'vitest'
import { gatewaySearchConfigured, gatewayWebSearch } from './webSearch'

afterEach(() => vi.unstubAllGlobals())

describe('联网搜索客户端（网关 /search）', () => {
  it('成功：归一化返回结果列表', async () => {
    const spy = vi.fn(async (_url: unknown, _init?: unknown) =>
      new Response(JSON.stringify({ ok: true, results: [{ title: 'A', link: 'https://a.com', content: '摘要A' }] }), { status: 200 }),
    )
    vi.stubGlobal('fetch', spy)
    const hits = await gatewayWebSearch('http://127.0.0.1:8788', '测试查询', 4)
    expect(hits).toEqual([{ title: 'A', link: 'https://a.com', content: '摘要A' }])
    const init = spy.mock.calls[0]![1] as RequestInit
    const body = JSON.parse(String(init.body))
    expect(body.query).toBe('测试查询')
    expect(body.count).toBe(4)
  })

  it('上游错误（如余额不足）→ 抛出明确原因', async () => {
    vi.stubGlobal('fetch', vi.fn(async () =>
      new Response(JSON.stringify({ ok: false, error: '搜索上游 502：余额不足或无可用资源包' }), { status: 502 }),
    ))
    await expect(gatewayWebSearch('http://127.0.0.1:8788', 'q')).rejects.toThrow('余额不足')
  })

  it('网关未配置搜索 → health 返回 false', async () => {
    vi.stubGlobal('fetch', vi.fn(async () =>
      new Response(JSON.stringify({ ok: true, chatConfigured: true, searchConfigured: false }), { status: 200 }),
    ))
    expect(await gatewaySearchConfigured('http://127.0.0.1:8788')).toBe(false)
  })

  it('health 探测失败（网关没起）→ 按未配置降级，不抛错', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new Error('ECONNREFUSED'))))
    expect(await gatewaySearchConfigured('http://127.0.0.1:8788')).toBe(false)
  })
})
