/**
 * 复盘节奏提醒（PRD 2.4 间隔重复 / M4）。
 * 打开应用时检查一次：行动逾期/今日到期 + 洞察回访到期 → 系统通知（需用户授权）。
 */
import { isDue } from './revisit'
import type { ActionItem, InsightRecord } from '../types/models'

export interface Reminder {
  kind: 'action-overdue' | 'action-due-today' | 'insight-revisit'
  title: string
  body: string
}

export function collectReminders(
  actions: ActionItem[],
  insights: InsightRecord[],
  now = new Date(),
): Reminder[] {
  const today = now.toISOString().slice(0, 10)
  const out: Reminder[] = []

  for (const a of actions) {
    if (a.status !== 'open' || !a.due) continue
    if (a.due < today) {
      out.push({
        kind: 'action-overdue',
        title: '有行动项已逾期',
        body: `「${a.text}」原定 ${a.due}。把它做完，或者明确放弃——挂着最耗心神。`,
      })
    } else if (a.due === today) {
      out.push({
        kind: 'action-due-today',
        title: '今天到期的行动项',
        body: `「${a.text}」今天到期。还记得它的"如果 X，就 Y"吗？`,
      })
    }
  }

  for (const ins of insights) {
    if (isDue(ins, now.getTime())) {
      const excerpt = ins.text.length > 24 ? `${ins.text.slice(0, 24)}…` : ins.text
      out.push({
        kind: 'insight-revisit',
        title: '洞察回访：它还成立吗？',
        body: `「${excerpt}」——回忆一次，胜过重读十次。`,
      })
    }
  }

  return out
}

/* ------------------------------ 偏好与权限 ------------------------------ */

const PREF_KEY = 'fupan-reminders'

export function remindersEnabled(): boolean {
  try {
    return localStorage.getItem(PREF_KEY) === 'on'
  } catch {
    return false
  }
}

export type PermissionOutcome = 'granted' | 'denied' | 'unsupported'

export async function enableReminders(): Promise<PermissionOutcome> {
  if (typeof Notification === 'undefined') return 'unsupported'
  const permission = await Notification.requestPermission()
  try {
    localStorage.setItem(PREF_KEY, permission === 'granted' ? 'on' : 'off')
  } catch {
    /* ignore */
  }
  return permission === 'granted' ? 'granted' : 'denied'
}

export function disableReminders(): void {
  try {
    localStorage.setItem(PREF_KEY, 'off')
  } catch {
    /* ignore */
  }
}

/** 每日至多提醒一次（sessionStorage 去重） */
export function alreadyNotifiedToday(now = new Date()): boolean {
  try {
    return sessionStorage.getItem('fupan-notified') === now.toISOString().slice(0, 10)
  } catch {
    return false
  }
}

export function markNotifiedToday(now = new Date()): void {
  try {
    sessionStorage.setItem('fupan-notified', now.toISOString().slice(0, 10))
  } catch {
    /* ignore */
  }
}

/** 发送系统通知，返回实际发送条数；未授权/不支持时静默返回 0 */
export function notifyReminders(reminders: Reminder[], limit = 3): number {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return 0
  const batch = reminders.slice(0, limit)
  for (const r of batch) {
    try {
      new Notification(r.title, { body: r.body, tag: r.kind })
    } catch {
      /* 个别环境禁止构造 Notification */
    }
  }
  return batch.length
}
