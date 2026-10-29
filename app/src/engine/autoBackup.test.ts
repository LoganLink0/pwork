import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  loadAutoBackup,
  saveAutoBackup,
  autoBackupDue,
  backupFileName,
  runAutoBackupIfDue,
  pickStaleBackups,
  KEEP_AUTO_BACKUPS,
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

  it('桌面版无记录 → 默认开启（备份写应用数据目录，不打扰用户）', () => {
    const cfg = loadAutoBackup(true)
    expect(cfg.enabled).toBe(true)
    expect(cfg).toMatchObject({ everyDays: 7, lastAt: null })
  })

  it('已存储的配置不被平台默认覆盖（用户显式关过就保持关）', () => {
    saveAutoBackup({ ...DEFAULT_AUTO_BACKUP, enabled: false })
    expect(loadAutoBackup(true).enabled).toBe(false)
  })

  it('非法周期回退 7 天（读取防御，铁律 2）', () => {
    localStorage.setItem('pwork-autobackup', JSON.stringify({ enabled: true, everyDays: 3 }))
    expect(loadAutoBackup()).toMatchObject({ enabled: true, everyDays: 7 })
  })
})

describe('pickStaleBackups（桌面版轮换，0.3e）', () => {
  const names = ['pwork-backup-20261001-0900.json', 'pwork-backup-20261008-0900.json', 'pwork-backup-20261015-0900.json', 'pwork-backup-20261022-0900.json', 'pwork-backup-20261029-0900.json', 'pwork-backup-20261105-0900.json']

  it('超出保留数的最旧若干份被挑出（字典序=时间序）', () => {
    expect(pickStaleBackups(names, 5)).toEqual(['pwork-backup-20261001-0900.json'])
  })

  it('不超过保留数时一张不删', () => {
    expect(pickStaleBackups(names.slice(0, 3), 5)).toEqual([])
  })

  it('默认保留 5 份', () => {
    expect(KEEP_AUTO_BACKUPS).toBe(5)
    expect(pickStaleBackups(names)).toHaveLength(1)
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
