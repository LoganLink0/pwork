/**
 * 主库突变守卫（2026-11-10 定稿设计，数据不丢的第四道闸）：
 * 启动时把核心表计数与上次使用时的基准比对——某表从有意义规模（≥20 条）骤减 95% 以上
 * 视为突变（覆盖安装事故/清库缺陷/误删整库这类静默丢失）：先把当前（减少后）状态隔离
 * 保存一份，再由壳层弹出恢复窗口给一键恢复，绝不静默带病运行。
 *
 * 与其他三道闸的分工：持久化申请（存得住）、自动备份（丢了好找）、dbHealth（库打得开）；
 * 本守卫管「打开之后数据还在吗」。判定基准刻意放在数据本体之外——桌面版除库内 kv 外
 * 再写 backups/db-counts.json（主库文件整个被换掉时，库内快照会跟着消失，库外文件才
 * 比对得出来）；网页版只有 kv 可用，防得住清表类突变，防不住整个 IndexedDB 被删。
 *
 * 触发后基准不刷新：恢复窗口没被回答（用户直接关掉应用），下次启动会再次提醒；
 * 「保留现状」或恢复完成才写入新基准。恢复走 db/backup 的 wipeAndImport（清业务表整包导回）。
 */
import { db } from '../db/schema'
import { isDesktopApp } from './platform'
import { recordError } from './errorLog'
import { CORE_TABLES, countCoreTables, recoveryGuidance } from './dbHealth'
import { tableLabel } from '../db/tableLabels'

/** 触发门槛：基准 ≥20 条、现存 ≤ 5%（cur×20 ≤ prev）。过低基数不判（日常小库自然波动） */
export const GUARD_MIN_BASE = 20

export interface GuardTrigger {
  table: string
  prev: number
  cur: number
}

/** 纯判定：核心表逐表比对，命中突变的列出来 */
export function detectMutation(prev: Record<string, number> | null | undefined, cur: Record<string, number>): GuardTrigger[] {
  if (!prev) return []
  const out: GuardTrigger[] = []
  for (const t of CORE_TABLES) {
    const p = prev[t]
    const c = cur[t]
    if (typeof p === 'number' && typeof c === 'number' && p >= GUARD_MIN_BASE && c * 20 <= p) {
      out.push({ table: t, prev: p, cur: c })
    }
  }
  return out
}

/** 突变清单 → 一句人话（错误日志与恢复窗口共用） */
export function describeTriggers(triggers: GuardTrigger[]): string {
  return triggers.map((t) => `${tableLabel(t.table)}从 ${t.prev.toLocaleString()} 条变成 ${t.cur.toLocaleString()} 条`).join('、')
}

/* --------------------- 桌面文件读写（库外基准与隔离副本都在 backups/） ---------------------
 * capabilities 的 fs 权限收窄在 AppData 的 backups/ 内（2026-10-26 审计④），库外文件全部放这里。
 * 接口注入便于测试；默认实现走 Tauri fs。 */

export interface GuardIo {
  /** 读 backups/<name> 文本；读不到（不存在/无权限）返回 null */
  readJsonFile(name: string): Promise<string | null>
  writeTextFile(name: string, content: string): Promise<void>
  /** 列出 backups/ 下的文件名（调用方自行过滤前缀与排序） */
  listBackupNames(): Promise<string[]>
  readBackupFile(name: string): Promise<string>
}

const defaultIo: GuardIo = {
  async readJsonFile(name) {
    try {
      const { readTextFile, BaseDirectory } = await import('@tauri-apps/plugin-fs')
      return await readTextFile(`backups/${name}`, { baseDir: BaseDirectory.AppData })
    } catch {
      return null
    }
  },
  async writeTextFile(name, content) {
    const { mkdir, writeTextFile, BaseDirectory } = await import('@tauri-apps/plugin-fs')
    await mkdir('backups', { baseDir: BaseDirectory.AppData, recursive: true })
    await writeTextFile(`backups/${name}`, content, { baseDir: BaseDirectory.AppData })
  },
  async listBackupNames() {
    const { readDir, BaseDirectory } = await import('@tauri-apps/plugin-fs')
    const entries = await readDir('backups', { baseDir: BaseDirectory.AppData })
    return entries.filter((e) => e.isFile).map((e) => e.name)
  },
  async readBackupFile(name) {
    const { readTextFile, BaseDirectory } = await import('@tauri-apps/plugin-fs')
    return await readTextFile(`backups/${name}`, { baseDir: BaseDirectory.AppData })
  },
}

