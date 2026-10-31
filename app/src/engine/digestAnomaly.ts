/**
 * 日报主题异动（信源主动识别·第三层，2026-11-01）：关注主题的 30 天基线 vs 当日命中——
 * 日报从"今天什么最多"升级为"今天什么反常"。基线 = 该主题近 30 天（不含今天）的日均命中条数；
 * 当日命中 ≥ max(3, 基线×3) 且基线 ≥ 0.2（有历史记录）判为异动——避免冷门主题一两篇就误报。
 */
import { hitInterests } from './rules'
import type { Item } from '../types/models'

export interface TopicAnomaly {
  topic: string
  /** 当日命中条数 */
  today: number
  /** 近 30 天（不含今天）日均命中条数 */
  baseline: number
  /** 当日 / 基线的倍数 */
  ratio: number
}

const WINDOW_DAYS = 30

/** 逐主题统计命中：text = 标题+摘要（与规则引擎同一输入口径）；
 *  基线窗口锚定查看日期（dayLocal）往前 30 天——回看历史日期时异动同样成立 */
export function topicAnomalies(items: Item[], interests: string[], dayLocal: string, localDateOf: (iso: string) => string): TopicAnomaly[] {
  if (interests.length === 0) return []
  const anchor = new Date(`${dayLocal}T12:00:00`)
  if (Number.isNaN(anchor.getTime())) return []
  const windowFrom = localDateOf(new Date(anchor.getTime() - (WINDOW_DAYS + 1) * 86_400_000).toISOString())
  const live = items.filter((i) => !i.deletedAt)
  const dayItems = live.filter((i) => localDateOf(i.fetchedAt) === dayLocal)
  const pastItems = live.filter((i) => {
    const d = localDateOf(i.fetchedAt)
    return d !== dayLocal && d >= windowFrom && d < dayLocal
  })
  const out: TopicAnomaly[] = []
  for (const topic of interests) {
    const today = dayItems.filter((i) => hitInterests(`${i.title} ${i.summary}`, [topic]).length > 0).length
    if (today === 0) continue
    const baselineTotal = pastItems.filter((i) => hitInterests(`${i.title} ${i.summary}`, [topic]).length > 0).length
    const baseline = baselineTotal / WINDOW_DAYS
    if (baseline < 0.2) continue // 没有历史记录的主题不判异动（新关注词先攒基线）
    const ratio = today / baseline
    if (today >= 3 && ratio >= 3) out.push({ topic, today, baseline, ratio })
  }
  return out.sort((a, b) => b.ratio - a.ratio)
}
