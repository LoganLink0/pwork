/**
 * SQLite 存储后端（08 设计 S2，桌面版专用）：经 Tauri 命令访问本地 pwork.db。
 * SQL 由本文件生成——表/字段名全部来自固定清单（db_columns 命令下发，与 Rust DDL 同源），
 * 值一律绑定参数；时间戳按 TEXT 原样存取（R6 红线：禁止 SQLite datetime 函数加工）。
 * 每条记录 = id 主键 + 索引列 + payload（完整记录 JSON）。
 */
import { invoke } from '@tauri-apps/api/core'
import type { Key, OrderedRows, StorageBackend, TableStore, WhereClause } from './types'

interface TableMeta {
  columns: string[]
  keyField: string
}

let tableMeta: Record<string, TableMeta> | null = null

async function meta(): Promise<Record<string, TableMeta>> {
  if (!tableMeta) {
    const r = await invoke<{ columns: Record<string, string[]>; keyFields: Record<string, string> }>('db_columns')
    const map: Record<string, TableMeta> = {}
    for (const [name, columns] of Object.entries(r.columns)) {
      map[name] = { columns, keyField: r.keyFields[name] ?? 'id' }
    }
    tableMeta = map
  }
  return tableMeta
}

async function metaOf(name: string): Promise<TableMeta> {
  const m = await meta()
  const info = m[name]
  if (!info) throw new Error(`未知的表：${name}`)
  return info
}

/** 索引列取值归一：布尔→1/0，缺省→NULL，其余原样（R6：字符串不做任何加工） */
function toSqlValue(v: unknown): string | number | null {
  if (v === undefined || v === null) return null
  if (typeof v === 'boolean') return v ? 1 : 0
  if (typeof v === 'number' || typeof v === 'string') return v
  throw new Error(`索引列出现对象/数组值（${typeof v}）——索引列只允许 string/number/boolean/null`)
}

/** 分批（500/批，08 §R10 控制单次 IPC 体积） */
async function inChunks<T>(items: T[], size: number, fn: (chunk: T[]) => Promise<void>): Promise<void> {
  for (let i = 0; i < items.length; i += size) {
    await fn(items.slice(i, i + size))
  }
}

const CHUNK = 500

class SqliteTable<T> implements TableStore<T> {
  constructor(private name: string) {}

  private async keyField(): Promise<string> {
    return (await metaOf(this.name)).keyField
  }

  async get(key: Key): Promise<T | undefined> {
    const kf = await this.keyField()
    const rows = await invoke<Array<{ payload: string }>>('db_select', {
      sql: `SELECT payload FROM "${this.name}" WHERE "${kf}" = ?1`,
      params: [key],
    })
    return rows.length ? (JSON.parse(rows[0]!.payload) as T) : undefined
  }

  async put(value: T): Promise<Key> {
    const kf = await this.keyField()
    const key = String((value as Record<string, unknown>)[kf])
    await invoke('db_write', { ops: [{ kind: 'put', table: this.name, record: value }] })
    return key
  }

  async bulkPut(values: T[]): Promise<void> {
    await inChunks(values, CHUNK, async (chunk) => {
      await invoke('db_write', { ops: chunk.map((record) => ({ kind: 'put', table: this.name, record })) })
    })
  }

  async bulkAdd(values: T[]): Promise<void> {
    await this.bulkPut(values)
  }

  async bulkDelete(keys: Key[]): Promise<void> {
    await inChunks(keys, CHUNK, async (chunk) => {
      await invoke('db_write', { ops: chunk.map((id) => ({ kind: 'del', table: this.name, id })) })
    })
  }

  async delete(key: Key): Promise<void> {
    await invoke('db_write', { ops: [{ kind: 'del', table: this.name, id: key }] })
  }

  async clear(): Promise<void> {
    await invoke('db_write', { ops: [{ kind: 'clear', table: this.name }] })
  }

  async count(): Promise<number> {
    const rows = await invoke<Array<{ n: number }>>('db_select', { sql: `SELECT COUNT(*) AS n FROM "${this.name}"`, params: [] })
    return rows[0]?.n ?? 0
  }

  async toArray(): Promise<T[]> {
    const rows = await invoke<Array<{ payload: string }>>('db_select', { sql: `SELECT payload FROM "${this.name}"`, params: [] })
    return rows.map((r) => JSON.parse(r.payload) as T)
  }

