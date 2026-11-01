/**
 * Feed 自动探测（信源融合批·源自权威信源调研方法论，2026-11-01）：
 * 用户手里往往只有站点主页地址——按两层策略找出真正的 feed：
 * ① 页面声明：抓主页 HTML，解析 <link rel="alternate" type="application/rss+xml|atom+xml">；
 * ② 惯例路径：依次尝试 /feed、/rss、/feed.xml、/atom.xml、/rss.xml、/index.xml（逐个验证是真 feed）。
 * 抓取走本地网关第一通路（与 rss.ts 同款；无网关的浏览器场景探测能力受限，静默降级为找不到）。
 * 纯函数（extractFeedLinks / conventionCandidates）独立导出可单测。
 */
import { fetchFeed } from './rss'

const LOCAL_GATEWAY = 'http://127.0.0.1:8788'
const CONVENTION_PATHS = ['/feed', '/rss', '/feed.xml', '/atom.xml', '/rss.xml', '/index.xml']
const LINK_RE = /<link[^>]+rel=["']?alternate["']?[^>]*>/gi
const TYPE_RE = /type=["']?application\/(rss|atom)\+xml["']?/i
const HREF_RE = /href=["']?([^"'\s>]+)["']?/i

export interface ProbeResult {
  feedUrl: string | null
  /** link = 页面声明发现；convention = 惯例路径命中；input = 输入本身就是 feed */
  how: 'link' | 'convention' | 'input' | null
}

/** 从 HTML 提取 feed 声明并解析为绝对地址（纯函数）：返回首个 rss/atom alternate 的 href */
export function extractFeedLinks(html: string, baseUrl: string): string[] {
  const out: string[] = []
  for (const tag of html.match(LINK_RE) ?? []) {
    if (!TYPE_RE.test(tag)) continue
    const href = tag.match(HREF_RE)?.[1]?.trim()
    if (!href) continue
    try {
      const u = new URL(href, baseUrl)
      if (u.protocol !== 'http:' && u.protocol !== 'https:') continue // javascript: 等协议一律不收
      out.push(u.toString())
    } catch {
      /* 非法 href 跳过 */
    }
  }
  return out
}

/** 惯例路径候选（纯函数）：主页地址拼接常见 feed 路径 */
export function conventionCandidates(siteUrl: string): string[] {
  const base = siteUrl.replace(/\/+$/, '')
  return CONVENTION_PATHS.map((p) => `${base}${p}`)
}

/** 抓任意 URL 的原文：网关第一通路（无 CORS 限制），直连兜底（自带 CORS 的站点可用） */
async function fetchRaw(url: string, timeoutMs: number): Promise<string | null> {
  try {
    const resp = await fetch(`${LOCAL_GATEWAY}/rss?url=${encodeURIComponent(url)}`, {
      signal: AbortSignal.timeout(timeoutMs),
    })
    if (resp.ok) {
      const data = (await resp.json()) as { ok?: boolean; body?: string }
      if (data.ok && data.body) return data.body
    }
  } catch {
    /* 网关不在 → 直连兜底 */
  }
  try {
    const resp = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) })
    if (resp.ok) return await resp.text()
  } catch {
    /* CORS/网络失败 → 放弃该候选 */
  }
  return null
}

/** 探测站点主页对应的 feed 地址。已是 feed 的输入原样返回（how='input'）。 */
export async function probeFeedUrl(siteUrl: string, timeoutMs = 6000): Promise<ProbeResult> {
  const input = siteUrl.trim()
  if (!/^https?:\/\//i.test(input)) return { feedUrl: null, how: null }

  // ⓪ 输入本身就是 feed：fetchFeed 全通路验证（网关→直连→转接）
  const asFeed = await fetchFeed(input, timeoutMs)
  if (asFeed.ok) return { feedUrl: input, how: 'input' }

  // ① 页面声明：抓主页 HTML 找 <link rel="alternate">
  const html = await fetchRaw(input, timeoutMs)
  if (html) {
    for (const candidate of extractFeedLinks(html, input)) {
      if ((await fetchFeed(candidate, timeoutMs)).ok) return { feedUrl: candidate, how: 'link' }
    }
  }

  // ② 惯例路径：逐个验证是真 feed（200 + 可解析），命中即返回
  for (const candidate of conventionCandidates(input)) {
    if ((await fetchFeed(candidate, timeoutMs)).ok) return { feedUrl: candidate, how: 'convention' }
  }
  return { feedUrl: null, how: null }
}
