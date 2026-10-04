/**
 * 星级反馈统计（2026-10-04 方案 A：人工调参看得见）。
 * 回答一个问题：你打过 4–5 星的条目，集中在哪些兴趣词 / 信源 / 主题域——
 * 作为调整评分权重与兴趣词的依据（04 §4.1：先人工调参，不训练模型）。
 */
import { hitInterests } from './rules'
import { DOMAIN_LABEL } from '../content/collect'
import type { Item, Source } from '../types/models'

export interface CountEntry {
  /** 展示名（兴趣词原文 / 信源名 / 主题域中文名） */
  label: string
  /** 高分条目中的出现次数 */
  count: number
}

export interface StarStats {
  /** 打过星的条目总数 */
  rated: number
  /** 平均星级（一位小数） */
  avgStars: number
  /** 4–5 星条目数 */
  high: number
  /** 高分条目的兴趣词命中（按当前配置的兴趣词表重算）Top 8 */
  interestHits: CountEntry[]
  /** 高分条目的信源 Top 6 */
  sources: CountEntry[]
  /** 高分条目的主题域 Top 6 */
  domains: CountEntry[]
}

const HIGH_MIN = 4

export function starStats(
  items: Item[],
  interests: string[],
  sources: Pick<Source, 'id' | 'name' | 'domain'>[],
): StarStats {
  const rated = items.filter((i) => i.annotation.stars > 0)
  const high = rated.filter((i) => i.annotation.stars >= HIGH_MIN)
  const avgStars = rated.length
    ? Math.round((rated.reduce((n, i) => n + i.annotation.stars, 0) / rated.length) * 10) / 10
    : 0

  const interestCount = new Map<string, number>()
  const sourceCount = new Map<string, number>()
  const domainCount = new Map<string, number>()
  const domainOf = new Map(sources.map((s) => [s.id, s.domain]))

  for (const item of high) {
    const text = `${item.title} ${item.summary}`
    for (const word of hitInterests(text, interests)) {
      interestCount.set(word, (interestCount.get(word) ?? 0) + 1)
    }
    if (item.sourceName) sourceCount.set(item.sourceName, (sourceCount.get(item.sourceName) ?? 0) + 1)
    const domain = domainOf.get(item.sourceId) ?? item.tags.find((t) => DOMAIN_LABEL[t])
    if (domain) {
      const label = DOMAIN_LABEL[domain] ?? domain
      domainCount.set(label, (domainCount.get(label) ?? 0) + 1)
    }
  }

  const toEntries = (m: Map<string, number>, limit: number): CountEntry[] =>
    [...m.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([label, count]) => ({ label, count }))

  return {
    rated: rated.length,
    avgStars,
    high: high.length,
    interestHits: toEntries(interestCount, 8),
    sources: toEntries(sourceCount, 6),
    domains: toEntries(domainCount, 6),
  }
}
