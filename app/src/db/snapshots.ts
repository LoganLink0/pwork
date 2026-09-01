/**
 * 周趋势快照存储（输出 O1 增补）：每次生成报告 upsert 当日一行；
 * 聚合出环比（上一条快照对比）与趋势序列（图表用）。
 */
import { db } from './schema'
import type { ReportData } from '../engine/reportData'
import type { ReportSnapshot } from '../types/models'
import { todayLocal } from '../engine/datetime'

/** 生成/刷新当日快照（ReportData 已含本期统计） */
export async function saveSnapshot(data: ReportData, now = new Date()): Promise<ReportSnapshot> {
  const day = todayLocal(now)
  const snap: ReportSnapshot = {
    id: `snap_${day}`,
    day,
    closureRate: data.tasks.closureRate,
    closedCount: data.tasks.closed.length,
    openCount: data.tasks.openCount,
    overdueCount: data.tasks.overdueCount,
    goalsActive: data.goals.active.length,
    insightsCount: data.insights.length,
    notesCount: data.notesCount,
    createdAt: now.toISOString(),
  }
  await db.snapshots.put(snap)
  return snap
}

/** 按时间倒序的快照序列（趋势图用，limit 默认 12） */
export async function listSnapshots(limit = 12): Promise<ReportSnapshot[]> {
  const all = await db.snapshots.orderBy('createdAt').reverse().limit(limit).toArray()
  return all.reverse() // 转为时间正序
}

/** 环比基准：最近一条快照（当前生成之前写入的） */
export async function latestSnapshotBefore(now = new Date()): Promise<ReportSnapshot | null> {
  const snaps = await db.snapshots.orderBy('createdAt').reverse().limit(1).toArray()
  const s = snaps[0]
  if (!s) return null
  // 当日已写入过的快照不算"上期"——上期应早于今天
  if (s.day >= todayLocal(now)) {
    const prev = await db.snapshots.where('day').below(todayLocal(now)).last()
    return prev ?? null
  }
  return s
}

/** 环比文案：报告里的"较上期 ±X pp" */
export function deltaLabel(current: number, prev: number | undefined | null): string {
  if (prev === undefined || prev === null) return ''
  const diff = Math.round(current - prev)
  if (diff === 0) return '与上期持平'
  return `较上期 ${diff > 0 ? '+' : ''}${diff} pp`
}
