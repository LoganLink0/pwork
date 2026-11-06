import { listErrors } from './errorLog'
import type { ErrorLogEntry } from '../types/models'

/**
 * 首页健康提示（WorkBuddy 学习批，2026-11-06）：把「在悄悄变重的事」主动顶出来。
 * 备份超期已有专门的 backupReminder 机制（首页提醒条 + 暂缓），这里只做
 * 错误堆积信号：近一周错误超过阈值才提示（零星错误不打扰），可当天关闭。
 * 纯函数判定与数据加载分离，判定可单测。
 */
export interface HealthNotice {
  title: string
  desc: string
  to: string
  actionLabel: string
}

/** 错误堆积阈值：近 7 天超过这个条数才提示 */
export const ERROR_THRESHOLD = 5

export function evaluateHealth(errors: ErrorLogEntry[], now = new Date()): HealthNotice | null {
  const weekAgo = now.getTime() - 7 * 86_400_000
  const recent = errors.filter((e) => new Date(e.at).getTime() >= weekAgo)
  if (recent.length > ERROR_THRESHOLD) {
    return {
      title: `近一周有 ${recent.length} 条错误记录`,
      desc: '多为网络抓取类重试失败，有空可导出看看',
      to: '/settings?tab=errors',
      actionLabel: '去看',
    }
  }
  return null
}

/** 数据加载薄壳：读错误日志（取 50 条足够覆盖一周阈值） */
export async function healthNotice(now = new Date()): Promise<HealthNotice | null> {
  const errors = await listErrors(50)
  return evaluateHealth(errors, now)
}

/** 当天关闭标记：次日恢复提醒（key + 日期，避免永久屏蔽） */
const DISMISS_KEY = 'pwork-health-dismiss'

export function dismissHealthToday(key: string, now = new Date()): void {
  try {
    localStorage.setItem(DISMISS_KEY, JSON.stringify({ key, day: now.toISOString().slice(0, 10) }))
  } catch {
    // 静默跳过
  }
}

export function healthDismissedToday(key: string, now = new Date()): boolean {
  try {
    const v = localStorage.getItem(DISMISS_KEY)
    if (!v) return false
    const d = JSON.parse(v) as { key: string; day: string }
    return d.key === key && d.day === now.toISOString().slice(0, 10)
  } catch {
    return false
  }
}
