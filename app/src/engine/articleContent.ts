/**
 * 条目正文抓取与提取（G1 批，2026-11-04）。信源 feed 只给摘要，条目的投票/检索/摘录
 * 全作用在残缺原料上——本模块把正文抓下来，Readability 提取后转 Markdown（标题层级/列表/
 * 引用/代码块保留，2026-11-10 用户需求：多级标题可区分），回填 item.content。
 *
 * 设计红线（2026-11-03 应急预估的对策落点）：
 * - 后台队列串行限速（单条间隔 800ms），失败记入失败表不自动重试；阅读视图可手动单条重抓；
 * - 只存纯文本：正文永不以 HTML 渲染，XSS 由构造消除（Readability 输出的 HTML 只作为
 *   提取文本的中间物，用完即弃）；
 * - 抓取通路与 fetchFeed 同构：本地网关第一通路（/rss 端点是通用服务端抓取，带内网守卫
 *   与 4MB 上限），直连兜底；无转接服务兜底（转接只回 feed 摘要，对正文无意义）；
 * - 质量闸：正文 <200 字符视为提取失败（登录墙/纯视频页），超长截断到 2 万字符；
 * - 只回填 scored/kept 层的 http(s) 条目；raw/discarded 随 TTL 清理，正文随之消亡。
 */
import { Readability } from '@mozilla/readability'
import { getItem, listAllSources, listRecentItems, putItem } from '../db/collect'
import { recordError } from './errorLog'
import type { Item } from '../types/models'

/** 正文最短长度（质量闸）：低于它视为登录墙/提取失败 */
const MIN_ARTICLE_CHARS = 200
/** 正文长度上限：个人阅读场景 2 万字符足够，同时约束检索扫描与备份体积 */
const MAX_CONTENT_CHARS = 20_000
/** 队列节流：两次抓取之间的间隔（对源站温和，ToS 风险对策） */
const RATE_DELAY_MS = 800
/** 单条抓取超时（看门狗） */
const FETCH_TIMEOUT_MS = 20_000

export interface FetchOk {
  ok: true
  body: string
}
export interface FetchErr {
  ok: false
  error: string
}
export type FetchResult = FetchOk | FetchErr

export interface ExtractOk {
  ok: true
  text: string
}

/** 条目是否值得抓正文：http(s) 链接 + Curated 层（raw/discarded 是暂存层，不投资源） */
export function isArticleEligible(item: Item, sourceKind?: string): boolean {
  if (!/^https?:\/\//i.test(item.url)) return false
  if (item.stage !== 'scored' && item.stage !== 'kept') return false
  if (item.deletedAt) return false
  // ytdlp 源的条目是视频投稿，无正文可提
  if (sourceKind === 'ytdlp') return false
  return true
}

/* ------------------------------ 抓取 ------------------------------ */

const LOCAL_GATEWAY = 'http://127.0.0.1:8788'

/** 网关第一通路；网关不在（连接被拒/超时）返回 null 让调用方走直连 */
async function tryViaGateway(url: string, timeoutMs: number): Promise<FetchResult | null> {
  let resp: Response
  try {
    resp = await fetch(`${LOCAL_GATEWAY}/rss?url=${encodeURIComponent(url)}`, {
      signal: AbortSignal.timeout(timeoutMs),
    })
  } catch {
    return null
  }
  if (!resp.ok) {
    let msg = `网关 HTTP ${resp.status}`
    try {
      const v = (JSON.parse(await resp.text()) as { error?: string })
      if (v.error) msg = v.error
    } catch {
      /* 错误体非 JSON 时保留状态码信息 */
    }
    return { ok: false, error: msg }
  }
  try {
    const data = JSON.parse(await resp.text()) as { ok?: boolean; body?: string; error?: string }
    if (!data.ok || !data.body) return { ok: false, error: data.error ?? '网关返回空' }
    return { ok: true, body: data.body }
  } catch {
    return { ok: false, error: '网关响应解析失败' }
  }
}

/** 抓文章 HTML：网关第一通路，直连兜底 */
export async function fetchArticleHtml(url: string, timeoutMs = FETCH_TIMEOUT_MS): Promise<FetchResult> {
  if (!/^https?:\/\//i.test(url)) return { ok: false, error: '非 http/https 地址' }
  const viaGateway = await tryViaGateway(url, timeoutMs)
  if (viaGateway) return viaGateway
  try {
    const resp = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) })
    if (!resp.ok) return { ok: false, error: `HTTP ${resp.status}` }
    const body = await resp.text()
    return body.trim() ? { ok: true, body } : { ok: false, error: '页面返回空内容' }
  } catch (e) {
    const msg =
      e instanceof DOMException && e.name === 'TimeoutError' ? `超时（>${Math.round(timeoutMs / 1000)}s）` : '网络/CORS 失败'
    return { ok: false, error: msg }
  }
}

/* ------------------------------ 提取与净化 ------------------------------ */

