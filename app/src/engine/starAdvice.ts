/**
 * 星级反馈的调参建议（2026-10 方案 B：统计 → 建议 → 一键采纳）。
 * 规则朴素可解释，每条建议必须说得出依据；采纳只改权重/兴趣词，不自动改信源
 * （信源分级涉及面大，只给"去看看"入口）。
 */
import type { StarStats } from './starStats'
import type { CollectConfig, ScoreWeights } from '../types/models'

export interface StarAdvice {
  id: string
  /** 建议正文（含依据） */
  text: string
  /** 一键采纳：合并进配置的补丁；无补丁的是"去看看"型建议 */
  apply?: { weights?: Partial<ScoreWeights>; interests?: string[] }
  /** 采纳后需要跳转的页面（与 apply 互斥使用） */
  goTo?: string
}

const PP = 0.05 // 权重调整步长（5 个百分点，源自当前值）

export function starAdvice(stats: StarStats, config: CollectConfig): StarAdvice[] {
  const out: StarAdvice[] = []
  if (stats.rated === 0) return out

  const weights = config.weights ?? { source: 0.3, novelty: 0.25, relevance: 0.25, utility: 0.2 }

  // ① 高分条目没命中兴趣词：评分的"锚"没对上你的口味——补锚（不猜词，让用户自己加）
  if (stats.high >= 3 && stats.interestHits.length === 0) {
    out.push({
      id: 'anchor-missing',
      text: `${stats.high} 条高分条目没有命中任何兴趣词——评分锚点和你打星的标准对不上。建议翻看这些条目的标题，把反复出现的关键词加进兴趣域（上面即可添加）。`,
    })
  }

  // ② 高分集中在少数信源：信源维度被低估——上调 source 权重（或去上调分级）
  if (stats.high >= 4 && stats.sources.length > 0 && stats.sources[0]!.count >= Math.ceil(stats.high * 0.6)) {
    out.push({
      id: 'source-undervalued',
      text: `${stats.high} 条高分里 ${stats.sources[0]!.count} 条来自「${stats.sources[0]!.label}」——好东西集中在少数信源。可一键上调「信源」权重 ${Math.round(PP * 100)} 个百分点；或去信源管理页把该源升到 T1。`,
      apply: { weights: { source: weights.source + PP } },
      goTo: '/input/sources',
    })
  }

  // ③ 打星总量可观但高分占比低：筛出来的大多数你不认可——下调相关度权重，让 Top N 更贴口味？反向：relevance 过强压住了其他维度
  if (stats.rated >= 6 && stats.high / stats.rated <= 0.2 && weights.relevance > 0.15) {
    out.push({
      id: 'relevance-overvalued',
      text: `打过星的 ${stats.rated} 条里只有 ${stats.high} 条是高分——推上来的内容你大多不买账，「相关度」权重可能偏高。可一键下调 ${Math.round(PP * 100)} 个百分点再观察一轮。`,
      apply: { weights: { relevance: Math.max(0, weights.relevance - PP) } },
    })
  }

  return out
}
