import { afterEach, describe, expect, it, vi } from 'vitest'
import { parseFeed, fetchFeed } from './rss'

const RSS_SAMPLE = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel>
  <title>示例源</title>
  <item>
    <title>新模型开源并商用可用</title>
    <link>https://example.com/a?utm_source=rss</link>
    <description>&lt;p&gt;某实验室开源新模型，&lt;b&gt;商用许可&lt;/b&gt;宽松。&lt;/p&gt;</description>
    <pubDate>Sun, 30 Aug 2026 08:00:00 GMT</pubDate>
  </item>
  <item>
    <title><![CDATA[独立开发者增长打法复盘]]></title>
    <link>https://example.com/b</link>
    <description>三个真实案例拆解。</description>
  </item>
</channel></rss>`

const ATOM_SAMPLE = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Atom 示例</title>
  <entry>
    <title>Atom 条目一</title>
    <link rel="alternate" href="https://example.com/atom/1"/>
    <summary>摘要内容</summary>
    <published>2026-08-30T08:00:00Z</published>
  </entry>
</feed>`

describe('parseFeed', () => {
  it('解析 RSS 2.0：标题/链接/摘要去标签/日期', () => {
    const r = parseFeed(RSS_SAMPLE)
    expect(r.ok).toBe(true)
    expect(r.items).toHaveLength(2)
    const [a, b] = r.items
    expect(a!.title).toBe('新模型开源并商用可用')
    expect(a!.url).toBe('https://example.com/a?utm_source=rss')
    expect(a!.summary).toContain('商用许可')
    expect(a!.summary).not.toContain('<')
    expect(a!.publishedAt).toBeTruthy()
    // CDATA 标题
    expect(b!.title).toBe('独立开发者增长打法复盘')
    expect(b!.publishedAt).toBeNull()
  })

  it('解析 Atom（link[href] 与 published）', () => {
    const r = parseFeed(ATOM_SAMPLE)
    expect(r.ok).toBe(true)
    expect(r.items[0]!.url).toBe('https://example.com/atom/1')
    expect(r.items[0]!.publishedAt).toBe('2026-08-30T08:00:00.000Z')
  })

  it('摘要截断到 200 字', () => {
    const long = 'x'.repeat(300)
    const xml = `<rss version="2.0"><channel><item><title>标题足够长</title><link>https://a.com/x</link><description>${long}</description></item></channel></rss>`
    const r = parseFeed(xml)
    expect(r.items[0]!.summary.length).toBeLessThanOrEqual(201)
    expect(r.items[0]!.summary.endsWith('…')).toBe(true)
  })

  it('非 XML / 空频道 / 缺链接 → ok:false 带原因', () => {
    expect(parseFeed('<html><body>hi</body></html>').ok).toBe(false)
    expect(parseFeed('<rss version="2.0"><channel></channel></rss>').ok).toBe(false)
    const noLink = `<rss version="2.0"><channel><item><title>只有标题</title></item></channel></rss>`
    expect(parseFeed(noLink).ok).toBe(false)
    expect(parseFeed(noLink).error).toContain('标题或链接')
  })
})

/** 抓取链的超时防护（2026-10 事故回归：读体中止曾炸穿 runCollect，按钮永久「抓取中」） */
describe('fetchFeed 读取响应体失败', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('响应头已到但 text() 中止 → ok:false 带原因，不抛异常', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        // 本地网关不通（毫秒级拒绝），落到直连路径触发读体中止场景
        if (String(input).includes('127.0.0.1:8788')) {
          throw new TypeError('connect ECONNREFUSED')
        }
        // 模拟：fetch 已拿到响应头（200），读体时超时信号触发
        const aborted = new DOMException('The user aborted a request.', 'AbortError')
        return {
          ok: true,
          status: 200,
          text: () => Promise.reject(aborted),
        } as unknown as Response
      }),
    )
    const r = await fetchFeed('https://example.com/feed.xml')
    expect(r.ok).toBe(false)
    expect(r.error).toContain('读取响应超时')
  })
})

/** 转接服务地址可自定义（2026-10：公共 rss2json 慢/限流时换自建） */
describe('fetchFeed 自定义转接地址', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('relayBase 生效：直连失败后走自建地址，且按 JSON 转接响应解析', async () => {
    const calls: string[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input)
        calls.push(url)
        if (url.startsWith('https://example.com')) {
          return { ok: false, status: 403, text: async () => '' } as unknown as Response
        }
        // 自建转接（地址不含 "rss2json" 字样）返回 JSON
        const body = JSON.stringify({
          status: 'ok',
          items: [{ title: '转接条目', link: 'https://r.com/1', pubDate: '2026-10-04T00:00:00Z', description: 'x' }],
        })
        return { ok: true, status: 200, text: async () => body } as unknown as Response
      }),
    )
    const r = await fetchFeed('https://example.com/feed.xml', 10_000, 'https://my-relay.example.org')
    expect(r.ok).toBe(true)
    expect(r.items[0]!.title).toBe('转接条目')
    expect(calls.some((c) => c.startsWith('https://my-relay.example.org/v1/api.json'))).toBe(true)
  })

  it('不传 relayBase → 走默认公共 rss2json', async () => {
    const calls: string[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        calls.push(String(input))
        return { ok: false, status: 500, text: async () => '' } as unknown as Response
      }),
    )
    await fetchFeed('https://example.com/feed.xml')
    expect(calls.some((c) => c.startsWith('https://api.rss2json.com/v1/api.json'))).toBe(true)
  })
})

/** 网关代理通路（2026-10-27 起第一通路；rss2json 被 Cloudflare 盾挡后引入） */
describe('fetchFeed 本地网关代理', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('网关可用 → 只调网关一次并按 RSS 原文解析，不再走直连/转接', async () => {
    const calls: string[] = []
    const rss = '<?xml version="1.0"?><rss version="2.0"><channel><item><title>网关条目</title><link>https://a.example/x</link><pubDate>Mon, 26 Oct 2026 08:00:00 GMT</pubDate></item></channel></rss>'
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        calls.push(String(input))
        if (String(input).startsWith('http://127.0.0.1:8788/rss')) {
          return { ok: true, status: 200, text: async () => JSON.stringify({ ok: true, url: 'https://example.com/feed.xml', body: rss }) } as unknown as Response
        }
        return { ok: false, status: 500, text: async () => '' } as unknown as Response
      }),
    )
    const r = await fetchFeed('https://example.com/feed.xml')
    expect(r.ok).toBe(true)
    expect(r.items[0]!.title).toBe('网关条目')
    expect(calls).toHaveLength(1)
  })

  it('网关报错 → 错误原因保留，继续降级到直连与转接', async () => {
    const calls: string[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const u = String(input)
        calls.push(u)
        if (u.startsWith('http://127.0.0.1:8788/rss')) {
          return { ok: false, status: 502, text: async () => JSON.stringify({ ok: false, error: '源站连接失败：dns loop' }) } as unknown as Response
        }
        if (u.startsWith('https://example.com')) {
          return { ok: false, status: 403, text: async () => '' } as unknown as Response
        }
        return { ok: false, status: 500, text: async () => '' } as unknown as Response
      }),
    )
    const r = await fetchFeed('https://example.com/feed.xml')
    expect(r.ok).toBe(false)
    expect(r.error).toContain('源站连接失败')
    expect(calls.some((c) => c.startsWith('http://127.0.0.1:8788/rss'))).toBe(true)
    expect(calls.some((c) => c.startsWith('https://api.rss2json.com'))).toBe(true)
  })
})
