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
      vi.fn(async () => {
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