/* --------------------- 比对基准 --------------------- */

/** 与 dbHealth 历史快照同键（0.3 批就在写）——升级即自带基准，首启就能比对 */
const REF_KEY = 'pwork-last-counts'
const COUNTS_FILE = 'db-counts.json'

function validCounts(v: unknown): v is Record<string, number> {
  if (!v || typeof v !== 'object') return false
  return Object.values(v as Record<string, unknown>).every((n) => typeof n === 'number' && Number.isFinite(n))
}

/** 读基准：库内 kv 优先（最新）；桌面版库外文件兜底（主库被整个换掉时 kv 会跟着消失） */
async function readReference(io: GuardIo): Promise<{ counts: Record<string, number> } | null> {
  try {
    const row = await db.kv.get(REF_KEY)
    const v = row?.value as { counts?: unknown } | undefined
    if (v && validCounts(v.counts)) return { counts: v.counts }
  } catch {
    // 库读不出走文件兜底
  }
  if (isDesktopApp()) {
    const text = await io.readJsonFile(COUNTS_FILE)
    if (text) {
      try {
        const v = JSON.parse(text) as { counts?: unknown }
        if (validCounts(v.counts)) return { counts: v.counts }
      } catch {
        // 坏文件当没有
      }
    }
  }
  return null
}

/** 写基准：kv 必写；桌面版同步写库外文件。两边都是尽力而为，失败不阻塞启动 */
export async function writeReference(counts: Record<string, number>, io: GuardIo = defaultIo, at: string = new Date().toISOString()): Promise<void> {
  const payload = { at, counts }
  try {
    await db.kv.put({ key: REF_KEY, value: payload })
  } catch {
    // kv 写不进不阻塞
  }
  if (isDesktopApp()) {
    try {
      await io.writeTextFile(COUNTS_FILE, JSON.stringify(payload))
    } catch {
      // 文件写失败下次启动 kv 仍可用
    }
  }
}

/* --------------------- 隔离副本 --------------------- */

const QUARANTINE_KEY = 'pwork-guard-quarantine'

export interface QuarantineInfo {
  at: string
  /** 桌面版落备份文件夹；网页版存在应用本地存储（kv） */
  where: 'file' | 'kv'
  /** 展示名：桌面为文件名，网页为固定说法 */
  name: string
  triggers: GuardTrigger[]
  /** 桌面版才有：备份文件夹里的文件名 */
  fileName?: string
  /** 网页版才有：副本本体直接随描述存 kv（与库同生，但清表类恢复不会碰到 kv） */
  bundle?: unknown
}

function quarantineStamp(at: string): string {
  return at.slice(0, 16).replace(/[-:]/g, '').replace('T', '-')
}

async function quarantineCurrentState(bundle: unknown, triggers: GuardTrigger[], now: Date, io: GuardIo): Promise<QuarantineInfo> {
  const at = now.toISOString()
  if (isDesktopApp()) {
    const fileName = `quarantine-${quarantineStamp(at)}.json`
    await io.writeTextFile(fileName, JSON.stringify(bundle, null, 2))
    const info: QuarantineInfo = { at, where: 'file', name: fileName, triggers, fileName }
    try {
      // kv 只留描述不含本体——主库再坏，副本仍在备份文件夹里
      await db.kv.put({ key: QUARANTINE_KEY, value: info })
    } catch {
      // 描述写不进只影响设置页展示，不影响副本本身
    }
    return info
  }
  const info: QuarantineInfo = { at, where: 'kv', name: '应用本地存储', triggers, bundle }
  await db.kv.put({ key: QUARANTINE_KEY, value: info })
  return info
}

/** 现存隔离副本描述（没有返回 null；恢复窗口与设置页共用） */
export async function getQuarantine(): Promise<QuarantineInfo | null> {
  try {
    const row = await db.kv.get(QUARANTINE_KEY)
    const v = row?.value as QuarantineInfo | undefined
    if (v && Array.isArray(v.triggers) && v.triggers.length > 0) return v
  } catch {
    // 读不出当没有
  }
  return null
}

