/**
 * 信源自检（信源主动识别·第一层，2026-11-01）：每个信源近 30 天的四项产出指标
 * （抓取 / 互动 / 多推 / 少推）→ 三类健康画像 + 人话建议。
 * 与 sourceCredit（投票自动升降档）的分工：credit 管"档位动作"，audit 管"健康报告"——
 * 它覆盖 credit 看不见的两类问题：零互动信源（样本保护让 credit 永远不动它）
 * 与高噪声信源（抓得多但好评率低）。
 * 分类规则可解释、样本保护优先：抓取不足 5 条只说"观察中"，不下任何结论。
 */
import type { Item, Source } from '../types/models'

export type SourceVerdict = 'good' | 'noisy' | 'idle' | 'young'

export interface SourceAudit {
  sourceId: string
  name: string
  tier: number
  active: boolean
  /** 近 30 天抓取条数 */
  fetched: number
  /** 其中投过票的条数 */
  rated: number
  /** 多推数 */
  want: number
  /** 少推数 */
  no: number
  verdict: SourceVerdict
  advice: string
}

const WINDOW_DAYS = 30
const VERDICT_LABEL: Record<SourceVerdict, string> = {
  good: '产出健康',
  noisy: '噪声偏高',
  idle: '零命中',
  young: '观察中',
}

export function verdictLabel(v: SourceVerdict): string {
  return VERDICT_LABEL[v]
}

/** 单信源四指标 → 画像。规则顺序即优先级：样本保护最先，good 次之，噪声与零命中随后 */
export function auditOne(fetched: number, rated: number, want: number, _no: number): { verdict: SourceVerdict; advice: string } {
  if (fetched < 5) {
    return { verdict: 'young', advice: `近 30 天仅 ${fetched} 条——样本不足，先观察再评判` }
  }
  const wantRate = rated > 0 ? want / rated : 0
  if (rated >= 5 && wantRate >= 0.3) {
    return { verdict: 'good', advice: `近 30 天 ${fetched} 条、多推 ${want} 条——正在稳定产出你想要的内容` }
  }
  if (rated >= 5 && wantRate < 0.3) {
    return { verdict: 'noisy', advice: `抓了 ${fetched} 条，${rated} 条投票里只有 ${want} 条多推——噪声偏高，建议降档、收紧兴趣域或换源` }
  }
  if (rated === 0) {
    return { verdict: 'idle', advice: `近 30 天 ${fetched} 条，没有一条让你想投票——考虑降档、换源或停订` }
  }
  return { verdict: 'young', advice: `近 30 天 ${fetched} 条、仅 ${rated} 条投过票——样本不足，先观察再评判` }
}

/** 全信源自检：窗口内按 fetchedAt 统计（软删除不计；active 与否都算——停用源的历史表现仍有参考价值） */
export function auditSources(items: Item[], sources: Source[], now = new Date()): SourceAudit[] {
  const since = new Date(now.getTime() - WINDOW_DAYS * 86_400_000).toISOString()
  const stats = new Map<string, { fetched: number; rated: number; want: number; no: number }>()
  for (const i of items) {
    if (i.deletedAt || i.fetchedAt < since) continue
    const s = stats.get(i.sourceId) ?? { fetched: 0, rated: 0, want: 0, no: 0 }
    s.fetched += 1
    const v = i.annotation?.vote
    if (v) {
      s.rated += 1
      if (v === 'want') s.want += 1
      if (v === 'no') s.no += 1
    }
    stats.set(i.sourceId, s)
  }
  return sources.map((src) => {
    const s = stats.get(src.id) ?? { fetched: 0, rated: 0, want: 0, no: 0 }
    const { verdict, advice } = auditOne(s.fetched, s.rated, s.want, s.no)
    return { sourceId: src.id, name: src.name, tier: src.tier, active: src.active, ...s, verdict, advice }
  })
}
