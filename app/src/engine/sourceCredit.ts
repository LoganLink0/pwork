/**
 * 信源信用（2026-10-20 第一性重设计）：用「想要」投票占比自动升降信源档位，
 * 替代"手动分级 + 权重手调 + 调参建议"那一整层中间件。
 *
 * 规则（可解释、样本保护）：
 *   - 统计各信源近 60 天被投过票的条目（want/meh/no 都算"投过"）；
 *   - 投票 ≥ minSample（默认 8）才动它——样本不足不调；
 *   - want 率 ≥60% → T1（weight 1.0）｜≥30% → T1.5（0.7）｜其余 → T2（0.4）；
 *   - 档位变了才写库（weight 同步为该档默认值），变更清单返回给调用方做通知。
 */
import { db } from '../db/schema'
import { TIER_WEIGHT } from '../content/collect'
import type { Item } from '../types/models'

export interface CreditChange {
  sourceId: string
  name: string
  fromTier: number
  toTier: number
  rated: number
  wantRate: number
}

/** want 率 → 档位（刻度与既有 tier 一致：1 / 1.5 / 2） */
export function tierFromRate(wantRate: number): 1 | 1.5 | 2 {
  if (wantRate >= 0.6) return 1
  if (wantRate >= 0.3) return 1.5
  return 2
}

/** 各信源近 60 天的投票统计（rated=投过票的条数，want=其中「想要」的条数） */
export function voteStatsBySource(items: Item[], now = new Date()): Map<string, { rated: number; want: number }> {
  const since = new Date(now.getTime() - 60 * 86_400_000).toISOString()
  const m = new Map<string, { rated: number; want: number }>()
  for (const i of items) {
    if (i.deletedAt || i.fetchedAt < since) continue
    const v = i.annotation?.vote
    if (!v) continue
    const s = m.get(i.sourceId) ?? { rated: 0, want: 0 }
    s.rated += 1
    if (v === 'want') s.want += 1
    m.set(i.sourceId, s)
  }
  return m
}

/** 按投票数据自动调整信源档位；返回发生变化的清单（未变化/样本不足不写库） */
export async function applySourceCredit(minSample = 8): Promise<CreditChange[]> {
  const [items, sources] = await Promise.all([db.items.toArray(), db.sources.toArray()])
  const stats = voteStatsBySource(items)
  const changes: CreditChange[] = []
  const dirty = sources.filter((src) => {
    const st = stats.get(src.id)
    if (!st || st.rated < minSample) return false
    return tierFromRate(st.want / st.rated) !== src.tier
  })
  if (dirty.length === 0) return changes
  const now = new Date().toISOString()
  await db.transaction('rw', db.sources, async () => {
    for (const src of dirty) {
      const st = stats.get(src.id)!
      const toTier = tierFromRate(st.want / st.rated)
      await db.sources.put({ ...src, tier: toTier, weight: TIER_WEIGHT[toTier] ?? 0.4, updatedAt: now })
      changes.push({ sourceId: src.id, name: src.name, fromTier: src.tier, toTier, rated: st.rated, wantRate: st.want / st.rated })
    }
  })
  return changes
}
