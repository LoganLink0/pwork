/**
 * Dexie 存储后端（生产默认）：把 Dexie 表包装成 TableStore 接口——语义即 Dexie 本体（直通转发）。
 * transaction 直接转发 Dexie 原生事务（保留其原子语义与 async 事务支持）。
 */
import type { Table } from 'dexie'
import type { Key, OrderedRows, StorageBackend, TableStore, WhereClause } from './types'

type AnyTable = Table<Record<string, unknown>, string>

class DexieTable<T extends Record<string, unknown>> implements TableStore<T> {
  constructor(private table: AnyTable) {}

  async get(key: Key): Promise<T | undefined> {
    return (await this.table.get(key)) as T | undefined
  }

  async put(value: T): Promise<Key> {
    return (await this.table.put(value as never)) as Key
  }

  async bulkPut(values: T[]): Promise<void> {
    await this.table.bulkPut(values as never[])
  }

  async bulkAdd(values: T[]): Promise<void> {
    await this.table.bulkAdd(values as never[])
  }

  async bulkDelete(keys: Key[]): Promise<void> {
    await this.table.bulkDelete(keys)
  }

  async delete(key: Key): Promise<void> {
    await this.table.delete(key)
  }

  async clear(): Promise<void> {
    await this.table.clear()
  }

  async count(): Promise<number> {
    return this.table.count()
  }

  async toArray(): Promise<T[]> {
    return (await this.table.toArray()) as T[]
  }

  async update(key: Key, changes: Partial<T>): Promise<number> {
    return this.table.update(key, changes as never)
  }

  where(field: keyof T & string): WhereClause<T> {
    // 条件与取值分离：equals/above/below 只改条件参数，Collection 在每次终结调用时按当前条件重建
    type Cmp = 'equals' | 'above' | 'below'
    let op: Cmp = 'equals'
    let value: string | number = ''
    const collection = () => {
      const w = this.table.where(field)
      if (op === 'equals') return w.equals(value)
      if (op === 'above') return w.above(value)
      return w.below(value)
    }
    const self: WhereClause<T> = {
      equals: (v) => {
        op = 'equals'
        value = v
        return self
      },
      above: (v) => {
        op = 'above'
        value = v
        return self
      },
      below: (v) => {
        op = 'below'
        value = v
        return self
      },
      toArray: async () => (await collection().toArray()) as T[],
      first: async () => (await collection().first()) as T | undefined,
      last: async () => (await collection().last()) as T | undefined,
      count: () => collection().count(),
      delete: () => collection().delete(),
    }
    return self
  }

  orderBy(field: keyof T & string): OrderedRows<T> {
    let reversed = false
    let limitN: number | null = null
    const collection = () => {
      const base = this.table.orderBy(field as string)
      const withOrder = reversed ? base.reverse() : base
      return limitN == null ? withOrder : withOrder.limit(limitN)
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
      toArray: async () => (await collection().toArray()) as T[],
      primaryKeys: () => collection().primaryKeys() as Promise<Key[]>,
    }
    return self
  }
}

/** Dexie 实例的最小形状（表属性 + 原生事务 + 打开）；与 delegate.ts 的 DexieLike 同构 */
export interface DexieBackendInstance {
  open(): Promise<void>
  transaction(mode: string, tables: unknown[], fn: () => Promise<void> | void): Promise<void>
  [name: string]: AnyTable | ((...args: never[]) => unknown)
}

export function createDexieBackend(instance: DexieBackendInstance): StorageBackend {
  const tableOf = (name: string): AnyTable => instance[name] as AnyTable
  return {
    table<T>(name: string): TableStore<T> {
      return new DexieTable(tableOf(name) as never) as TableStore<T>
    },
    async transaction(mode: 'rw' | 'r', names: string[], fn: () => Promise<void> | void): Promise<void> {
      await instance.transaction(mode, names.map((n) => tableOf(n)), fn)
    },
    open: () => instance.open(),
  }
}
