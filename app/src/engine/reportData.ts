/**
 * 报告数据管道（输出 O1，05 增补）：从各模块只读引用汇总素材——零拷贝（02 铁律 4）。
 * 周期：weekly = 近 7 天，monthly = 近 30 天（滚动窗口，本地日判定用 localDateOf）。
 */
import { db } from '../db/schema'
import { listBlocks } from '../db/blocksRepo'
import { localDateOf, todayLocal } from './datetime'
import { gatherSignals, type Signal } from './signals'

export type ReportMode = 'weekly' | 'monthly'

export interface ReportData {
  mode: ReportMode
  rangeLabel: string
  sinceLocal: string
  today: string
  tasks: {
    closed: { title: string; closedAt: string }[]
    openCount: number
    overdueCount: number
    closureRate: number
  }
  goals: { active: { title: string; due?: string; progressNote?: string }[]; doneInRange: number }
  insights: { text: string }[]
  topItems: { title: string; url: string; score: number; sourceName: string; otFlag: string | null }[]
  reviews: { count: number; titles: string[] }
  notesCount: number
  signals: Signal[]
  /** 外部数据块（输出扩展）：工作台外带来的结构化片段，行内"键: 值"解析为 kv */
  blocks: { title: string; kv: { k: string; v: string }[]; text: string[] }[]
}

const WINDOW_DAYS: Record<ReportMode, number> = { weekly: 7, monthly: 30 }

export async function gatherReportData(mode: ReportMode, now = new Date()): Promise<ReportData> {
  const days = WINDOW_DAYS[mode]
  const since = new Date(now)
  since.setDate(now.getDate() - (days - 1))
  since.setHours(0, 0, 0, 0)
  const sinceLocal = todayLocal(since)
  const rangeLabel = `近 ${days} 天 · 至 ${todayLocal(now)}`

  const inRange = (iso: string | null | undefined) => {
    if (!iso) return false
    const d = localDateOf(iso)
    return d !== '' && d >= sinceLocal && d <= todayLocal(now)
  }

  const [allTasks, allGoals, allInsights, allItems, recentReviews, allNotes] = await Promise.all([
    db.tasks.toArray(),
    db.goals.toArray(),
    db.insights.toArray(),
    db.items.toArray(),
    db.reviews.orderBy('createdAt').reverse().toArray(),
    db.notes.toArray(),
  ])

  const live = allTasks.filter((t) => t.deletedAt === null)
  const closed = live
    .filter((t) => t.status === 'done' && inRange(t.closedAt))
    .map((t) => ({ title: t.title, closedAt: t.closedAt! }))
  const open = live.filter((t) => t.status === 'todo')
  const today = todayLocal(now)
  const overdueCount = open.filter((t) => (t.due ?? '9999') < today).length
  const closureRate = live.length === 0 ? 0 : Math.round((live.filter((t) => t.status === 'done').length / live.length) * 100)

  const activeGoals = allGoals
    .filter((g) => g.status === 'active' && g.deletedAt === null)
    .map((g) => ({ title: g.title, due: g.due, progressNote: g.progressNote }))
  const doneInRange = allGoals.filter((g) => g.status === 'done' && inRange(g.closedAt)).length

  const insights = allInsights
    .filter((i) => inRange(i.createdAt))
    .map((i) => ({ text: i.text }))
    .slice(0, 8)

  const topItems = allItems
    .filter((i) => i.stage === 'scored' || i.stage === 'kept')
    .filter((i) => inRange(i.fetchedAt) && i.score.total >= 60)
    .sort((a, b) => b.score.total - a.score.total)
    .slice(0, 5)
    .map((i) => ({ title: i.title, url: i.url, score: i.score.total, sourceName: i.sourceName, otFlag: i.otFlag }))

  const reviewsInRange = recentReviews.filter((r) => inRange(r.createdAt))
  const notesCount = allNotes.filter((n) => n.deletedAt === null && inRange(n.createdAt)).length

  const signals = await gatherSignals(now)

  const rawBlocks = await listBlocks()
  const blocks = rawBlocks.map((b) => ({ title: b.title, ...parseBlockLines(b.content) }))

  return {
    mode,
    rangeLabel,
    sinceLocal,
    today: todayLocal(now),
    tasks: { closed, openCount: open.length, overdueCount, closureRate },
    goals: { active: activeGoals, doneInRange },
    insights,
    topItems,
    reviews: { count: reviewsInRange.length, titles: reviewsInRange.map((r) => r.title).slice(0, 3) },
    notesCount,
    signals,
    blocks,
  }
}

/** 数据块内容解析：行内 "键: 值"（键 ≤24 字，中英冒号均可）→ 指标行；其余为文本行 */
export function parseBlockLines(content: string): { kv: { k: string; v: string }[]; text: string[] } {
  const kv: { k: string; v: string }[] = []
  const text: string[] = []
  for (const raw of content.split('\n')) {
    const line = raw.trim()
    if (!line) continue
    const m = line.match(/^([^：:]{1,24})[：:]\s*(.+)$/)
    if (m) kv.push({ k: m[1].trim(), v: m[2].trim() })
    else text.push(line)
  }
  return { kv, text }
}
