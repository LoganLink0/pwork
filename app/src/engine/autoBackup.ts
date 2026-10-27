/**
 * 自动备份（2026-10 分发加固：数据安全网的浏览器版）。
 * 开启后按周期在打开应用时自动把全量备份导出到浏览器下载文件夹，并刷新
 * 「上次备份」时间——手动备份提醒（30 天）随之不再打扰。
 * 桌面壳（Tauri）落地后，把 download 注入换成写磁盘文件即可，逻辑不变。
 */
import { buildBackupBundle } from '../store/collect'
import { downloadFile } from '../db/repo'
import { isDesktopApp } from './platform'

export interface AutoBackupConfig {
  enabled: boolean
  /** 周期（天）：7 / 14 / 30 */
  everyDays: number
  /** 上次自动导出时间（ISO）；null = 从未 */
  lastAt: string | null
}

const KEY = 'pwork-autobackup'

export const DEFAULT_AUTO_BACKUP: AutoBackupConfig = { enabled: false, everyDays: 7, lastAt: null }

export function loadAutoBackup(): AutoBackupConfig {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return { ...DEFAULT_AUTO_BACKUP }
    const p = JSON.parse(raw) as Partial<AutoBackupConfig>
    const everyDays = [7, 14, 30].includes(p.everyDays ?? 0) ? p.everyDays! : 7
    return {
      enabled: p.enabled === true,
      everyDays,
      lastAt: typeof p.lastAt === 'string' ? p.lastAt : null,
    }
  } catch {
    return { ...DEFAULT_AUTO_BACKUP }
  }
}

export function saveAutoBackup(cfg: AutoBackupConfig): void {
  localStorage.setItem(KEY, JSON.stringify(cfg))
}

/** 是否到期（纯函数，注入 now 便于测试——复盘 2.7：注入参数体内禁读系统时钟） */
export function autoBackupDue(cfg: AutoBackupConfig, now: Date): boolean {
  if (!cfg.enabled) return false
  // lastAt 为损坏字符串时 new Date() 得 NaN、比较恒 false（备份永久停摆且无提示）——视为从未备份
  const last = cfg.lastAt ? new Date(cfg.lastAt).getTime() : Number.NaN
  if (Number.isNaN(last)) return true
  return now.getTime() - last >= cfg.everyDays * 86_400_000
}

export function backupFileName(now: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `pwork-backup-${now.getFullYear()}${p(now.getMonth() + 1)}${p(now.getDate())}-${p(now.getHours())}${p(now.getMinutes())}.json`
}

export interface AutoBackupResult {
  downloaded: boolean
  reason?: 'disabled' | 'not-due'
  fileName?: string
  /** 实际落点：自定义文件夹 / 桌面应用数据目录 / 浏览器下载 */
  location?: 'dir' | 'disk' | 'download'
  /** 失败原因（2026-10-27 错误留痕）：构建或落盘失败时带出，调用方入错误日志 */
  error?: string
}

/**
 * 桌面版：写进应用数据目录的 backups/ 文件夹（用户可备份/拷贝的固定位置）；
 * 浏览器版：默认走下载文件夹，可在设置页授权一个自定义文件夹（FS Access，一次授权长期有效）。
 * 任何写盘失败都回落浏览器下载，不丢备份。
 */
async function deliverBackup(fileName: string, content: string): Promise<'dir' | 'disk' | 'download'> {
  if (await writeToCustomDir(fileName, content)) return 'dir'
  if (isDesktopApp()) {
    try {
      const { mkdir, writeTextFile, BaseDirectory } = await import('@tauri-apps/plugin-fs')
      await mkdir('backups', { baseDir: BaseDirectory.AppData, recursive: true })
      await writeTextFile(`backups/${fileName}`, content, { baseDir: BaseDirectory.AppData })
      return 'disk'
    } catch {
      // 落到浏览器下载兜底
    }
  }
  downloadFile(fileName, content, 'application/json')
  return 'download'
}

