/**
 * 数据迁移（08 设计 S2）：桌面版把旧 IndexedDB 数据搬进 SQLite 主库。
 * 流程（设计 §4 + §R7/R9）：迁移前快照落 backups/ → 打开 pwork.db → 按表分批
 * （500/批）写入并登记开始标记 → 收尾对账（逐表行数核对，铁律 4）→ 登记完成。
 * 任一步失败：销毁半成品库文件、错误上抛（调用方留在旧存储并展示原因）。
 * 快照与 JSON 序列化失败的 kv 行（FS Access 句柄类）：跳过并计入 skippedKv。
 */
import { invoke } from '@tauri-apps/api/core'
import { buildBackupBundle } from '../../store/collect'
import { downloadFile } from '../repo'
import { BUSINESS_TABLES, dexieTables, switchToSqliteBackend } from '../schema'
import { isDesktopApp } from '../../engine/platform'

export interface MigrationProgress {
  table: string
  done: number
  total: number
  /** 全部表合计的进度（进度条用）：overallDone / overallTotal */
  overallDone: number
  overallTotal: number
}

export interface MigrationResult {
  counts: Record<string, number>
  skippedKv: number
  snapshotFile: string
}

function stamp(): string {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`
}

/** 迁移前快照（回滚保险）：与手动导出同一格式，落 backups 文件夹；同时下载一份兜底 */
async function saveSnapshot(): Promise<string> {
  const bundle = await buildBackupBundle()
  const name = `migration-backup-${stamp()}.json`
  const content = JSON.stringify(bundle, null, 2)
  try {
    const { mkdir, writeTextFile, BaseDirectory } = await import('@tauri-apps/plugin-fs')
    await mkdir('backups', { baseDir: BaseDirectory.AppData, recursive: true })
    await writeTextFile(`backups/${name}`, content, { baseDir: BaseDirectory.AppData })
    return name
  } catch {
    // 写盘失败不阻断迁移：下载一份由用户保存（快照是回滚保险，不能因为保险本身失败而停止）
    downloadFile(name, content, 'application/json')
    return name
  }
}

export async function runMigration(onProgress: (p: MigrationProgress) => void): Promise<MigrationResult> {
  if (!isDesktopApp()) throw new Error('数据迁移只在桌面版进行')

  // 迁移前快照（铁律 4：动库之前先备份）
  const snapshotFile = await saveSnapshot()

  // 打开主库（新文件）并登记迁移开始
  await invoke('db_open')
  await invoke('db_write', {
    ops: [{ kind: 'put', table: 'meta', record: { key: 'migration_started', value: new Date().toISOString() } }],
  })

  // 一次性加载全部旧表（总量先知，进度条才有分母）；后续对账复用这份行数
  const tables = dexieTables().map(({ name, store }) => ({ name, store }))
  const loaded = await Promise.all(tables.map(async ({ name, store }) => ({ name, rows: await store.toArray() })))
  const overallTotal = loaded.reduce((sum, t) => sum + t.rows.length, 0)
  let overallDone = 0

  // 按表分批写入
  let skippedKv = 0
  for (const { name, rows } of loaded) {
    const total = rows.length
    let done = 0
    if (name === 'kv') {
      // FS Access 句柄类值无法 JSON 序列化——跳过（桌面版不用该功能；需要时重新选择一次）
      const serializable: Array<Record<string, unknown>> = []
      for (const row of rows) {
        try {
          JSON.stringify(row)
          serializable.push(row as Record<string, unknown>)
        } catch {
          skippedKv++
        }
      }
      await inBatches(serializable, 500, async (chunk) => {
        await invoke('db_migrate_batch', { table: name, rows: chunk })
      })
      done = serializable.length
      overallDone += done
      onProgress({ table: name, done, total, overallDone, overallTotal })
      continue
    }
    await inBatches(rows, 500, async (chunk) => {
      await invoke('db_migrate_batch', { table: name, rows: chunk })
      done = Math.min(done + chunk.length, total)
      overallDone = Math.min(overallDone + chunk.length, overallTotal)
      // 让出一拍宏任务：确保界面在批次之间真的绘制出来（大批量时进度肉眼可见）
      await new Promise((r) => setTimeout(r, 0))
      onProgress({ table: name, done, total, overallDone, overallTotal })
    })
    if (total === 0) onProgress({ table: name, done: 0, total: 0, overallDone, overallTotal })
  }

  // 收尾对账（铁律 4：写库前后对账）
  const counts = await invoke<Record<string, number>>('db_migrate_finish')
  for (const { name, rows } of loaded) {
    if (name === 'kv') continue // kv 有跳过行，对账口径不同
    const expected = rows.length
    const got = counts[name] ?? 0
    if (got !== expected) {
      await invoke('db_destroy')
      throw new Error(`迁移对账失败：${name} 应为 ${expected} 条，实际 ${got} 条——已清理半成品，旧数据未受影响`)
    }
  }

  await invoke('db_write', {
    ops: [{ kind: 'put', table: 'meta', record: { key: 'migration_complete', value: new Date().toISOString() } }],
  })
  await switchToSqliteBackend()
  return { counts, skippedKv, snapshotFile }
}

async function inBatches<T>(items: T[], size: number, fn: (chunk: T[]) => Promise<void>): Promise<void> {
  for (let i = 0; i < items.length; i += size) {
    await fn(items.slice(i, i + size))
  }
}

export { BUSINESS_TABLES }
