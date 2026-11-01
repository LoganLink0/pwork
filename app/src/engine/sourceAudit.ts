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

/* ------------------------------ 失败分类（信源融合批 2026-11-01） ------------------------------
 * 健康列的 lastError 此前只有原始报错——用户看到「连接失败」会以为源死了直接删，
 * 而其中很大一部分只是本地网络到不了源站（部署云端抓取的用户这些源全能用，
 * 权威信源调研实测 12 个权威源属此类）。按报错文本分三类给人话提示。 */

export type FailKind = 'network' | 'server' | 'dead'

/** 按抓取报错分类：network=本地到不了（云端可救）/ server=源站侧问题（稍后重试）/ dead=源可能已停更 */
export function classifySourceError(msg: string | null): { kind: FailKind; hint: string } | null {
  if (!msg) return null
  if (/超时|网络\/CORS|连接失败|fetch failed|Failed to fetch|Connection|解析失败/i.test(msg)) {
    return { kind: 'network', hint: '可能是本地网络到不了这个源站（源本身未必死了）——部署了云端抓取的话可交给云端收' }
  }
  if (/HTTP 429|HTTP 5\d\d/i.test(msg)) {
    return { kind: 'server', hint: '源站限流或服务端故障——稍后重试，连续多次再考虑换源' }
  }
  if (/HTTP 404|HTTP 410|没有找到条目|XML 解析失败|不是 RSS|响应体/i.test(msg)) {
    return { kind: 'dead', hint: '源可能已停更或地址失效——确认源站是否还提供 RSS，或换新地址' }
  }
  return null
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
