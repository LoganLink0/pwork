/**
 * 规则引擎：预筛（零成本砍量）+ 规则评分（C1 的降级链模式，04 §4/§5）。
 * 纯函数；所有判定可解释——每条评分必须附 ≤30 字理由（04 §5 红线）。
 */
import type { CollectConfig, ScoreBreakdown, Source } from '../types/models'

/** 工具性启发词（utility 维度的近似；C2 由 AI 判定） */
const UTILITY_WORDS = ['开源', '发布', '教程', '实践', '工具', '方法论', '案例', '复盘', '免费', 'api', '模板']

/** 四维固定权重（04 §4.1 公式）。2026-10-20 起不可配置：信源分级已由投票自动调整，
 *  权重再可调等于一个看不见的隐藏参数在暗中生效；2026-10-26 配置字段整体退役 */
const W: Readonly<{ source: number; novelty: number; relevance: number; utility: number }> = {
  source: 0.3,
  novelty: 0.25,
  relevance: 0.25,
  utility: 0.2,
}

export interface PrefilterInput {
  title: string
  summary: string
  config: CollectConfig
}

export type PrefilterVerdict = { pass: true } | { pass: false; reason: string }

/** 预筛（04 §4 ③）：黑名单词（dislikes）、标题过短、无 URL 在流水线层拦截 */
export function prefilter(input: PrefilterInput): PrefilterVerdict {
  const text = `${input.title} ${input.summary}`.toLowerCase()
  const hit = input.config.dislikes.find((d) => d.trim() && text.includes(d.trim().toLowerCase()))
  if (hit) return { pass: false, reason: `命中屏蔽词「${hit}」` }
  if (input.title.replace(/\s+/g, '').length < 6) {
    return { pass: false, reason: '标题过短' }
  }
  return { pass: true }
}

export interface ScoreInput {
  source: Source
  title: string
  summary: string
  /** 同主题域今日已入库条数（novelty 依据：同域密集 → 衰减） */
  domainCountToday: number
  config: CollectConfig
}

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n))
}

/** 兴趣词命中（用于 relevance 与 tags） */
export function hitInterests(text: string, interests: string[]): string[] {
  const lower = text.toLowerCase()
  return interests.filter((i) => i.trim() && lower.includes(i.trim().toLowerCase()))
}

/** 规则评分（与 04 §4.1 同公式，四维均为规则近似；aiBy='rules'）。权重固定（见顶部 W 说明） */
export function scoreByRules(input: ScoreInput): { score: ScoreBreakdown; reason: string; tags: string[] } {
  const text = `${input.title} ${input.summary}`

  // source：信源权重（机器给定，无需 AI）
  const source = clamp01(input.source.weight)

  // novelty：同域当日密集 → 衰减（0.6）；否则视为新信息
  const novelty = input.domainCountToday >= 5 ? 0.6 : 1

  // relevance：兴趣词命中数（0 命中 0.2；≥3 命中封顶 1.0）
  const interestHits = hitInterests(text, input.config.interests)
  const relevance = interestHits.length === 0 ? 0.2 : clamp01(0.34 * interestHits.length)

  // utility：工具词命中数（0 命中 0.3；命中 0.4 + 0.3/词 封顶 1.0）
  const lowerText = text.toLowerCase()
  const utilityHits = UTILITY_WORDS.filter((w) => lowerText.includes(w)).length
  const utility = utilityHits === 0 ? 0.3 : clamp01(0.4 + 0.3 * (utilityHits - 1))

  const total = Math.round(
    100 * (W.source * source + W.novelty * novelty + W.relevance * relevance + W.utility * utility),
  )

  // 理由 ≤30 字（04 §5：评分不许是黑盒）
  const parts = [
    `源${source.toFixed(1)}`,
    novelty === 1 ? '新信息' : '同域密集',
    interestHits.length ? `兴趣×${interestHits.length}` : '兴趣弱',
    utilityHits ? `工具×${utilityHits}` : null,
  ].filter((p): p is string => p !== null)
  const reason = parts.join('·').slice(0, 30)

  const tags = [...new Set([...interestHits, input.source.domain])].slice(0, 5)

  return {
    score: { total, source, novelty, relevance, utility },
    reason,
    tags,
  }
}
