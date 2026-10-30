import Dexie, { type Table } from 'dexie'
import type { AiCacheEntry, ErrorLogEntry, Goal, Item, Note, Source, TaskItem } from '../types/models'
import type { CaseFile, DataBlock, Profile, ReportSnapshot } from '../types/models'
import type { ActionItem, InsightRecord, ReviewRecord } from '../modules/review/types/models'

/** 存储降级状态：探针失败后为 true，UI 据此显示"数据不会保留"横幅（FUPAN 降级方案延续） */
export let usingMemoryFallback = false

/** IndexedDB 不可用（隐私模式/禁存储）时，动态加载内存实现并重试 */
async function ensureIndexedDB(): Promise<void> {
  try {
    const probe = indexedDB.open('pwork-probe')
    await new Promise<void>((resolve, reject) => {
      probe.onsuccess = () => {
        probe.result.close()
        resolve()
      }
      probe.onerror = () => reject(probe.error ?? new Error('indexeddb blocked'))
      probe.onblocked = () => reject(new Error('indexeddb blocked'))
    })
  } catch {
    usingMemoryFallback = true
    // @ts-expect-error polyfill 包无类型声明（只在降级路径动态加载）
    await import('fake-indexeddb/auto')
  }
}

/**
 * 本地数据库：IndexedDB，库名即产品名；不可用时降级为内存模式（本次会话有效）。
 * 迁移规则（铁律 2）：字段只增不删；索引变化必须升 version。
 * v1：速记；v2：信息采集；v3：回路模块（W3 迁入，reviews/actions/insights）+ 任务库。
 */
export class PworkDB extends Dexie {
  notes!: Table<Note, string>
  sources!: Table<Source, string>
  items!: Table<Item, string>
  reviews!: Table<ReviewRecord, string>
  actions!: Table<ActionItem, string>
  insights!: Table<InsightRecord, string>
  tasks!: Table<TaskItem, string>
  goals!: Table<Goal, string>
  snapshots!: Table<ReportSnapshot, string>
  blocks!: Table<DataBlock, string>
  profiles!: Table<Profile, string>
  caseFiles!: Table<CaseFile, string>
  aiCache!: Table<AiCacheEntry, string>
  errorLog!: Table<ErrorLogEntry, string>
  kv!: Table<KvRow, string>

  constructor() {
    super('pwork-workbench')
    this.version(1).stores({
      notes: 'id, source, deletedAt, updatedAt',
    })
    this.version(2).stores({
      notes: 'id, source, deletedAt, updatedAt',
      sources: 'id, url, active, updatedAt',
      items: 'id, sourceId, stage, fingerprint, fetchedAt, otFlag',
    })
    this.version(3).stores({
      reviews: 'id, scenario, type, status, updatedAt, createdAt',
      actions: 'id, reviewId, status, due',
      insights: 'id, reviewId, verified, patternGroup',
      tasks: 'id, status, due',
    })
    // v4（W5）：目标实体（C-2 最小形态）
    this.version(4).stores({
      goals: 'id, status, due',
    })
    // v5：周趋势快照（输出 O1 增补）
    this.version(5).stores({
      snapshots: 'id, day, createdAt',
    })
    // v6（输出扩展）：外部数据块——用户从工作台外带来的结构化片段，报告/朗读/PPT 管线并入
    this.version(6).stores({
      blocks: 'id, updatedAt',
    })
    // v7（外部数据推送）：blocks 加 extId 索引——云端 /api/ingest 增量拉取去重
    this.version(7).stores({
      blocks: 'id, updatedAt, extId',
    })
    // v8/v9（调研对象）：对象档案表 + 数据块归属对象
    this.version(8).stores({
      profiles: 'id, updatedAt',
    })
    this.version(9).stores({
      blocks: 'id, updatedAt, extId, profileId',
    })
    // v10（案例模块）：案例文件——简历版本/JD/公司资料，保持文件形态
    this.version(10).stores({
      caseFiles: 'id, caseId, kind, createdAt',
    })
    // v11（AI 缓存）：AI 产出按输入指纹复用——材料未变的重复点击不重复计费
    this.version(11).stores({
      aiCache: 'id, createdAt',
    })
    // v12（错误日志）：全局错误持久化——"哪里发生了什么"可查（上限 300 条最旧先删）
    this.version(12).stores({
      errorLog: 'id, at',
    })
    // v13（键值存储）：只能进 IndexedDB 的结构化值——自定义备份目录的 FS Access 句柄等
    this.version(13).stores({
      kv: 'key',
    })
  }
}

