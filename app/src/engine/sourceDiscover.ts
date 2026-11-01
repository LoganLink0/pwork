/**
 * 引用发现（信源主动识别·第二层，2026-11-01）：统计条目 URL 的域名——
 * 某个非订阅域名在近 30 天被反复引用，说明你的信源们反复在转引它，
 * 大概率是一个值得直接订阅的源头。只发现不添加：feed 地址猜不出来，
 * 推荐卡给证据与预填入口，由用户补全 feed 地址后入库。
 */
import type { Item, Source } from '../types/models'

export interface SourceLead {
  domain: string
  count: number
  samples: { title: string; url: string }[]
}

function hostOf(url: string): string | null {
  try {
    const u = new URL(url)
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null
    return u.hostname.replace(/^www\./, '')
  } catch {
    return null
  }
}

/** 注册域（最后两段）：bilibili.com 与 space.bilibili.com 同源——yt-dlp 信源的条目
 *  不能因为「feed 域名是 space.xxx 而条目域名是 www.xxx」就被误推荐为新源头 */
function registrableDomain(host: string): string {
  const parts = host.split('.')
  return parts.length >= 2 ? parts.slice(-2).join('.') : host
}

/** 非订阅域名引用排行（近 30 天，count 降序前 8；minCount=3 起报）。
 *  排除范围：与任一已订阅 feed 同注册域的域名（自家来源与自家平台条目不算"发现"） */
export function discoverLeads(items: Item[], sources: Source[], now = new Date(), minCount = 3): SourceLead[] {
  const since = new Date(now.getTime() - 30 * 86_400_000).toISOString()
  const subscribed = new Set(
    sources.map((s) => hostOf(s.url)).filter((h): h is string => h !== null).map(registrableDomain),
  )
  const m = new Map<string, SourceLead>()
  for (const i of items) {
    if (i.deletedAt || i.fetchedAt < since) continue
    const host = hostOf(i.url)
    if (!host || subscribed.has(registrableDomain(host))) continue
    const lead = m.get(host) ?? { domain: host, count: 0, samples: [] }
    lead.count += 1
    if (lead.samples.length < 2) lead.samples.push({ title: i.title, url: i.url })
    m.set(host, lead)
  }
  return [...m.values()]
    .filter((l) => l.count >= minCount)
    .sort((a, b) => b.count - a.count)
    .slice(0, 8)
}