/** 读隔离副本本体（JSON 文本；桌面版从备份文件夹读，网页版从 kv 取） */
export async function readQuarantineBundle(q: QuarantineInfo, io: GuardIo = defaultIo): Promise<string> {
  if (q.where === 'file' && q.fileName) {
    const text = await io.readJsonFile(q.fileName)
    if (!text) throw new Error(`隔离副本读不到（备份文件夹里的 ${q.fileName} 不在了）`)
    return text
  }
  if (q.bundle !== undefined) return JSON.stringify(q.bundle)
  throw new Error('隔离副本内容缺失')
}

/** 清掉隔离副本的 kv 标记（桌面版文件本体留在备份文件夹，不自动删） */
export async function clearQuarantine(): Promise<void> {
  try {
    await db.kv.delete(QUARANTINE_KEY)
  } catch {
    // 清不掉只是设置页多显示一行，无害
  }
}

/* --------------------- 桌面最近备份 --------------------- */

/** 桌面版 backups/ 里最新的自动备份（恢复窗口的「一键恢复」数据源；网页版没有库外落点返回 null） */
export async function latestDesktopBackup(io: GuardIo = defaultIo): Promise<{ name: string; text: string } | null> {
  if (!isDesktopApp()) return null
  try {
    const names = (await io.listBackupNames())
      .filter((n) => n.startsWith('pwork-backup-') && n.endsWith('.json'))
      .sort()
      .reverse()
    if (names.length === 0) return null
    return { name: names[0], text: await io.readBackupFile(names[0]) }
  } catch {
    return null
  }
}

/* --------------------- 启动比对 --------------------- */

export interface GuardResult {
  triggered: boolean
  triggers: GuardTrigger[]
  /** 隔离副本信息；隔离本身失败时为 null（恢复窗口要如实说明） */
  quarantine: QuarantineInfo | null
  counts: Record<string, number>
}

export interface GuardOptions {
  io?: Partial<GuardIo>
  now?: Date
  /** 注入计数（测试用；生产走真实表计数） */
  counts?: Record<string, number>
}

/**
 * 启动比对入口：无突变 → 刷新基准放行；有突变 → 隔离现状 + 返回触发信息（基准不动，
 * 未被回答的事故下次启动还会提醒）。调用方（App 壳）按 triggered 弹恢复窗口并拦下本轮自动备份。
 */
export async function runMutationGuard(opts?: GuardOptions): Promise<GuardResult> {
  const io = { ...defaultIo, ...opts?.io }
  const now = opts?.now ?? new Date()
  const counts = opts?.counts ?? (await countCoreTables())
  const ref = await readReference(io)
  const triggers = detectMutation(ref?.counts, counts)
  if (triggers.length === 0) {
    await writeReference(counts, io, now.toISOString())
    return { triggered: false, triggers: [], quarantine: null, counts }
  }

  // 先隔离现状再谈恢复（失败不阻断提醒——恢复窗口照出，隔离缺失在窗口里如实说）
  let quarantine: QuarantineInfo | null = null
  try {
    const { buildBackupBundle } = await import('../store/collect')
    quarantine = await quarantineCurrentState(await buildBackupBundle(), triggers, now, io)
  } catch {
    quarantine = null
  }
  void recordError({
    where: '启动数据检查',
    kind: 'app',
    message:
      `${describeTriggers(triggers)}——数据可能被意外清空。` +
      (quarantine
        ? `当前状态已隔离保存在${quarantine.where === 'file' ? `备份文件夹（${quarantine.fileName}）` : '应用本地存储'}。`
        : '隔离副本保存失败，请先手动导出备份再操作。') +
      ` ${recoveryGuidance(isDesktopApp())}`,
  })
  return { triggered: true, triggers, quarantine, counts }
}

/** 用户确认「数据没丢，是我自己清理的」：写入新基准（这次减少此后不再提醒），隔离副本保留原地 */
export async function acknowledgeCurrentState(counts: Record<string, number>, io: GuardIo = defaultIo): Promise<void> {
  await writeReference(counts, io)
}

/** 恢复完成后调用：以恢复后的库刷新基准，并清掉隔离副本标记（桌面版文件本体留在备份文件夹） */
export async function refreshReferenceAfterRestore(io: GuardIo = defaultIo): Promise<void> {
  await writeReference(await countCoreTables(), io)
  await clearQuarantine()
}
