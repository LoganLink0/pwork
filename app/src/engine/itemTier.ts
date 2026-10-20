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
