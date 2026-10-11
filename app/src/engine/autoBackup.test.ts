import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  loadAutoBackup,
  saveAutoBackup,
  autoBackupDue,
  backupFileName,
  runAutoBackupIfDue,
  DEFAULT_AUTO_BACKUP,
} from './autoBackup'

/** 自动备份（浏览器版）：到期判定 + 到期导出并记录（依赖注入，不碰真实下载） */

beforeEach(() => {
  localStorage.clear()
})

describe('loadAutoBackup / saveAutoBackup', () => {
  it('无记录 → 默认关闭、每周', () => {
    expect(loadAutoBackup()).toEqual(DEFAULT_AUTO_BACKUP)
  })

  it('非法周期回退 7 天（读取防御，铁律 2）', () => {
    localStorage.setItem('pwork-autobackup', JSON.stringify({ enabled: true, everyDays: 3 }))
    expect(loadAutoBackup()).toMatchObject({ enabled: true, everyDays: 7 })
  })
})

describe('autoBackupDue', () => {
  const now = new Date('2026-10-04T12:00:00')

  it('关闭 → 永不到期', () => {
    expect(autoBackupDue({ enabled: false, everyDays: 7, lastAt: null }, now)).toBe(false)
  })

  it('开启且从未导出 → 到期', () => {
    expect(autoBackupDue({ enabled: true, everyDays: 7, lastAt: null }, now)).toBe(true)
  })

  it('周期内 → 不到期；过周期 → 到期', () => {
    const threeDaysAgo = new Date('2026-10-01T12:00:00').toISOString()
    expect(autoBackupDue({ enabled: true, everyDays: 7, lastAt: threeDaysAgo }, now)).toBe(false)
    const eightDaysAgo = new Date('2026-09-26T12:00:00').toISOString()
    expect(autoBackupDue({ enabled: true, everyDays: 7, lastAt: eightDaysAgo }, now)).toBe(true)
  })
})

describe('runAutoBackupIfDue', () => {
  it('到期：导出文件、刷新上次备份时间、记录自动备份时间', async () => {
    saveAutoBackup({ enabled: true, everyDays: 7, lastAt: null })
    const download = vi.fn()
    const at = new Date(2026, 9, 4, 9, 5)
    const r = await runAutoBackupIfDue({ now: at, build: async () => ({ version: 2, entities: {} }), download })
    expect(r.downloaded).toBe(true)
    expect(r.fileName).toBe('pwork-backup-20261004-0905.json')
    expect(download).toHaveBeenCalledOnce()
    expect(localStorage.getItem('pwork-last-backup')).toBe(at.toISOString())
    expect(loadAutoBackup().lastAt).toBe(at.toISOString())
  })

  it('周期内再打开 → 不导出', async () => {
    saveAutoBackup({ enabled: true, everyDays: 7, lastAt: new Date().toISOString() })
    const download = vi.fn()
    const r = await runAutoBackupIfDue({ build: async () => ({}), download })
    expect(r).toMatchObject({ downloaded: false, reason: 'not-due' })
    expect(download).not.toHaveBeenCalled()
  })

  it('未开启 → 不导出', async () => {
    const download = vi.fn()
    const r = await runAutoBackupIfDue({ build: async () => ({}), download })
    expect(r).toMatchObject({ downloaded: false, reason: 'disabled' })
  })
})

describe('backupFileName', () => {
  it('年月日-时分，两位补零', () => {
    expect(backupFileName(new Date(2026, 9, 4, 9, 5))).toBe('pwork-backup-20261004-0905.json')
    expect(backupFileName(new Date(2026, 11, 31, 23, 59))).toBe('pwork-backup-20261231-2359.json')
  })
})
