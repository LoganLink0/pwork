/**
 * 记录级增量设备同步（2026-10-19，替换 2026-10-14 的"设备镜像档 1"）。
 *
 * 为什么重做：镜像档 1 是"复用 importBundle + d1Query 两块现成积木的最短路径"——
 * 每次打开全量推库、D1 存 60KB blob、单镜像源角色。用户判为狗尾续貂（复盘 3.20 案例 A）。
 * 本方案从需求本质出发：多设备数据一致 = 多主、逐记录、按 updatedAt 水位线增量。
 *
 * 形态：D1 表 pwork_sync_records(entity, id) → (updated_at, device, payload JSON)。
 * 推送只发上次之后变过的记录（首批 = 全量初始化，之后每轮只有增量）；
 * 拉取只收上次之后的新记录，逐记录按新者胜落地。任何设备读+写，无角色概念。
 * 软删除（deletedAt 有值且 updatedAt 更新）照常传播；物理清理是本地行为不同步。
 *
 * 不同步：errorLog / aiCache（设备本地性质）；items 的 raw/discarded（与备份口径一致）。
 * 走 D1 直连（api.cloudflare.com 大陆实测可达），复用云端同步的配置与 Token。
 */

import { d1Query, loadCloudConfig } from './cloudSync'
import { importBundle, type ImportResult } from './backup'
import { db } from './schema'
import { loadCollectConfig, saveCollectConfig } from '../content/collect'
import { tombstonesSince, pruneTombstones, TOMBSTONE_DAYS } from './tombstones'

const SYNC_KEY = 'pwork-device-sync'
const PUSH_SINCE = 'pwork-sync-push-since'
const PULL_SINCE = 'pwork-sync-pull-since'
const DEVICE_KEY = 'pwork-sync-device-id'
/** 配置最后修改时间（content/collect.ts 的 saveCollectConfig 落戳） */
const CONFIG_AT = 'pwork-collect-config-at'

export interface SyncConfig {
  enabled: boolean
  lastSyncAt: string | null
  lastPushed: number
  lastPulled: number
}

export function loadSyncConfig(): SyncConfig {
  try {
    const v = JSON.parse(localStorage.getItem(SYNC_KEY) ?? '') as Partial<SyncConfig>
    return { enabled: Boolean(v.enabled), lastSyncAt: v.lastSyncAt ?? null, lastPushed: v.lastPushed ?? 0, lastPulled: v.lastPulled ?? 0 }
  } catch {
    return { enabled: false, lastSyncAt: null, lastPushed: 0, lastPulled: 0 }
  }
}

export function saveSyncConfig(cfg: SyncConfig): void {
  localStorage.setItem(SYNC_KEY, JSON.stringify(cfg))
}

/** 设备标识（云端留痕 + 排查"哪台改的"用；仅本机随机串，无隐私） */
export function deviceId(): string {
  let id = localStorage.getItem(DEVICE_KEY)
  if (!id) {
    id = `dev-${Math.random().toString(36).slice(2, 8)}`
    localStorage.setItem(DEVICE_KEY, id)
  }
  return id
}

function requireD1() {
  const cloud = loadCloudConfig()
  if (cloud.mode !== 'd1' || !cloud.accountId || !cloud.databaseId || !cloud.token) {
    throw new Error('设备同步需要云端同步按「D1 直连」配置（设置 → 云端同步）')
  }
  return cloud
}

/* ---------------------- 纯函数（可单测） ---------------------- */

export interface SyncRow {
  entity: string
  id: string
  updated_at: string
  device: string
  payload: string
}

/** 实体清单：key 与备份 bundle 一致（复用 importBundle 的合并语义） */
const ENTITIES: { key: string; table: { toArray(): Promise<{ id: string; updatedAt?: string; createdAt?: string; deletedAt?: string | null; stage?: string }[]> } }[] = [
  { key: 'notes', table: db.notes },
  { key: 'sources', table: db.sources },
  { key: 'items', table: db.items },
  { key: 'reviews', table: db.reviews },
  { key: 'actions', table: db.actions },
  { key: 'insights', table: db.insights },
  { key: 'tasks', table: db.tasks },
  { key: 'goals', table: db.goals },
  { key: 'snapshots', table: db.snapshots },
  { key: 'blocks', table: db.blocks },
  { key: 'profiles', table: db.profiles },
  { key: 'caseFiles', table: db.caseFiles },
]

