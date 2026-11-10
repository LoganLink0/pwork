/**
 * 保存的过滤器（1.2 批，R8）：把条目库的筛选状态（分层/搜索词/机会威胁标记）命名存档，
 * 一键套用、命令面板直达。存 kv 单键（数量少、整体读写足够），序列化走白名单——
 * 只存已知字段，未知字段丢弃、非法值回落默认（筛选字段随功能演进漂移时的对策）。
 * 月份刻意不入档：存下的月份会过期（陷阱），套用时不挪动当前月份位置。
 */
import { db } from '../db/schema'
import { newId } from '../db/repo'

export type ItemsStage = 'all' | 'must' | 'kept' | 'discarded'

/** 条目库筛选状态（白名单 schema v1） */
export interface ItemsFilterState {
  stage: ItemsStage
  query: string
  otOnly: boolean
}

export interface SavedFilter {
  id: string
  name: string
  scope: 'items'
  version: 1
  state: ItemsFilterState
}

const KEY = 'pwork-saved-filters'
/** 存档上限：过滤器是轻量入口不是资料库，超出丢最旧的 */
export const FILTER_CAP = 20

interface Store {
  version: 1
  list: SavedFilter[]
}

/** 状态白名单：非法 stage 回 'all'，未知字段丢弃 */
function sanitizeState(raw: unknown): ItemsFilterState {
  const s = (raw ?? {}) as Partial<ItemsFilterState>
  const stage: ItemsStage = s.stage === 'must' || s.stage === 'kept' || s.stage === 'discarded' ? s.stage : 'all'
  return { stage, query: typeof s.query === 'string' ? s.query : '', otOnly: s.otOnly === true }
}

/** 单条过滤器的读取防御：任何字段不合形状即整条丢弃（铁律 2） */
function sanitizeFilter(raw: unknown): SavedFilter | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Partial<SavedFilter>
  if (typeof r.id !== 'string' || !r.id) return null
  if (typeof r.name !== 'string' || !r.name.trim()) return null
  if (r.scope !== 'items' || r.version !== 1) return null
  return { id: r.id, name: r.name.trim(), scope: 'items', version: 1, state: sanitizeState(r.state) }
}

/** 整仓读取防御：坏结构回落空态，绝不崩（验收 ④） */
function normalizeStore(value: unknown): Store {
  const v = value as { version?: unknown; list?: unknown } | undefined
  if (!v || typeof v !== 'object' || v.version !== 1 || !Array.isArray(v.list)) return { version: 1, list: [] }
  const list: SavedFilter[] = []
  for (const raw of v.list) {
    const f = sanitizeFilter(raw)
    if (f) list.push(f)
  }
  return { version: 1, list: list.slice(-FILTER_CAP) }
}

export async function listSavedFilters(): Promise<SavedFilter[]> {
  try {
    const row = await db.kv.get(KEY)
    return normalizeStore(row?.value).list
  } catch {
    return []
  }
}

/** 保存（同名覆盖，不堆积）；名称必填 */
export async function saveSavedFilter(name: string, state: ItemsFilterState): Promise<SavedFilter> {
  const trimmed = name.trim()
  if (!trimmed) throw new Error('先给这个筛选起个名字')
  const list = await listSavedFilters()
  const filter: SavedFilter = { id: newId('flt'), name: trimmed, scope: 'items', version: 1, state: sanitizeState(state) }
  const next = [...list.filter((f) => f.name !== trimmed), filter].slice(-FILTER_CAP)
  await db.kv.put({ key: KEY, value: { version: 1, list: next } satisfies Store })
  return filter
}

export async function deleteSavedFilter(id: string): Promise<void> {
  const list = await listSavedFilters()
  await db.kv.put({ key: KEY, value: { version: 1, list: list.filter((f) => f.id !== id) } satisfies Store })
}

/** 筛选状态的展示摘要（命令面板 sub / 筛选条提示共用） */
export function describeFilterState(s: ItemsFilterState): string {
  const parts: string[] = []
  if (s.stage === 'must') parts.push('必看')
  else if (s.stage === 'kept') parts.push('我标注的')
  else if (s.stage === 'discarded') parts.push('已筛除')
  if (s.otOnly) parts.push('机会/威胁/趋势')
  if (s.query.trim()) parts.push(`搜索「${s.query.trim()}」`)
  return parts.length > 0 ? parts.join(' · ') : '全部条目'
}