/** 块级叶元素选择器：容器块（如 blockquote 包 p）由叶子出文本，防止嵌套重复 */
const BLOCK_SELECTOR = 'p, h1, h2, h3, h4, h5, h6, li, blockquote, pre, figcaption'

/** 行内元素 → Markdown 片段：加粗/斜体/行内代码保留，链接只留文字（原链在条目上），图片跳过 */
function inlineMd(el: Element): string {
  let out = ''
  for (const node of el.childNodes) {
    if (node.nodeType === Node.TEXT_NODE) {
      out += (node.textContent ?? '').replace(/\s+/g, ' ')
      continue
    }
    if (node.nodeType !== Node.ELEMENT_NODE) continue
    const child = node as Element
    const tag = child.tagName
    if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'IMG') continue
    const inner = inlineMd(child)
    if (!inner.trim()) continue
    if (tag === 'STRONG' || tag === 'B') out += `**${inner.trim()}**`
    else if (tag === 'EM' || tag === 'I') out += `*${inner.trim()}*`
    else if (tag === 'CODE') out += `\`${inner.trim()}\``
    else if (tag === 'BR') out += '\n'
    else out += inner // A / SPAN / 其他：只留内容
  }
  return out
}

/** 有序列表项的序号：数同层前驱 li 个数 */
function liMarker(li: Element): string {
  const ol = li.closest('ol')
  if (!ol) return '- '
  let n = 1
  for (const s of Array.from(ol.children)) {
    if (s === li) break
    if (s.tagName === 'LI') n++
  }
  return `${n}. `
}

/** Readability 输出的 HTML → Markdown（块间 \n\n；标题层级/列表/引用/代码块保留） */
function blocksToMarkdown(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const parts: string[] = []
  for (const el of doc.body.querySelectorAll(BLOCK_SELECTOR)) {
    if (el.querySelector(BLOCK_SELECTOR)) continue
    let t = el.tagName === 'PRE' ? (el.textContent ?? '').trim() : inlineMd(el).replace(/[ \t]+/g, ' ').trim()
    if (!t) continue
    // CMS 残留清理：源站以转义文本内嵌的标签占位（如微信图 `< img id="wx_img" …>`），
    // 页面用 CSS 藏起来但 Readability 会当正文保留——整块长得像标签且无汉字的块丢弃
    if (el.tagName !== 'PRE' && t.startsWith('<') && t.endsWith('>') && !/[\u4e00-\u9fff]/.test(t)) continue
    const tag = el.tagName
    if (/^H[1-6]$/.test(tag)) {
      t = `${'#'.repeat(Number(tag[1]))} ${t}`
    } else if (tag === 'LI') {
      t = `${liMarker(el)}${t.replace(/^[-*]\s+/, '')}`
    } else if (tag === 'FIGCAPTION') {
      t = `*${t}*`
    } else if (tag === 'PRE') {
      t = `\`\`\`\n${t}\n\`\`\``
    } else if (el.closest('blockquote') && tag !== 'BLOCKQUOTE') {
      t = t
        .split('\n')
        .map((l) => `> ${l}`.trimEnd())
        .join('\n')
    }
    parts.push(t)
  }
  if (parts.length > 0) return parts.join('\n\n')
  // 兜底：正文被清得没有块结构时整段取
  return (doc.body.textContent ?? '').replace(/\s+/g, ' ').trim()
}

/**
 * 提取正文为 Markdown。任意外部 HTML 是敌意输入边界：解析失败返回错误对象（与 parseFeed
 * 的错误契约一致），不让单条坏页面炸穿队列。
 */
