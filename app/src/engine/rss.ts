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
 * 抓取单个信源，按序尝试候选通路：
 * ⓪ 本地网关代理（2026-10-27 起第一通路）——桌面版网关随应用起、浏览器版随 dev/serve 起，
 *    服务端直抓源站，无 CORS 与浏览器指纹限制；网关不在时本机连接立即被拒，毫秒级落到下一通路。
 *    背景：公共转接 rss2json 被 Cloudflare 人机验证挡住后浏览器抓取全军覆没（当日真实事故）。
 * ① 直连——仅当源自带 CORS 头（access-control-allow-origin: *）时浏览器可用；
 * ② rsshub.app 源自动换 rssforever 公共镜像（该实例可达但 CORS 锁自身域名，浏览器直抓仍被拦，
 *    主要为无网关场景预留）；
 * ③ RSS 转接服务——服务端抓取 + 开放 CORS，无网关时的兜底（免费公共服务不保证可用，可在设置换自建地址）。
 * data: URL 用于本地测试/离线演示，fetch 原生支持。
 */
export async function fetchFeed(url: string, timeoutMs = 10_000, relayBase = ''): Promise<ParseResult> {
  let lastError: string | null = null
  if (/^https?:\/\//i.test(url)) {
    const viaGateway = await tryViaGateway(url, timeoutMs + 10_000)
    if (viaGateway.ok) return viaGateway
    // 网关业务错误（源站超时/HTTP 4xx 等）比直连的 CORS 泛错更有信息量，记录它；
    // 而「网关不在」只说明这条通路缺席（error 为 null），不抢直连错误
    if (viaGateway.error) lastError = viaGateway.error
  }
  const candidates: string[] = [url]
  if (url.includes('rsshub.app')) {
    candidates.push(url.replace('//rsshub.app', '//rsshub.rssforever.com'))
  }
  for (const candidate of candidates) {
    const direct = await tryFetch(candidate, timeoutMs)
    if (direct.ok) return direct
    if (!lastError) lastError = direct.error
  }
  const relay = (relayBase.trim() || 'https://api.rss2json.com').replace(/\/+$/, '')
  const viaJson = await tryFetch(
    `${relay}/v1/api.json?rss_url=${encodeURIComponent(url)}`,
    timeoutMs,
    true,
  )
  if (viaJson.ok) return viaJson
  return { ok: false, items: [], error: lastError ?? viaJson.error ?? '抓取失败' }
}

/** 本地网关（127.0.0.1:8788）的 RSS 代理：网关服务端抓原文返回，前端解析。
 *  网关侧自带 URL 守卫（拒绝内网/保留地址）与 4MB/15s 上限。 */
const LOCAL_GATEWAY = 'http://127.0.0.1:8788'

async function tryViaGateway(feedUrl: string, timeoutMs: number): Promise<ParseResult> {
  let resp: Response
  try {
    resp = await fetch(`${LOCAL_GATEWAY}/rss?url=${encodeURIComponent(feedUrl)}`, {
      signal: AbortSignal.timeout(timeoutMs),
    })
  } catch {
    // 连接被拒/超时=网关不在这台机器上（纯静态托管场景），通路缺席而非源站错误——error 置空不抢占
    return { ok: false, items: [], error: null }
  }
  if (!resp.ok) {
    let msg = `网关 HTTP ${resp.status}`
    try {
      const v = JSON.parse(await resp.text()) as { error?: string }
      if (v.error) msg = v.error
    } catch {
      /* 错误体非 JSON 时保留状态码信息 */
    }
    return { ok: false, items: [], error: msg }
  }
  let data: { ok?: boolean; body?: string; error?: string }
  try {
    data = JSON.parse(await resp.text()) as typeof data
  } catch {
    return { ok: false, items: [], error: '网关响应解析失败' }
  }
  if (!data.ok || !data.body) return { ok: false, items: [], error: data.error ?? '网关返回空' }
  return parseFeed(data.body)
}

async function tryFetch(url: string, timeoutMs: number, isRelay = false): Promise<ParseResult> {
  let resp: Response
  try {
    resp = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) })
  } catch (e) {
    const msg = e instanceof DOMException && e.name === 'TimeoutError' ? '超时（>10s）' : '网络/CORS 失败'
    return { ok: false, items: [], error: msg }
  }
  if (!resp.ok) return { ok: false, items: [], error: `HTTP ${resp.status}` }
  // 读取响应体同样受 AbortSignal.timeout 控制：响应头到了但体没读完，中止错误会从 text() 抛出。
  // 不捕获会炸穿 runCollect → runFetchAll，按钮永久停在「抓取中」（2026-10 真实事故）。
  let text: string
  try {
    text = await resp.text()
  } catch {
    return { ok: false, items: [], error: '读取响应超时（>10s）' }
  }
  // 转接服务返回 JSON：{ status:'ok', items:[{title,link,pubDate,description}] }
  if (isRelay) return parseRss2Json(text)
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
      // 非法 pubDate 防护（与 XML 路径 dateOf 同口径）：一条坏日期只丢时间戳，不毒整批
      const pd = it.pubDate ? new Date(it.pubDate) : null
      items.push({
        title: it.title.trim(),
        url: it.link.trim(),
        summary: clean.length > MAX_SUMMARY ? `${clean.slice(0, MAX_SUMMARY)}…` : clean,
        publishedAt: pd && !Number.isNaN(pd.getTime()) ? pd.toISOString() : null,
      })
    }
    return items.length ? { ok: true, items, error: null } : { ok: false, items: [], error: '转接结果为空' }
  } catch {
    return { ok: false, items: [], error: 'rss2json 响应解析失败' }
  }
}
