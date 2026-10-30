/**
 * 存储后端切换点（08 设计 S1）：db 委托对象对业务层保持既有访问形状
 * （db.<表>.get/put/where…），实际读写分发到当前后端。
 * 生产默认 Dexie；测试经 setBackend 切内存实现；S2 时新增 SQLite 后端再切换桌面默认。
 */
import type { Key, TableStore } from './storage/types'
import { createDexieBackend } from './storage/dexie-backend'

export interface KvRow {
  key: string
  value: unknown
}

/** 业务表的类型化清单（无索引签名——各表保留精确元素类型） */
export interface DbTables {
  notes: TableStore<import('../types/models').Note>
  sources: TableStore<import('../types/models').Source>
  items: TableStore<import('../types/models').Item>
  tasks: TableStore<import('../types/models').TaskItem>
  goals: TableStore<import('../types/models').Goal>
  reviews: TableStore<import('../modules/review/types/models').ReviewRecord>
  actions: TableStore<import('../modules/review/types/models').ActionItem>
  insights: TableStore<import('../modules/review/types/models').InsightRecord>
  snapshots: TableStore<import('../types/models').ReportSnapshot>
  blocks: TableStore<import('../types/models').DataBlock>
  profiles: TableStore<import('../types/models').Profile>
  caseFiles: TableStore<import('../types/models').CaseFile>
  aiCache: TableStore<import('../types/models').AiCacheEntry>
  errorLog: TableStore<import('../types/models').ErrorLogEntry>
  kv: TableStore<KvRow>
}

/** Dexie 实例的最小形状（表属性 + 原生事务 + 打开） */
export interface DexieLike extends DbTables {
  open(): Promise<void>
  transaction(mode: 'rw' | 'r', tables: unknown[], fn: () => Promise<void> | void): Promise<void>
}

let backend: import('./storage/types').StorageBackend =
  createDexieBackend(null as unknown as DexieLike & import('./storage/dexie-backend').DexieBackendInstance)

/** 由 schema.ts 注入 Dexie 实例（避免 storage ↔ schema 循环 import） */
export function bindDexieBackend(instance: DexieLike): void {
  backend = createDexieBackend(instance as unknown as import('./storage/dexie-backend').DexieBackendInstance)
}

/** 测试切换：传入内存后端实例（src/db/storage/memory.ts 的 createMemoryBackend） */
export function setBackend(b: import('./storage/types').StorageBackend): void {
  backend = b
}

export function getBackend(): import('./storage/types').StorageBackend {
  return backend
}

type TransactionFn = () => Promise<void> | void

/**
 * 业务层访问入口：db.notes.get(...) 形状保持不变。
 * 委托器把属性访问转发给当前后端的表；transaction 接受表名字符串（08 §R4：表对象跨桥接不可反查）；
 * open/clearAll 供启动健康检查与测试清库使用。
 */
export const db = new Proxy({} as DbTables & {
  transaction(mode: 'rw' | 'r', tables: string[], fn: TransactionFn): Promise<void>
  open(): Promise<void>
  clearAll(): Promise<void>
  table<T = Record<string, unknown>>(name: string): import('./storage/types').TableStore<T>
}, {
  get(_target, prop: string) {
    if (prop === 'transaction') {
      return (mode: 'rw' | 'r', tables: string[], fn: TransactionFn) => backend.transaction(mode, tables, fn)
    }
    if (prop === 'open') {
      return () => (backend as { open?: () => Promise<void> }).open?.() ?? Promise.resolve()
    }
    if (prop === 'table') {
      return (name: string) => backend.table<Record<string, unknown>>(name)
    }
    if (prop === 'clearAll') {
      return async () => {
        for (const name of ['notes', 'sources', 'items', 'reviews', 'actions', 'insights', 'tasks', 'goals', 'snapshots', 'blocks', 'profiles', 'caseFiles', 'aiCache', 'errorLog', 'kv']) {
          await backend.table(name).clear()
        }
      }
    }
    return backend.table<Record<string, unknown>>(prop)
  },
})

export type { Key, TableStore }
