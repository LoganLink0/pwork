/**
 * 聚合分析引擎（M7 / PRD V2）：全部从本地档案实时计算，纯函数。
 * 原则：只统计、不评判——数字呈现，解释权在用户。
 */
import { SCENARIO_LABEL } from '../content/copy'
import type { Delta, InsightRecord, ReviewRecord, ScenarioKey } from '../types/models'

const pad = (n: number) => String(n).padStart(2, '0')
const monthKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`

const MET: Delta[] = ['up', 'zero', 'new']
const MISSED: Delta[] = ['down', 'gone']

export interface MonthBucket {
  month: string
  reviews: number
  insights: number
  /** 差异中"达成方向"（↑/0/+）的条数 */
  met: number
  /** 差异中"未达成"（↓/−）的条数 */
  missed: number
}

/** 近 N 个月的复盘/认知/达成分档趋势（含当前月） */
export function monthlyTrend(reviews: ReviewRecord[], insights: InsightRecord[], months = 6, now = new Date()): MonthBucket[] {
  const buckets: MonthBucket[] = []
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    buckets.push({ month: monthKey(d), reviews: 0, insights: 0, met: 0, missed: 0 })
  }
  const index = new Map(buckets.map((b, i) => [b.month, i]))

  for (const r of reviews) {
    const i = index.get(r.createdAt.slice(0, 7))
    if (i === undefined) continue
    buckets[i].reviews++
    for (const gap of r.clap.comparison.gaps) {
      if (MET.includes(gap.delta)) buckets[i].met++
      if (MISSED.includes(gap.delta)) buckets[i].missed++
    }
  }
  for (const ins of insights) {
    // 兼容 M2 之前的旧数据：洞察卡可能没有 createdAt（跳过统计）
    if (!ins.createdAt) continue
    const i = index.get(ins.createdAt.slice(0, 7))
    if (i !== undefined) buckets[i].insights++
  }
  return buckets
}

export interface ScenarioSlice {
  scenario: ScenarioKey
  label: string
  count: number
}

export function scenarioDistribution(reviews: ReviewRecord[]): ScenarioSlice[] {
  const counts = new Map<ScenarioKey, number>()
  for (const r of reviews) counts.set(r.scenario, (counts.get(r.scenario) ?? 0) + 1)
  return [...counts.entries()]
    .map(([scenario, count]) => ({ scenario, label: SCENARIO_LABEL[scenario], count }))
    .sort((a, b) => b.count - a.count)
}

export interface PatternSlice {
  group: string
  sample: string
  count: number
}

/** 高频主题：同一主题指纹出现 ≥2 次的聚合，按次数降序 */
export function topPatterns(insights: InsightRecord[], limit = 5): PatternSlice[] {
  const groups = new Map<string, InsightRecord[]>()
  for (const ins of insights) {
    if (ins.patternGroup === 'empty') continue
    const list = groups.get(ins.patternGroup) ?? []
    list.push(ins)
    groups.set(ins.patternGroup, list)
  }
  return [...groups.values()]
    .filter((g) => g.length >= 2)
    .sort((a, b) => b.length - a.length)
    .slice(0, limit)
    .map((g) => ({
      group: g[0].patternGroup,
      sample: g[0].text,
      count: g.length,
    }))
}

/** 认知更新按月计数（与趋势同窗口） */
export function insightTimeline(insights: InsightRecord[], months = 6, now = new Date()): { month: string; count: number }[] {
  return monthlyTrend([], insights, months, now).map((b) => ({ month: b.month, count: b.insights }))
}