export interface KvRow {
  key: string
  value: unknown
}

export interface KvRow {
  key: string
  value: unknown
}

export const pworkDb = new PworkDB()

/** 存储委托（08 设计 S1）：业务层经 db 访问，实际后端可切换（Dexie / 内存 / 桌面版 SQLite） */
import { invoke } from '@tauri-apps/api/core'
import { bindDexieBackend, setBackend } from './delegate'
import { createMemoryBackend } from './storage/memory'
import { isDesktopApp } from '../engine/platform'
import type { Key, TableStore } from './delegate'

bindDexieBackend(pworkDb as never)

export { db } from './delegate'

/** 后端选择结果：needs-migration = 桌面版检测到旧数据待迁移（当前仍跑在 Dexie 上） */
export type StorageChoice = 'dexie' | 'sqlite' | 'needs-migration'
export interface MigrationProbeResult {
  choice: StorageChoice
  idbHasData: boolean
}

/** 业务表名清单（判定旧库是否有数据、clearAll 遍历共用） */
export const BUSINESS_TABLES = [
  'notes', 'sources', 'items', 'tasks', 'goals', 'reviews', 'actions', 'insights',
  'snapshots', 'blocks', 'profiles', 'caseFiles',
] as const

async function idbHasBusinessData(): Promise<boolean> {
  for (const t of BUSINESS_TABLES) {
    const n = await (pworkDb as unknown as { [k: string]: { count(): Promise<number> } })[t].count()
    if (n > 0) return true
  }
  return false
}

/** 迁移完成后的 SQLite 模式切换（供迁移模块调用；桌面版专用）；切换即启用 vault 镜像 */
export async function switchToSqliteBackend(): Promise<void> {
  const { createSqliteBackend } = await import('./storage/sqlite-backend')
  setBackend(await createSqliteBackend())
  const { enableMirror } = await import('./storage/mirror')
  await enableMirror()
}

/** 桌面版探查：pwork.db 就绪 / 需要迁移 /（网页版）维持 Dexie。不可用时降级内存模式 */
export async function initStorage(): Promise<MigrationProbeResult> {
  if (!isDesktopApp()) {
    await ensureIndexedDB()
    if (usingMemoryFallback) {
      setBackend(createMemoryBackend({ keyFields: { kv: 'key' } }))
    }
    return { choice: 'dexie', idbHasData: false }
  }
  const { createSqliteBackend } = await import('./storage/sqlite-backend')
  const probe = await invoke<{ exists: boolean }>('db_probe').catch((e: unknown) => {
    throw new Error(`探查本地数据库失败：${e instanceof Error ? e.message : String(e)}`)
  })
  if (probe.exists) {
    // 打开（同时检测迁移中断：08 §R9——有开始无完成 = 半成品，销毁重来）
    let open = await invoke<{ incompleteMigration: boolean }>('db_open').catch((e: unknown) => {
      throw new Error(`打开本地数据库失败：${e instanceof Error ? e.message : String(e)}`)
    })
    if (open.incompleteMigration) {
      await invoke('db_destroy')
      if (await idbHasBusinessData()) return { choice: 'needs-migration', idbHasData: true }
      open = await invoke('db_open')
    }
    setBackend(await createSqliteBackend())
    const { enableMirror } = await import('./storage/mirror')
    await enableMirror()
    return { choice: 'sqlite', idbHasData: false }
  }
  // 库文件不存在：老用户（IndexedDB 有数据）→ 迁移窗口；全新安装 → 直接 SQLite
  if (await idbHasBusinessData()) return { choice: 'needs-migration', idbHasData: true }
  await switchToSqliteBackend()
  return { choice: 'sqlite', idbHasData: false }
}

/** 存储选择就绪的共享 Promise（main.tsx 触发一次；App 与迁移模块共用结果） */
let choiceResult: MigrationProbeResult = { choice: 'dexie', idbHasData: false }
export function currentMigrationNeeded(): boolean {
  return choiceResult.choice === 'needs-migration'
}
export const storageReady: Promise<MigrationProbeResult> = initStorage().then((r) => {
  choiceResult = r
  return r
})

/** 迁移模块读写旧库（Dexie）与主键清单用 */
export function dexieTables(): { name: string; store: TableStore<Record<string, unknown>> }[] {
  return BUSINESS_TABLES.map((name) => ({ name, store: (pworkDb as unknown as { [k: string]: TableStore<Record<string, unknown>> })[name] }))
}

export function kvStore(): TableStore<KvRow> {
  return pworkDb.kv as unknown as TableStore<KvRow>
}

export type { Key, TableStore }
