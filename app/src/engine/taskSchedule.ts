/**
 * 待办与目标的时间视图分组（「即将到来」，2026-10-24）。
 * 回答三个时间视角的问题：某天要交什么 / 本周负载分布 / 目标还剩几天。
 * 纯函数：逾期置顶、按日升序、无期限待办沉底；已完成与无期限目标不进时间线。
 */
import type { Goal, TaskItem } from '../types/models'
import { todayLocal, weekdayLocal } from './datetime'

export interface ScheduleEntry {
  kind: 'task' | 'goal'
  id: string
  title: string
  due: string
  /** 逾期天数（仅逾期组，>0） */
  overDays?: number
  origin?: TaskItem['origin']
}

export interface ScheduleGroup {
  key: string
  label: string
  tone: 'over' | 'today' | 'normal' | 'none'
  entries: ScheduleEntry[]
}

const DAY_MS = 86_400_000
const dateKey = (iso: string) => new Date(iso + 'T12:00:00')

/** 主分组：返回排序后的分组列表（逾期 → 今天 → 未来按日 → 无期限沉底） */
export function scheduleGroups(
  tasks: TaskItem[],
  goals: Goal[],
  now = new Date(),
): ScheduleGroup[] {
  const today = todayLocal(now)

  const buckets = new Map<string, ScheduleGroup>()
  const bucket = (key: string, label: string, tone: ScheduleGroup['tone']) => {
    let g = buckets.get(key)
    if (!g) {
      g = { key, label, tone, entries: [] }
      buckets.set(key, g)
    }
    return g
  }

  const place = (e: ScheduleEntry) => {
    if (!e.due) {
      bucket('none', '无期限', 'none').entries.push(e)
      return
    }
    const diff = Math.round((dateKey(e.due).getTime() - dateKey(today).getTime()) / DAY_MS)
    if (diff < 0) {
      bucket('over', '已逾期', 'over').entries.push({ ...e, overDays: -diff })
    } else if (diff === 0) {
      bucket(today, '今天', 'today').entries.push(e)
    } else if (diff === 1) {
      bucket(e.due, '明天', 'normal').entries.push(e)
    } else if (diff === 2) {
      bucket(e.due, '后天', 'normal').entries.push(e)
    } else {
      const d = dateKey(e.due)
      bucket(e.due, `${d.getMonth() + 1}月${d.getDate()}日 · 周${weekdayLocal(d)}`, 'normal').entries.push(e)
    }
  }

  for (const t of tasks) {
    if (t.deletedAt !== null || t.status !== 'todo') continue
    place({ kind: 'task', id: t.id, title: t.title, due: t.due ?? '', origin: t.origin })
  }
  for (const g of goals) {
    if (g.deletedAt !== null || g.status !== 'active' || !g.due) continue
    place({ kind: 'goal', id: g.id, title: g.title, due: g.due })
  }

  const orderKey = (g: ScheduleGroup): string => {
    if (g.key === 'over') return '0000-00-00'
    if (g.key === 'none') return '9999-99-99'
    return g.key
  }
  return [...buckets.values()].sort((a, b) => orderKey(a).localeCompare(orderKey(b)))
}
