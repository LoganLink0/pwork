/**
 * 设备同步的删除墓碑（安全审计 2026-10-26 B5）：
 * 本地物理清理（回收站 30 天清理 / 条目 14 天后悔期）发生时，对应记录已从本地表消失，
 * 增量推送看不到它——云端留的会是删除前的最后版本，其他设备拉取即"复活"已删数据。
 * 物理清理前在这里登记墓碑，推送时以墓碑形态发出（仅 id + 时间，无正文），
 * 拉取方对墓碑直接物理删除对应行；云端墓碑留存 90 天后清理。
 * 纯 localStorage，无依赖（repo/collect/syncRecords 三方共用，避免循环 import）。
 */
export interface Tombstone {
  entity: string
  id: string
  /** 删除时间（ISO），同时充当墓碑版本号 */
  at: string
}

const KEY = 'pwork-sync-tombstones'
/** 登记上限（滚动保留最新） */
const MAX = 500
/** 墓碑保留天数：超过后本地裁剪，云端同款窗口清理 */
export const TOMBSTONE_DAYS = 90

export function loadTombstones(): Tombstone[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? '[]') as Tombstone[]
    return Array.isArray(v) ? v.filter((t) => t && typeof t.entity === 'string' && typeof t.id === 'string' && typeof t.at === 'string') : []
  } catch {
    return []
  }
}

/** 登记一批墓碑（物理清理前调用）；同 entity+id 已存在时以新时间为准 */
export function registerTombstones(entity: string, items: { id: string; deletedAt?: string | null }[], now = new Date()): void {
  if (items.length === 0) return
  const at = now.toISOString()
  const existing = loadTombstones().filter((t) => !(t.entity === entity && items.some((i) => i.id === t.id)))
  const fresh: Tombstone[] = items.map((i) => ({ entity, id: i.id, at: i.deletedAt && i.deletedAt < at ? i.deletedAt : at }))
  const all = [...existing, ...fresh]
  localStorage.setItem(KEY, JSON.stringify(all.length > MAX ? all.slice(all.length - MAX) : all))
}

/** 取出某水位之后登记的墓碑（推送用） */
export function tombstonesSince(since: string): Tombstone[] {
  return loadTombstones().filter((t) => t.at > since)
}

/** 裁剪过期墓碑（推送后顺带） */
export function pruneTombstones(now = new Date()): void {
  const cutoff = now.getTime() - TOMBSTONE_DAYS * 86_400_000
  const kept = loadTombstones().filter((t) => new Date(t.at).getTime() > cutoff)
  localStorage.setItem(KEY, JSON.stringify(kept))
}