/* --------------------- 自定义备份目录（2026-10-22 用户需求） --------------------- */

const DIR_KEY = 'pwork-backup-dir'

/** 浏览器安全上下文才支持目录授权；桌面版固定写应用数据目录，不提供该选项 */
export function customBackupDirSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'showDirectoryPicker' in window &&
    window.isSecureContext === true &&
    !isDesktopApp()
  )
}

/** 选一个文件夹（浏览器弹窗授权一次）；返回文件夹名，取消返回 null */
export async function pickBackupDir(): Promise<string | null> {
  const w = window as unknown as { showDirectoryPicker: (o: { mode: string; id: string }) => Promise<FileSystemDirectoryHandle> }
  const handle = await w.showDirectoryPicker({ mode: 'readwrite', id: 'pwork-backup' })
  const { db } = await import('../db/schema')
  await db.kv.put({ key: DIR_KEY, value: handle })
  return handle.name
}

/** 清除自定义目录（回落下载文件夹） */
export async function clearBackupDir(): Promise<void> {
  const { db } = await import('../db/schema')
  await db.kv.delete(DIR_KEY)
}

/** 当前自定义目录名（没设置返回 null；设置页展示用） */
export async function getBackupDirName(): Promise<string | null> {
  const { db } = await import('../db/schema')
  const row = (await db.kv.get(DIR_KEY)) as { key: string; value: FileSystemDirectoryHandle } | undefined
  return row?.value?.name ?? null
}

/** 写入自定义目录。后台运行没有用户手势，权限失效时不能重新请求——返回 false 由调用方回落 */
async function writeToCustomDir(fileName: string, content: string): Promise<boolean> {
  try {
    const { db } = await import('../db/schema')
    const row = (await db.kv.get(DIR_KEY)) as { key: string; value: FileSystemDirectoryHandle } | undefined
    const handle = row?.value
    if (!handle) return false
    const perm = await (
      handle as FileSystemDirectoryHandle & { queryPermission?: (o: { mode: string }) => Promise<string> }
    ).queryPermission?.({ mode: 'readwrite' })
    if (perm && perm !== 'granted') return false
    const fileHandle = await handle.getFileHandle(fileName, { create: true })
    const writable = await fileHandle.createWritable()
    await writable.write(content)
    await writable.close()
    return true
  } catch {
    return false
  }
}

/**
 * 打开应用时调用：到期则自动导出并记录时间。
 * build/download 可注入（测试用）；生产默认走真实备份与桌面写盘/浏览器下载。
 */
export async function runAutoBackupIfDue(
  opts?: {
    now?: Date
    build?: () => Promise<unknown>
    download?: (filename: string, content: string) => void
  },
): Promise<AutoBackupResult> {
  const cfg = loadAutoBackup()
  const now = opts?.now ?? new Date()
  if (!autoBackupDue(cfg, now)) return { downloaded: false, reason: cfg.enabled ? 'not-due' : 'disabled' }

  const build = opts?.build ?? (async () => buildBackupBundle())

  // 失败如实上抛给调用方入错误日志（2026-10-27 用户明令），上次备份时间不动（下轮重试）
  let bundle: unknown
  try {
    bundle = await build()
  } catch (e) {
    return { downloaded: false, error: `构建备份内容失败：${e instanceof Error ? e.message : String(e)}` }
  }
  const fileName = backupFileName(now)
  // 测试注入 download 时跳过真实落盘（桌面写盘/自定义目录都不可用）
  let location: AutoBackupResult['location']
  try {
    location = opts?.download
      ? (opts.download(fileName, JSON.stringify(bundle, null, 2)), 'download')
      : await deliverBackup(fileName, JSON.stringify(bundle, null, 2))
  } catch (e) {
    return { downloaded: false, error: `备份落盘失败：${e instanceof Error ? e.message : String(e)}` }
  }
  localStorage.setItem('pwork-last-backup', now.toISOString())
  saveAutoBackup({ ...cfg, lastAt: now.toISOString() })
  return { downloaded: true, fileName, location }
}
