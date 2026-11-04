import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  backfillContentOnce,
  clearContentFailed,
  enqueueContent,
  extractArticleText,
  fetchContentForItem,
  isArticleEligible,
  isContentFailed,
  queueDepth,
} from './articleContent'
import { createSource, getItem, putItem } from '../db/collect'
import type { Item } from '../types/models'

/** 文章形态的页面：导航/脚本/页脚是 Readability 应剥掉的杂物 */
const ARTICLE_HTML = `<html><head><title>某公司发布新一代模型</title><style>.nav{color:red}</style></head>
<body>
<nav>首页 | 分类 | 登录 | 广告位招租</nav>
<script>window.tracker="追踪脚本内容不应出现";</script>
<article>
<h1>某公司发布新一代模型</h1>
<p>${'正文第一段讲发布背景。'.repeat(30)}</p>
<p>${'正文第二段讲技术细节。'.repeat(30)}</p>
<blockquote><p>${'引用的行业观点原话。'.repeat(15)}</p></blockquote>
</article>
<footer>版权所有 · 相关推荐 · 评论区</footer>
</body></html>`

function makeItem(over: Partial<Item> & { id: string; url: string }): Item {
  const now = new Date().toISOString()
  return {
    sourceId: 'src_x', sourceName: '测试源', title: '标题', summary: '', fingerprint: `fp_${over.id}`,
    eventGroup: null, publishedAt: null, fetchedAt: now, stage: 'scored',
    score: { total: 50, source: 10, novelty: 10, relevance: 20, utility: 10 }, scoreReason: '测试', aiBy: 'rules',
    tags: [], otFlag: null, expiresAt: null,
    annotation: { notes: '', vote: null, keepForever: false, linkedReviewId: null },
    createdAt: now, updatedAt: now, schemaVersion: 1, ...over,
  }
}

/** 测试里网关不存在（连接拒绝）——与 rss.test.ts 同一口径，fetch 走直连路径 */
function stubFetch(map: Record<string, { status?: number; body?: string }>) {
  return vi.fn(async (url: string | URL) => {
    const u = String(url)
    if (u.includes('127.0.0.1:8788')) throw new TypeError('connect ECONNREFUSED')
    const hit = map[u]
    if (!hit) return new Response('not found', { status: 404 })
    return new Response(hit.body ?? '', { status: hit.status ?? 200 })
  })
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('extractArticleText（Readability 提取 + 纯文本净化）', () => {
  it('剥掉导航/脚本/页脚，按块提取带段落结构', () => {
    const r = extractArticleText(ARTICLE_HTML)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.text).toContain('正文第一段讲发布背景。')
    expect(r.text).toContain('正文第二段讲技术细节。')
    expect(r.text).toContain('引用的行业观点原话。')
    // 杂物不得混入
    expect(r.text).not.toContain('追踪脚本')
    expect(r.text).not.toContain('广告位招租')
    expect(r.text).not.toContain('版权所有')
    expect(r.text).not.toContain('<')
    // 块间以空行分段
    expect(r.text.split('\n\n').length).toBeGreaterThanOrEqual(3)
  })

  it('质量闸：正文过短（登录墙）返回失败', () => {
    const r = extractArticleText('<html><body><div>请登录后阅读全文</div></body></html>')
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.error).toContain('正文过短')
  })

  it('无正文结构返回失败，不抛异常', () => {
    const r = extractArticleText('<html><body></body></html>')
    expect(r.ok).toBe(false)
  })

  it('CMS 转义标签残留（如微信图占位）不进正文', () => {
    const html = `<html><body><article>
<p>${'正文开头讲背景。'.repeat(30)}</p>
<p>&lt;img id="wx_img" src="https://www.example.com/wp-content/uploads/2026/11/a.jpg" /&gt;</p>
<p>${'正文继续讲细节。'.repeat(30)}</p>
</article></body></html>`
    const r = extractArticleText(html)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.text).not.toContain('wx_img')
    expect(r.text).toContain('正文开头讲背景。')
    expect(r.text).toContain('正文继续讲细节。')
  })

  it('超长正文截断到 2 万字符', () => {
    const r = extractArticleText(`<html><body><article><p>${'长'.repeat(30000)}</p></article></body></html>`)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.text.length).toBeLessThanOrEqual(20_001)
    expect(r.text.endsWith('…')).toBe(true)
  })
})

