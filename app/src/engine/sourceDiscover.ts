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

/** 非订阅域名引用排行（近 30 天，count 降序前 8；minCount=3 起报）。
 *  排除范围：已订阅 feed 的域名（自家来源不算"发现"） */
export function discoverLeads(items: Item[], sources: Source[], now = new Date(), minCount = 3): SourceLead[] {
  const since = new Date(now.getTime() - 30 * 86_400_000).toISOString()
  const subscribed = new Set(sources.map((s) => hostOf(s.url)).filter((h): h is string => h !== null))
  const m = new Map<string, SourceLead>()
  for (const i of items) {
    if (i.deletedAt || i.fetchedAt < since) continue
    const host = hostOf(i.url)
    if (!host || subscribed.has(host)) continue
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
