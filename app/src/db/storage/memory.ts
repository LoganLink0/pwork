/**
 * 内存存储后端（08 设计 S1）：452 项测试的行为等价证明载体。
 * 语义对齐 Dexie 的实际行为：put/get 走结构化克隆（入出皆副本，杜绝对象别名串扰）；
 * where 线性过滤（内存量级够用）；orderBy 按字段值的字典序（与 Dexie 索引序在实际数据形态下一致）；
 * transaction 顺序执行 fn（单线程内存天然原子）。
 */
import type { Key, OrderedRows, StorageBackend, TableStore, TransactionFn, WhereClause } from './types'

function clone<T>(v: T): T {
  return structuredClone(v)
}

type Cmp = 'equals' | 'above' | 'below'

function cellMatch(cell: unknown, op: Cmp, v: string | number): boolean {
  if (cell == null) return false
  if (op === 'equals') return cell === v
  if (op === 'above') return cell > v
  return cell < v
}

class MemoryTable<T extends Record<string, unknown>> implements TableStore<T> {
  private rows = new Map<Key, T>()

  constructor(private keyField: string) {}

  async get(key: Key): Promise<T | undefined> {
    const row = this.rows.get(key)
    return row ? clone(row) : undefined
  }

  async put(value: T): Promise<Key> {
    const key = String(value[this.keyField])
    this.rows.set(key, clone(value))
    return key
  }

  async bulkPut(values: T[]): Promise<void> {
    for (const v of values) await this.put(v)
  }

  async bulkAdd(values: T[]): Promise<void> {
    for (const v of values) await this.put(v)
  }

  async bulkDelete(keys: Key[]): Promise<void> {
    for (const k of keys) this.rows.delete(k)
  }

  async delete(key: Key): Promise<void> {
    this.rows.delete(key)
  }

  async clear(): Promise<void> {
    this.rows.clear()
  }

  async count(): Promise<number> {
    return this.rows.size
  }

  async toArray(): Promise<T[]> {
    return [...this.rows.values()].map(clone)
  }

  async update(key: Key, changes: Partial<T>): Promise<number> {
    const row = this.rows.get(key)
    if (!row) return 0
    this.rows.set(key, clone({ ...row, ...changes }))
    return 1
  }

  where(field: keyof T & string): WhereClause<T> {
    // 链式状态：equals/above/below 设定条件（可链改），first/count/delete/toArray 作为终结方法作用于当前条件
    let op: Cmp = 'equals'
    let value: string | number = ''
    const matched = (): T[] =>
      [...this.rows.values()].filter((row) => cellMatch(row[field], op, value)).map(clone)

    const clause: WhereClause<T> = {
      equals: (v) => {
        op = 'equals'
        value = v
        return clause
      },
      above: (v) => {
        op = 'above'
        value = v
        return clause
      },
      below: (v) => {
        op = 'below'
        value = v
        return clause
      },
      toArray: async () => matched(),
      first: async () => matched()[0],
      last: async () => matched().at(-1),
      count: async () => matched().length,
      delete: async () => {
        const doomed = matched()
        for (const row of doomed) this.rows.delete(String(row[this.keyField]))
        return doomed.length
      },
    }
    return clause
  }

  orderBy(field: keyof T & string): OrderedRows<T> {
    const sorted = () =>
      [...this.rows.values()].sort((a, b) => {
        const av = String(a[field] ?? '')
        const bv = String(b[field] ?? '')
        return av < bv ? -1 : av > bv ? 1 : 0
      })
    let reversed = false
    let limitN: number | null = null
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
        const base = sorted()
        const ordered = reversed ? base.reverse() : base
        return limitN == null ? ordered : ordered.slice(0, limitN)
      },
      primaryKeys: async () => {
        const base = sorted()
        const ordered = reversed ? base.reverse() : base
        const sliced = limitN == null ? ordered : ordered.slice(0, limitN)
        return sliced.map((row) => String(row[this.keyField]))
      },
    }
    return self
  }
}

export interface MemoryBackendOptions {
  /** 表名 → 主键字段名（缺省 'id'；kv 表为 'key'） */
  keyFields?: Record<string, string>
}

export function createMemoryBackend(opts: MemoryBackendOptions = {}): StorageBackend {
  const tables = new Map<string, TableStore<Record<string, unknown>>>()
  return {
    table<T>(name: string): TableStore<T> {
      if (!tables.has(name)) {
        tables.set(name, new MemoryTable(opts.keyFields?.[name] ?? 'id') as TableStore<Record<string, unknown>>)
      }
      return tables.get(name)! as TableStore<T>
    },
    async transaction(_mode: 'rw' | 'r', _tables: string[], fn: TransactionFn): Promise<void> {
      await fn()
    },
  }
}
