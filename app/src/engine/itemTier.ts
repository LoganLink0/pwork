/**
 * 条目分层（2026-10-20）：回答"今天抓回来的这些，先看哪条"。
 *
 * 为什么按排名不按分数阈值：规则引擎的分数分布挤在 60–70 一带（源权重主导、
 * 兴趣词命中稀疏），绝对阈值要么永远够不着、要么一刀切歪；按同日条目的相对
 * 排名分层，三类永远真实存在，含义也直白——必看=这天里排最前的。
 *
 * 档位：每天按分数降序，第 1–2 条 必看（must），第 3–8 条 可看（may），
 * 其余 可略（skip）。已筛除（discarded）不参与排名，由卡片按状态单独标。
 */
import { todayLocal } from './datetime'
import type { Item } from '../types/models'

export type ItemTier = 'must' | 'may' | 'skip'

/** 同日条目按分数分层；返回 itemId → 档位（只覆盖未删除、未筛除的条目） */
export function itemTiers(items: Item[]): Map<string, ItemTier> {
  const byDay = new Map<string, Item[]>()
  for (const i of items) {
    if (i.deletedAt || i.stage === 'discarded') continue
    const day = (i.fetchedAt ?? '').slice(0, 10) || todayLocal()
    const list = byDay.get(day)
    if (list) list.push(i)
    else byDay.set(day, [i])
  }
  const tiers = new Map<string, ItemTier>()
  for (const list of byDay.values()) {
    list.sort((a, b) => b.score.total - a.score.total || (a.fetchedAt < b.fetchedAt ? -1 : 1))
    list.forEach((item, idx) => {
      tiers.set(item.id, idx < 2 ? 'must' : idx < 8 ? 'may' : 'skip')
    })
  }
  return tiers
}

export const TIER_LABEL: Record<ItemTier, string> = { must: '必看', may: '可看', skip: '可略' }

/**
 * 对齐统计（2026-10-20）：最近 N 天你标「多推」的条目，当时被分层的情况。
 * 必看占比升高 = 系统的预判越来越接近你的标准；落在"可略"里的是它还没学会的部分。
 */
export function alignmentStats(items: Item[], days = 30): { want: number; must: number; may: number; skip: number } | null {
  const since = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10)
  const recent = items.filter((i) => !i.deletedAt && i.annotation?.vote === 'want' && (i.fetchedAt ?? '') >= since)
  if (recent.length === 0) return null
  const tiers = itemTiers(items) // 全量重算，与页面展示口径一致
  let must = 0
  let may = 0
  let skip = 0
  for (const i of recent) {
    const t = tiers.get(i.id)
    if (t === 'must') must += 1
    else if (t === 'may') may += 1
    else skip += 1
  }
  return { want: recent.length, must, may, skip }
}
