/**
 * RSS/Atom 解析（纯函数，DOMParser 零依赖）。
 * C1 范围：RSS 2.0 与 Atom 0.3/1.0；解析失败返回空数组并带原因（进 health.lastError）。
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

function textOf(el: Element | null): string {
  return (el?.textContent ?? '').trim()
}

/** 提取条目链接：RSS 的 link 文本；Atom 的 link[href]（优先 alternate） */
function linkOf(item: Element, atom: boolean): string {
  if (!atom) return textOf(item.querySelector('link'))
  const links = [...item.querySelectorAll('link')]
  const alt = links.find((l) => l.getAttribute('rel') === 'alternate') ?? links[0]
  return alt?.getAttribute('href')?.trim() ?? ''
}

function summaryOf(item: Element, atom: boolean): string {
  const raw = atom
    ? textOf(item.querySelector('summary')) || textOf(item.querySelector('content'))
    : textOf(item.querySelector('description')) || textOf(item.querySelector('encoded')) ||
      textOf(item.querySelector('content'))
  // 去内联标签与转义空白，截断到 MAX_SUMMARY
  const clean = raw
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[a-z]+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return clean.length > MAX_SUMMARY ? `${clean.slice(0, MAX_SUMMARY)}…` : clean
}

function dateOf(item: Element, atom: boolean): string | null {
  const raw = atom
    ? textOf(item.querySelector('published')) || textOf(item.querySelector('updated'))
    : textOf(item.querySelector('pubDate')) || textOf(item.querySelector('date'))
  if (!raw) return null
  const d = new Date(raw)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

/** 解析 RSS/Atom 文本；非 XML 或无条目 → ok:false */
export function parseFeed(xml: string): ParseResult {
  const doc = new DOMParser().parseFromString(xml, 'text/xml')
  if (doc.querySelector('parsererror')) {
    return { ok: false, items: [], error: 'XML 解析失败（可能不是 RSS/Atom）' }
  }
  const atomItems = [...doc.querySelectorAll('feed > entry')]
  const rssItems = [...doc.querySelectorAll('channel > item')]
  const isAtom = atomItems.length > 0
  const entries = isAtom ? atomItems : rssItems
  if (entries.length === 0) {
    return { ok: false, items: [], error: '没有找到条目（channel>item 或 feed>entry）' }
  }
  const items: RawFeedItem[] = []
  for (const el of entries) {
    const title = textOf(el.querySelector('title'))
    const url = linkOf(el, isAtom)
    if (!title || !url) continue
    items.push({ title, url, summary: summaryOf(el, isAtom), publishedAt: dateOf(el, isAtom) })
  }
  if (items.length === 0) {
    return { ok: false, items: [], error: '条目缺少标题或链接' }
  }
  return { ok: true, items, error: null }
}

/**
 * 抓取单个信源，按序尝试候选通路（实测结论 2026-08-31）：
 * ① 直连——仅当源自带 CORS 头（access-control-allow-origin: *）时浏览器可用；
 * ② rsshub.app 源自动换 rssforever 公共镜像（该实例可达但 CORS 锁自身域名，浏览器直抓仍会被拦，
 *    主要为 Tauri 化后无 CORS 场景预留）；
 * ③ rss2json 公共转接——服务端抓取 + 开放 CORS，是浏览器内 C1 的主力通路。
 * data: URL 用于本地测试/离线演示，fetch 原生支持。
 */
export async function fetchFeed(url: string, timeoutMs = 10_000): Promise<ParseResult> {
  const candidates: string[] = [url]
  if (url.includes('rsshub.app')) {
    candidates.push(url.replace('//rsshub.app', '//rsshub.rssforever.com'))
  }
  let lastError: string | null = null
  for (const candidate of candidates) {
    const direct = await tryFetch(candidate, timeoutMs)
    if (direct.ok) return direct
    lastError = direct.error
  }
  const viaJson = await tryFetch(
    `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(url)}`,
    timeoutMs,
  )
  if (viaJson.ok) return viaJson
  return { ok: false, items: [], error: lastError ?? viaJson.error ?? '抓取失败' }
}

async function tryFetch(url: string, timeoutMs: number): Promise<ParseResult> {
  let resp: Response
  try {
    resp = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) })
  } catch (e) {
    const msg = e instanceof DOMException && e.name === 'TimeoutError' ? '超时（>10s）' : '网络/CORS 失败'
    return { ok: false, items: [], error: msg }
  }
  if (!resp.ok) return { ok: false, items: [], error: `HTTP ${resp.status}` }
  const text = await resp.text()
  // rss2json 返回 JSON：{ status:'ok', items:[{title,link,pubDate,description}] }
  if (url.includes('rss2json')) return parseRss2Json(text)
  return parseFeed(text)
}

function parseRss2Json(text: string): ParseResult {
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
      const clean = (it.description ?? '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
      items.push({
        title: it.title.trim(),
        url: it.link.trim(),
        summary: clean.length > MAX_SUMMARY ? `${clean.slice(0, MAX_SUMMARY)}…` : clean,
        publishedAt: it.pubDate ? new Date(it.pubDate).toISOString() : null,
      })
    }
    return items.length ? { ok: true, items, error: null } : { ok: false, items: [], error: '转接结果为空' }
  } catch {
    return { ok: false, items: [], error: 'rss2json 响应解析失败' }
  }
}
