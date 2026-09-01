/**
 * 备份提醒（铁律 6 的产品化）：本地优先应用没有运维兜底，
 * 超过 30 天未全量备份就在首页提醒；可暂缓 7 天（不打扰，但不遗忘）。
 */
import { todayLocal } from './datetime'

export const BACKUP_INTERVAL_DAYS = 30
export const SNOOZE_DAYS = 7

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
  localStorage.setItem('pwork-backup-snooze', todayLocal(d))
}

export function getSnoozeDate(): string | null {
  return localStorage.getItem('pwork-backup-snooze')
}
