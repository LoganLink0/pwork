/**
 * 存储后端接口（08 设计 S1：W3 C-3 伏笔的兑现）。
 * 形状来自全量盘点（2026-10-30）：业务代码只用到下列访问形状——
 * get / put / bulkPut / bulkAdd / bulkDelete / delete / update(key+changes) / clear / count / toArray /
 * where(field).{equals,above,below} → {toArray, first, last, count, delete} / orderBy(field).{reverse,limit}.toArray /
 * orderBy(...).primaryKeys()（errorLog 上限淘汰）/ transaction(rw, 表名, fn)。
 * 接口刻意不含通用查询——新查询形状出现时先加接口再实现（R5：形状盘点驱动设计）。
 */
export type Key = string

/** 表级存储。kv 表同构，主键字段名由 backend 表构造时指定（kv 为 'key'，其余 'id'）。 */
export interface TableStore<T> {
  get(key: Key): Promise<T | undefined>
  put(value: T): Promise<Key>
  bulkPut(values: T[]): Promise<void>
  bulkAdd(values: T[]): Promise<void>
  bulkDelete(keys: Key[]): Promise<void>
  delete(key: Key): Promise<void>
  clear(): Promise<void>
  count(): Promise<number>
  toArray(): Promise<T[]>
  /** 部分更新：merge changes 进现有记录，返回更新条数（不存在为 0——与 Dexie update 语义一致） */
  update(key: Key, changes: Partial<T>): Promise<number>
  where(field: string): WhereClause<T>
  orderBy(field: string): OrderedRows<T>
}

export interface WhereClause<T> {
  equals(value: string | number): WhereClause<T>
  above(value: string | number): WhereClause<T>
  below(value: string | number): WhereClause<T>
  toArray(): Promise<T[]>
  first(): Promise<T | undefined>
  last(): Promise<T | undefined>
  count(): Promise<number>
  /** 供「过期清理」类调用：条件命中即物理删除，返回删除条数 */
  delete(): Promise<number>
}

export interface OrderedRows<T> {
  reverse(): OrderedRows<T>
  limit(n: number): OrderedRows<T>
  toArray(): Promise<T[]>
  /** Dexie Collection 语义：按存储主键序取键（errorLog 上限淘汰用） */
  primaryKeys(): Promise<Key[]>
}

/** 事务：fn 内对所列表的读写在一个原子单元内完成；fn 抛错则整体回滚。 */
export type TransactionFn = () => Promise<void> | void

/** 存储后端：业务层经 db 委托对象访问，测试用 setBackend 切换。 */
export interface StorageBackend {
  table<T>(name: string): TableStore<T>
  transaction(mode: 'rw' | 'r', tables: string[], fn: TransactionFn): Promise<void>
  /** Dexie 后端：打开底层连接（内存后端为空操作） */
  open?(): Promise<void>
}
