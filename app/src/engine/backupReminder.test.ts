import { describe, expect, it } from 'vitest'
import { shouldRemindBackup } from './backupReminder'

const NOW = new Date(2026, 8, 1, 12, 0) // 2026-09-01 12:00 本地

describe('shouldRemindBackup（铁律 6 产品化）', () => {
  it('从未备份 → 立即提醒', () => {
    expect(shouldRemindBackup(null, null, NOW)).toBe(true)
  })

  it('≥30 天未备份 → 提醒', () => {
    expect(shouldRemindBackup('2026-07-30T00:00:00.000Z', null, NOW)).toBe(true)
  })

  it('29 天 → 不提醒', () => {
    expect(shouldRemindBackup('2026-08-03T00:00:00.000Z', null, NOW)).toBe(false)
  })

  it('暂缓期内 → 不提醒（即使已超 30 天）', () => {
    expect(shouldRemindBackup('2026-07-01T00:00:00.000Z', '2026-09-05', NOW)).toBe(false)
  })

  it('暂缓已过期 → 恢复提醒', () => {
    expect(shouldRemindBackup('2026-07-01T00:00:00.000Z', '2026-08-20', NOW)).toBe(true)
  })

  it('非法时间串 → 提醒（宁可误报不可漏报）', () => {
    expect(shouldRemindBackup('garbage', null, NOW)).toBe(true)
  })
})
