/**
 * 信号触发复盘（03 §4 第 5 项，W5）：任务逾期、复盘欠账、模式重演 → 推荐开复盘。
 * 纯函数聚合 + db 装配分离；信号只"推荐"，不强制、不弹窗轰炸。
 */
import { db } from '../db/schema'
import { todayLocal } from './datetime'

export interface Signal {
  kind: 'tasks-overdue' | 'review-due' | 'pattern-repeat'
  message: string
}

export interface SignalInput {
  /** 未完成任务（title + due） */
  openTasks: { title: string; due?: string }[]
  /** 最近一次复盘（任何状态）的创建时间 */
  lastReviewCreatedAt: string | null
  /** 洞察卡 patternGroup → 出现次数 */
  patternCounts: Record<string, number>
  now?: Date
}

/** 纯聚合：逾期任务（过截止 ≥1 天）≥2、距上次复盘 ≥7 天、同一模式第 ≥3 次 */
export function collectSignals(input: SignalInput): Signal[] {
  const signals: Signal[] = []
  const today = todayLocal(input.now ?? new Date())
  const overdue = input.openTasks.filter((t) => t.due !== undefined && t.due < today)
  if (overdue.length >= 2) {
    signals.push({
      kind: 'tasks-overdue',
      message: `${overdue.length} 项任务已逾期（如「${overdue[0]!.title.slice(0, 12)}」）——建议开一次复盘看看卡在哪里`,
    })
  }
  if (input.lastReviewCreatedAt) {
    const days = Math.floor((Date.now() - new Date(input.lastReviewCreatedAt).getTime()) / 86_400_000)
    if (days >= 7) {
      signals.push({ kind: 'review-due', message: `距上次复盘已经 ${days} 天——节奏是每周一次小小的经营分析会` })
    }
  }
  const repeated = Object.entries(input.patternCounts).find(([, n]) => n >= 3)
  if (repeated) {
    signals.push({
      kind: 'pattern-repeat',
      message: '同一模式第 3 次出现（见认知资产库的模式警示）——值得一次双环复盘',
    })
  }
  return signals
}

/** 从库装配信号（首页瓦片 / 新建复盘素材卡共用） */
export async function gatherSignals(now = new Date()): Promise<Signal[]> {
  const [tasks, reviews, insights] = await Promise.all([
    db.tasks.toArray(),
    db.reviews.orderBy('createdAt').reverse().limit(1).toArray(),
    db.insights.toArray(),
  ])
  const today = todayLocal(now)
  const openTasks = tasks
    .filter((t) => t.deletedAt === null && (t.status === 'todo' || t.status === 'doing'))
    .map((t) => ({ title: t.title, due: t.due }))
  void today
  const patternCounts: Record<string, number> = {}
  for (const i of insights) {
    if (!i.patternGroup) continue
    patternCounts[i.patternGroup] = (patternCounts[i.patternGroup] ?? 0) + 1
  }
  return collectSignals({
    openTasks,
    lastReviewCreatedAt: reviews[0]?.createdAt ?? null,
    patternCounts,
    now,
  })
}
