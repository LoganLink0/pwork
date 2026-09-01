/**
 * RSS/Atom 解析（Workers 无 DOMParser——正则提取，C2 够用：
 * 标题/链接/摘要/日期；CDATA 与实体基础处理。解析失败返回空数组带原因。）
 */

export interface RawFeedItem {
  title: string
  url: string
  summary: string
  publishedAt: string | null
}

export interface ParseResult {
  ok: boolean
  items: RawFeedItem[]
  error: string | null
}

const MAX_SUMMARY = 200

function pick(block: string, tags: string[]): string {
  for (const tag of tags) {
    const re = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, 'i')
    const m = block.match(re)
    if (m?.[1]) return m[1]
  }
  return ''
}

function clean(raw: string): string {
  return raw
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#\d+;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function extractLink(block: string, atom: boolean): string {
  if (!atom) return clean(pick(block, ['link']))
  const hrefs = [...block.matchAll(/<link\b[^>]*href="([^"]+)"[^>]*>/gi)].map((m) => m[1])
  const alt = block.match(/<link\b[^>]*rel="alternate"[^>]*href="([^"]+)"/i)?.[1]
  return clean(alt ?? hrefs[0] ?? '')
}

/** 解析 RSS 2.0 / Atom 文本 */
export function parseFeed(xml: string): ParseResult {
  if (!/<(?:rss|feed)[\s>]/i.test(xml)) {
    return { ok: false, items: [], error: '不是 RSS/Atom（无 rss/feed 根）' }
  }
  const atom = /<feed[\s>]/i.test(xml) && !/<rss/i.test(xml)
  const blocks = atom
    ? [...xml.matchAll(/<entry\b[\s\S]*?<\/entry>/gi)].map((m) => m[0])
    : [...xml.matchAll(/<item\b[\s\S]*?<\/item>/gi)].map((m) => m[0])
  if (blocks.length === 0) return { ok: false, items: [], error: '没有找到条目' }

  const items: RawFeedItem[] = []
  for (const b of blocks) {
    const title = clean(pick(b, ['title']))
    const url = extractLink(b, atom)
    if (!title || !url) continue
    const summary = clean(pick(b, ['description', 'summary', 'content:encoded', 'content'])).slice(0, MAX_SUMMARY)
    const dateRaw = clean(pick(b, ['pubDate', 'published', 'updated', 'dc:date']))
    const d = dateRaw ? new Date(dateRaw) : null
    items.push({
      title,
      url,
      summary,
      publishedAt: d && !Number.isNaN(d.getTime()) ? d.toISOString() : null,
    })
  }
  if (items.length === 0) return { ok: false, items: [], error: '条目缺少标题或链接' }
  return { ok: true, items, error: null }
}

/** 解析 rss2json 转接响应 */
export function parseRss2Json(text: string): ParseResult {
  try {
    const data = JSON.parse(text) as {
      status?: string
      items?: { title?: string; link?: string; pubDate?: string; description?: string }[]
    }
    if (data.status !== 'ok' || !Array.isArray(data.items)) {
      return { ok: false, items: [], error: 'rss2json 转接失败' }
    }
    const items: RawFeedItem[] = []
    for (const it of data.items) {
      if (!it.title || !it.link) continue
      items.push({
        title: clean(it.title),
        url: it.link.trim(),
        summary: clean(it.description ?? '').slice(0, MAX_SUMMARY),
        publishedAt: it.pubDate ? new Date(it.pubDate).toISOString() : null,
      })
    }
    return items.length ? { ok: true, items, error: null } : { ok: false, items: [], error: '转接结果为空' }
  } catch {
    return { ok: false, items: [], error: 'rss2json 响应解析失败' }
  }
}