/** items 只同步 curated（scored/kept 且未软删）——与备份口径一致，raw/discarded 是本地暂存 */
function syncable(r: { deletedAt?: string | null; stage?: string }): boolean {
  if (r.deletedAt) return false
  if (r.stage !== undefined && r.stage !== 'scored' && r.stage !== 'kept') return false
  return true
}

/** 记录变更时间：updatedAt 优先，snapshots 等以 createdAt 兜底 */
export function recordAt(r: { updatedAt?: string; createdAt?: string }): string {
  return r.updatedAt ?? r.createdAt ?? ''
}

/** 从全表快照挑选需推送的行（since 之后变更的）；config 单列特判 */
export function pickChanged(
  tables: { key: string; rows: { id: string; updatedAt?: string; createdAt?: string; deletedAt?: string | null; stage?: string }[] }[],
  since: string,
  device: string,
): SyncRow[] {
  const rows: SyncRow[] = []
  for (const t of tables) {
    for (const r of t.rows) {
      if (!r.id) continue
      if (t.key === 'items' && !syncable(r)) continue
      const at = recordAt(r)
      if (!at || at <= since) continue
      rows.push({ entity: t.key, id: r.id, updated_at: at, device, payload: JSON.stringify(r) })
    }
  }
  return rows
}

/** 分批 upsert：每批 N 行单语句（D1 语句上限 100KB，payload 数 KB 级取 10 行/批） */
export function upsertBatches(rows: SyncRow[], batch = 10): { sql: string; params: (string | number)[] }[] {
  const out: { sql: string; params: (string | number)[] }[] = []
  for (let i = 0; i < rows.length; i += batch) {
    const part = rows.slice(i, i + batch)
    const values = part.map(() => '(?,?,?,?,?)').join(',')
    out.push({
      sql: `INSERT OR REPLACE INTO pwork_sync_records (entity, id, updated_at, device, payload) VALUES ${values}`,
      params: part.flatMap((r) => [r.entity, r.id, r.updated_at, r.device, r.payload]),
    })
  }
  return out
}

/** 判定墓碑行（B5）：本地物理清理后推送的专用形态——只有 id/deletedAt/updatedAt 三个键，无正文 */
export function isTombstonePayload(entity: string, payload: unknown): payload is { id: string; deletedAt: string; updatedAt: string } {
  if (entity === 'collectConfig' || !payload || typeof payload !== 'object') return false
  const keys = Object.keys(payload as Record<string, unknown>)
  const p = payload as Record<string, unknown>
  return keys.length <= 3 && typeof p.id === 'string' && typeof p.deletedAt === 'string' && typeof p.updatedAt === 'string'
}

/** 拉回的行 → importBundle 的 entities 形态；collectConfig 单列（同步层自己按水位应用，不吃备份的无条件覆盖） */
export function rowsToEntities(rows: { entity: string; payload: string }[]): { entities: Record<string, unknown[]>; configPayload: unknown | null } {
  const entities: Record<string, unknown[]> = {}
  let configPayload: unknown = null
  for (const r of rows) {
    const parsed = JSON.parse(r.payload)
    if (r.entity === 'collectConfig') {
      configPayload = parsed
      continue
    }
    ;(entities[r.entity] ??= []).push(parsed)
  }
  return { entities, configPayload }
}

/* ---------------------- 推送 / 拉取 ---------------------- */

const TABLE_DDL =
  'CREATE TABLE IF NOT EXISTS pwork_sync_records (entity TEXT NOT NULL, id TEXT NOT NULL, updated_at TEXT NOT NULL, device TEXT NOT NULL, payload TEXT NOT NULL, PRIMARY KEY (entity, id))'

export interface SyncPushResult {
  ok: boolean
  pushed: number
  error?: string
}

export async function pushChangedRecords(): Promise<SyncPushResult> {
  const cloud = requireD1()
  const since = localStorage.getItem(PUSH_SINCE) ?? ''
  const tables = await Promise.all(ENTITIES.map(async (e) => ({ key: e.key, rows: await e.table.toArray() })))
  let rows = pickChanged(tables, since, deviceId())
  // 墓碑（B5）：本地已物理清理的行以专用形态推送（仅 id + 时间，无正文），
  // 防其他设备把云端留存的删除前版本拉回去"复活"
  const tombs = tombstonesSince(since)
  for (const t of tombs) {
    rows = [...rows, { entity: t.entity, id: t.id, updated_at: t.at, device: deviceId(), payload: JSON.stringify({ id: t.id, deletedAt: t.at, updatedAt: t.at }) }]
  }
  // 配置：修改时间在本地 CONFIG_AT，变过则作为单记录推送
  const configAt = localStorage.getItem(CONFIG_AT) ?? ''
  if (configAt && configAt > since) {
    rows = [...rows, { entity: 'collectConfig', id: 'collect', updated_at: configAt, device: deviceId(), payload: JSON.stringify(loadCollectConfig()) }]
  }
  if (rows.length === 0) {
    pruneTombstones()
    return { ok: true, pushed: 0 }
  }
  await d1Query(cloud, TABLE_DDL, [])
  const batches = upsertBatches(rows)
  for (const b of batches) await d1Query(cloud, b.sql, b.params)
  const maxAt = rows.reduce((m, r) => (r.updated_at > m ? r.updated_at : m), since)
  localStorage.setItem(PUSH_SINCE, maxAt)
  pruneTombstones()
  return { ok: true, pushed: rows.length }
}