describe('isArticleEligible（正文抓取准入）', () => {
  it('http(s) + scored/kept 才合格；data 链接、筛除层、ytdlp 源不合格', () => {
    expect(isArticleEligible(makeItem({ id: 'a1', url: 'https://a.com/p' }))).toBe(true)
    expect(isArticleEligible(makeItem({ id: 'a2', url: 'https://a.com/p', stage: 'kept' }))).toBe(true)
    expect(isArticleEligible(makeItem({ id: 'a3', url: 'data:text/html,hi' }))).toBe(false)
    expect(isArticleEligible(makeItem({ id: 'a4', url: 'https://a.com/p', stage: 'discarded' }))).toBe(false)
    expect(isArticleEligible(makeItem({ id: 'a5', url: 'https://a.com/p' }), 'ytdlp')).toBe(false)
    expect(isArticleEligible(makeItem({ id: 'a6', url: 'https://a.com/p', deletedAt: '2026-11-01T00:00:00.000Z' }))).toBe(false)
  })
})

describe('正文队列（真实 db：写入回填 / 失败登记 / 手动解除）', () => {
  beforeEach(() => {
    localStorage.removeItem('pwork-content-failed')
  })

  it('抓取成功：content 写回且带段落结构', async () => {
    const item = makeItem({ id: `itm_${Date.now()}_ok`, url: 'https://a.com/p1' })
    await putItem(item)
    vi.stubGlobal('fetch', stubFetch({ 'https://a.com/p1': { body: ARTICLE_HTML } }))
    expect(enqueueContent([item.id])).toBe(1)
    await vi.waitFor(async () => expect((await getItem(item.id))?.content).toBeTruthy())
    const fresh = await getItem(item.id)
    expect(fresh?.content).toContain('正文第二段讲技术细节。')
    await vi.waitFor(() => expect(queueDepth()).toBe(0))
  })

  it('抓取失败：content 保持空、进失败表不再自动重试、手动解除后可再抓', async () => {
    const item = makeItem({ id: `itm_${Date.now()}_fail`, url: 'https://a.com/p404' })
    await putItem(item)
    vi.stubGlobal('fetch', stubFetch({}))
    enqueueContent([item.id])
    await vi.waitFor(() => expect(isContentFailed(item.id)).toBe(true))
    expect(await getItem(item.id).then((i) => i?.content)).toBeUndefined()
    clearContentFailed(item.id)
    expect(isContentFailed(item.id)).toBe(false)
    await vi.waitFor(() => expect(queueDepth()).toBe(0))
  })

  it('进行中去重：并发两次抓同一条只发一次请求', async () => {
    const item = makeItem({ id: `itm_${Date.now()}_dedup`, url: 'https://a.com/dedup' })
    await putItem(item)
    const fetchMock = vi.fn(async (url: string | URL) => {
      const u = String(url)
      if (u.includes('127.0.0.1:8788')) throw new TypeError('connect ECONNREFUSED')
      return u.includes('/dedup')
        ? new Response(ARTICLE_HTML, { status: 200 })
        : new Response('not found', { status: 404 })
    })
    vi.stubGlobal('fetch', fetchMock)
    const [a, b] = await Promise.all([fetchContentForItem(item.id), fetchContentForItem(item.id)])
    expect(a.ok && b.ok).toBe(true)
    // 直连通路只应请求一次（网关探测每方各一次也算了：共 3 次 = 2 网关拒绝 + 1 直连）
    const directCalls = fetchMock.mock.calls.filter((c) => String(c[0]).includes('/dedup')).length
    expect(directCalls).toBe(1)
    await vi.waitFor(() => expect(queueDepth()).toBe(0))
  })

  it('打开应用回填：只补合格条目，ytdlp 源不碰；会话内只跑一次', async () => {
    const src = await createSource({ name: '文章源', url: 'https://a.com/rss', domain: 'ai', tier: 1 })
    const videoSrc = await createSource({ name: '视频源', url: 'https://space.bilibili.com/1', domain: 'video', tier: 2, kind: 'ytdlp' })
    const a = makeItem({ id: `itm_${Date.now()}_bf1`, url: 'https://a.com/bf1', sourceId: src.id, sourceName: src.name })
    const b = makeItem({ id: `itm_${Date.now()}_bf2`, url: 'https://a.com/bf2', sourceId: src.id, sourceName: src.name })
    const v = makeItem({ id: `itm_${Date.now()}_bfv`, url: 'https://www.bilibili.com/video/1', sourceId: videoSrc.id, sourceName: videoSrc.name })
    await putItem(a)
    await putItem(b)
    await putItem(v)
    vi.stubGlobal('fetch', stubFetch({
      'https://a.com/bf1': { body: ARTICLE_HTML },
      'https://a.com/bf2': { body: ARTICLE_HTML },
    }))
    expect(await backfillContentOnce()).toBe(2)
    await vi.waitFor(async () => expect((await getItem(a.id))?.content).toBeTruthy())
    await vi.waitFor(async () => expect((await getItem(b.id))?.content).toBeTruthy())
    expect((await getItem(v.id))?.content).toBeUndefined()
    // 会话闸：第二次调用直接返回 0
    expect(await backfillContentOnce()).toBe(0)
    await vi.waitFor(() => expect(queueDepth()).toBe(0))
  })
})
