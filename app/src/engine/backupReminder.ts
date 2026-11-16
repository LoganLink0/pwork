/**
 * 备份提醒（铁律 6 的产品化）：本地优先应用没有运维兜底，
 * 超过 30 天未全量备份就在首页提醒；可暂缓 7 天（不打扰，但不遗忘）。
 */
import { todayLocal } from './datetime'
import { readPref, writePref } from './prefsFile'

export const BACKUP_INTERVAL_DAYS = 30
export const SNOOZE_DAYS = 7

const SNOOZE_KEY = 'pwork-backup-snooze'

/** 纯函数：是否应该提醒。lastBackup=null 表示从未备份 → 立即提醒 */
export function shouldRemindBackup(lastBackupIso: string | null, snoozeDate: string | null, now = new Date()): boolean {
  const today = todayLocal(now)
  if (snoozeDate && snoozeDate > today) return false
  if (!lastBackupIso) return true
  const d = new Date(lastBackupIso)
  if (Number.isNaN(d.getTime())) return true
  const days = Math.floor((now.getTime() - d.getTime()) / 86_400_000)
  return days >= BACKUP_INTERVAL_DAYS
}

export function snoozeBackupReminder(now = new Date()): void {
  const d = new Date(now)
  d.setDate(d.getDate() + SNOOZE_DAYS)
  localStorage.setItem(SNOOZE_KEY, todayLocal(d))
  writePref(SNOOZE_KEY, todayLocal(d))
}

export function getSnoozeDate(): string | null {
  // 配置文件化：prefs.json 优先，兼容期回落 localStorage 旧键
  const v = readPref<string | undefined>(SNOOZE_KEY, undefined)
  if (typeof v === 'string') return v
  try {
    return localStorage.getItem(SNOOZE_KEY)
  } catch {
    return null
  }
}