export interface SyncPullResult {
  ok: boolean
  pulled: number
  merged?: number
  configApplied: boolean
  error?: string
}

export async function pullChangedRecords(): Promise<SyncPullResult> {
  const cloud = requireD1()
  await d1Query(cloud, TABLE_DDL, [])
  const since = localStorage.getItem(PULL_SINCE) ?? ''
  type Row = { entity: string; id: string; updated_at: string; device: string; payload: string }
  const all: Row[] = []
  let cursor = since
  for (;;) {
    const rows = (await d1Query(cloud, 'SELECT entity, id, updated_at, device, payload FROM pwork_sync_records WHERE updated_at > ? ORDER BY updated_at LIMIT 1000', [cursor])) as unknown as Row[]
    all.push(...rows)
    if (rows.length < 1000) break
    cursor = rows[rows.length - 1]!.updated_at
  }
  if (all.length === 0) return { ok: true, pulled: 0, configApplied: false }
  // 墓碑分流（B5）：专用形态的行直接物理删除本地对应记录，不走 importBundle（缺正文字段会被 normalize 过滤）
  const tombRows = all.filter((r) => {
    try {
      return isTombstonePayload(r.entity, JSON.parse(r.payload))
    } catch {
      return false
    }
  })
  const entityRows = all.filter((r) => !tombRows.includes(r))
  for (const t of tombRows) {
    const table = ENTITIES.find((e) => e.key === t.entity)?.table
    if (table) await (table as unknown as { delete(id: string): Promise<unknown> }).delete(t.id)
  }
  // 云端墓碑清理：留存窗口外的墓碑行从云端删除（隐私边界——删除操作最终在云端也生效）
  const tombCutoff = new Date(Date.now() - TOMBSTONE_DAYS * 86_400_000).toISOString()
  const expiredTombs = tombRows.filter((t) => t.updated_at < tombCutoff)
  for (let i = 0; i < expiredTombs.length; i += 50) {
    const part = expiredTombs.slice(i, i + 50)
    const marks = part.map(() => '(?,?)').join(',')
    await d1Query(cloud, `DELETE FROM pwork_sync_records WHERE (entity, id) IN (${marks})`, part.flatMap((t) => [t.entity, t.id]))
  }
  const { entities, configPayload } = rowsToEntities(entityRows)
  let merged = 0
  let importResult: ImportResult | undefined
  if (Object.keys(entities).length > 0) {
    importResult = await importBundle(JSON.stringify({ version: 2, exportedAt: new Date().toISOString(), entities }))
    merged = Object.values(importResult.counts).reduce((a, b) => a + b, 0)
  }
  // 配置按水位应用：远端配置时间 > 本地最后修改时间才覆盖（本机刚改的不被旧云盖掉）
  let configApplied = false
  if (configPayload) {
    const remoteConfigRow = all.find((r) => r.entity === 'collectConfig')!
    const localAt = localStorage.getItem(CONFIG_AT) ?? ''
    if (remoteConfigRow.updated_at > localAt) {
      saveCollectConfig(configPayload as Parameters<typeof saveCollectConfig>[0])
      configApplied = true
    }
  }
  const maxAt = all.reduce((m, r) => (r.updated_at > m ? r.updated_at : m), since)
  localStorage.setItem(PULL_SINCE, maxAt)
  return { ok: true, pulled: all.length, merged, configApplied }
}

/** 一键同步：先拉（吸收他机变更）再推（发布本机增量） */
export async function syncNow(): Promise<{ push: SyncPushResult; pull: SyncPullResult }> {
  const pull = await pullChangedRecords()
  const push = await pushChangedRecords()
  return { pull, push }
}