  async update(key: Key, changes: Partial<T>): Promise<number> {
    const current = await this.get(key)
    if (!current) return 0
    await this.put({ ...current, ...changes })
    return 1
  }

  where(field: string): WhereClause<T> {
    let cmp: 'equals' | 'above' | 'below' = 'equals'
    let value: string | number = ''
    const sqlOf = (tail: string) => {
      const op = cmp === 'equals' ? '=' : cmp === 'above' ? '>' : '<'
      return `SELECT payload FROM "${this.name}" WHERE "${field}" ${op} ?1${tail}`
    }
    const params = () => [toSqlValue(value)]
    const self: WhereClause<T> = {
      equals: (v) => {
        cmp = 'equals'
        value = v
        return self
      },
      above: (v) => {
        cmp = 'above'
        value = v
        return self
      },
      below: (v) => {
        cmp = 'below'
        value = v
        return self
      },
      toArray: async () => {
        const rows = await invoke<Array<{ payload: string }>>('db_select', { sql: sqlOf(''), params: params() })
        return rows.map((r) => JSON.parse(r.payload) as T)
      },
      first: async () => {
        const rows = await invoke<Array<{ payload: string }>>('db_select', {
          sql: sqlOf(`ORDER BY "${this.name === 'kv' ? 'key' : 'id'}" ASC LIMIT 1`),
          params: params(),
        })
        return rows.length ? (JSON.parse(rows[0]!.payload) as T) : undefined
      },
      last: async () => {
        const rows = await invoke<Array<{ payload: string }>>('db_select', {
          sql: sqlOf(`ORDER BY "${this.name === 'kv' ? 'key' : 'id'}" DESC LIMIT 1`),
          params: params(),
        })
        return rows.length ? (JSON.parse(rows[0]!.payload) as T) : undefined
      },
      count: async () => {
        const rows = await invoke<Array<{ n: number }>>('db_select', { sql: sqlOf('').replace('SELECT payload', 'SELECT COUNT(*) AS n'), params: params() })
        return rows[0]?.n ?? 0
      },
      delete: async () => {
        const n = await invoke<number>('db_exec', { sql: sqlOf(''), params: params() })
        return Number(n)
      },
    }
    return self
  }

  orderBy(field: string): OrderedRows<T> {
    let reversed = false
    let limitN: number | null = null
    const sqlOf = (select: string) => {
      const dir = reversed ? 'DESC' : 'ASC'
      const tail = limitN == null ? '' : ` LIMIT ${limitN}`
      return `SELECT ${select} FROM "${this.name}" ORDER BY "${field}" ${dir}${tail}`
    }
    const self: OrderedRows<T> = {
      reverse: () => {
        reversed = !reversed
        return self
      },
      limit: (n: number) => {
        limitN = n
        return self
      },
      toArray: async () => {
        const rows = await invoke<Array<{ payload: string }>>('db_select', { sql: sqlOf('payload'), params: [] })
        return rows.map((r) => JSON.parse(r.payload) as T)
      },
      primaryKeys: async () => {
        const kf = await this.keyField()
        const rows = await invoke<Array<Record<string, string>>>('db_select', { sql: sqlOf(`"${kf}"`), params: [] })
        return rows.map((r) => r[kf]!)
      },
    }
    return self
  }
}

export async function createSqliteBackend(): Promise<StorageBackend> {
  const open = await invoke<{ fresh: boolean; incompleteMigration: boolean; path: string }>('db_open')
  if (open.incompleteMigration) {
    // 迁移中断（08 §R9）：删掉半成品库，回到未迁移状态重新走向导
    await invoke('db_destroy')
    throw new Error('PWORK_MIGRATION_INCOMPLETE')
  }
  return {
    table<T>(name: string): TableStore<T> {
      return new SqliteTable<T>(name)
    },
    async transaction(mode: 'rw' | 'r', tables: string[], fn: () => Promise<void> | void): Promise<void> {
      void mode
      void tables
      await invoke('db_begin')
      try {
        await fn()
        await invoke('db_commit')
      } catch (e) {
        await invoke('db_rollback').catch(() => {})
        throw e
      }
    },
    open: async () => {
      /* 连接已在 create 时打开 */
    },
  }
}