export function extractArticleText(html: string): ExtractOk | FetchErr {
  let text = ''
  try {
    const doc = new DOMParser().parseFromString(html, 'text/html')
    const parsed = new Readability(doc).parse()
    if (!parsed?.content) return { ok: false, error: '无法识别正文结构（可能是登录墙或纯媒体页）' }
    const contentHtml = typeof parsed.content === 'string' ? parsed.content : (parsed.content as unknown as Element).outerHTML
    text = blocksToMarkdown(contentHtml)
  } catch (e) {
    return { ok: false, error: `正文解析失败：${e instanceof Error ? e.message : String(e)}` }
  }
  if (text.length < MIN_ARTICLE_CHARS) {
    return { ok: false, error: `正文过短（${text.length} 字符，不足 ${MIN_ARTICLE_CHARS}）——可能是登录墙或摘要页` }
  }
  if (text.length > MAX_CONTENT_CHARS) {
    // 超长截断不得撕裂结构：切点回退到前一个块边界，半截代码围栏补回闭合（2026-11-10 自查）
    let cut = text.lastIndexOf('\n\n', MAX_CONTENT_CHARS)
    if (cut < MIN_ARTICLE_CHARS) cut = MAX_CONTENT_CHARS
    text = `${text.slice(0, cut).trimEnd()}…`
    const fences = (text.match(/^```/gm) ?? []).length
    if (fences % 2 === 1) text = `${text}\n\`\`\``
  }
  return { ok: true, text }
}

/* ------------------------------ 失败表（localStorage，重启后仍不自动重试） ------------------------------ */

const FAIL_KEY = 'pwork-content-failed'
const FAIL_CAP = 500

function failSet(): Set<string> {
  try {
    const v = localStorage.getItem(FAIL_KEY)
    return new Set(v ? (JSON.parse(v) as string[]) : [])
  } catch {
    return new Set()
  }
}

function saveFailSet(s: Set<string>): void {
  // 超上限丢最旧的：失败表是"别再打扰源站"的登记，不是需要永久保真的数据
  localStorage.setItem(FAIL_KEY, JSON.stringify([...s].slice(-FAIL_CAP)))
}

export function isContentFailed(id: string): boolean {
  return failSet().has(id)
}

function markFailed(id: string): void {
  const s = failSet()
  s.add(id)
  saveFailSet(s)
}

export function clearContentFailed(id: string): void {
  const s = failSet()
  if (!s.delete(id)) return
  saveFailSet(s)
}

/* ------------------------------ 单条抓取 ------------------------------ */

/** 正文写入后的回调（store 用它刷新单条目视图，避免全列表重载） */
let updateListener: ((itemId: string) => void) | null = null

export function onContentUpdate(fn: ((itemId: string) => void) | null): void {
  updateListener = fn
}

type FetchOutcome = { ok: boolean; error: string | null; text?: string }

/** 进行中去重：后台队列与阅读视图同时抓同一条时共用同一次请求 */
const inflight = new Map<string, Promise<FetchOutcome>>()

/**
 * 抓单条正文并回填：队列与阅读视图（含打开时自动抓取）共用同一契约。
 * 成功写 content 并回调（带正文文本，阅读视图即时显示）；失败登记失败表，content 保持空。
 */
export function fetchContentForItem(id: string): Promise<FetchOutcome> {
  const running = inflight.get(id)
  if (running) return running
  const p = doFetchContent(id).finally(() => inflight.delete(id))
  inflight.set(id, p)
  return p
}

async function doFetchContent(id: string): Promise<FetchOutcome> {
  const item = await getItem(id)
  if (!item) return { ok: false, error: '条目不存在' }
  // 已有正文的条目直接返回（阅读视图先抓完、后台队列随后轮到同一条时不再重复请求源站）
  if (item.content) return { ok: true, error: null, text: item.content }
  const fetched = await fetchArticleHtml(item.url)
  if (!fetched.ok) {
    markFailed(id)
    return { ok: false, error: fetched.error }
  }
  const extracted = extractArticleText(fetched.body)
  if (!extracted.ok) {
    markFailed(id)
    return { ok: false, error: extracted.error }
  }
  await putItem({ ...item, content: extracted.text, updatedAt: new Date().toISOString() })
  clearContentFailed(id)
  updateListener?.(id)
  return { ok: true, error: null, text: extracted.text }
}

/* ------------------------------ 后台队列（串行限速） ------------------------------ */

const pending: string[] = []
let draining = false

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

/** 入队待抓条目（去重）；返回实际新增数 */
export function enqueueContent(ids: string[]): number {
  let added = 0
  for (const id of ids) {
    if (!pending.includes(id)) {
      pending.push(id)
      added++
    }
  }
  if (pending.length > 0) void drain()
  return added
}

export function queueDepth(): number {
  return pending.length
}

async function drain(): Promise<void> {
  if (draining) return
  draining = true
  try {
    while (pending.length > 0) {
      const id = pending.shift()!
      try {
        await fetchContentForItem(id)
      } catch (e) {
        // 单条失败（存储异常等）登记留痕，队列继续——一批坏数据不能拖死整队
        void recordError(
          { where: '采集.正文抓取', kind: 'app', message: `条目 ${id} 正文回填失败：${e instanceof Error ? e.message : String(e)}` },
          { silent: true },
        )
      }
      if (pending.length > 0) await sleep(RATE_DELAY_MS)
    }
  } finally {
    draining = false
  }
}

/* ------------------------------ 打开应用时的渐进回填 ------------------------------ */

const BACKFILL_LIMIT = 20
let backfilled = false

/**
 * 每次应用打开跑一次：把近 90 天缺正文的合格条目（新者优先）按队列上限补抓。
 * 旧条目跨多次打开渐进补齐，不搞一次性全量冲击源站。
 */
export async function backfillContentOnce(): Promise<number> {
  if (backfilled) return 0
  backfilled = true
  const sources = await listAllSources()
  const kindOf = new Map(sources.map((s) => [s.id, s.kind]))
  const recent = await listRecentItems(90)
  const ids = recent
    .filter((i) => !i.content && !isContentFailed(i.id) && isArticleEligible(i, kindOf.get(i.sourceId)))
    .slice(0, BACKFILL_LIMIT)
    .map((i) => i.id)
  return enqueueContent(ids)
}
