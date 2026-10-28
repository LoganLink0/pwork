/**
 * 云端同步客户端（W4/C2，04 §2/§9）。两种模式按网络环境选择：
 *
 * ① 端点模式：走 Worker 的 /api/items（workers.dev——大陆网络常不可达，海外/自有域名下用）。
 * ② D1 直连模式：直接调 Cloudflare API 查询 D1（api.cloudflare.com，大陆网络实测可达）——
 *    cron 在云端照常抓取入库，本地绕过 workers.dev 拿数据。需要只读 API Token（设置页有创建指引）。
 *
 * 不变式（AD5）：云端只是可丢弃暂存层；合并按指纹去重，本地已有的不动。
 */
import { db } from './schema'
import { normalizeItem } from './collect'
import { listActiveSources } from './collect'
import { saveBlock } from './blocksRepo'
import type { Item } from '../types/models'

const ENDPOINT_KEY = 'pwork-cloud-endpoint'
const TOKEN_KEY = 'pwork-cloud-token'
const LASTSYNC_KEY = 'pwork-cloud-lastsync'
const MODE_KEY = 'pwork-cloud-mode'
const ACCOUNT_KEY = 'pwork-cloud-account'
const DBID_KEY = 'pwork-cloud-dbid'
const INGEST_SINCE_KEY = 'pwork-ingest-since'

export type CloudMode = 'endpoint' | 'd1'

export interface CloudConfig {
  mode: CloudMode
  endpoint: string
  token: string
  accountId: string
  databaseId: string
}

export function loadCloudConfig(): CloudConfig {
  return {
    // 默认 D1 直连（2026-10-28 用户拍板）：Cloudflare 官方接口大陆可达，workers.dev 端点常被阻断
    mode: (localStorage.getItem(MODE_KEY) as CloudMode) || 'd1',
    endpoint: localStorage.getItem(ENDPOINT_KEY) ?? '',
    token: localStorage.getItem(TOKEN_KEY) ?? '',
    accountId: localStorage.getItem(ACCOUNT_KEY) ?? '',
    databaseId: localStorage.getItem(DBID_KEY) ?? '',
  }
}

export function saveCloudConfig(config: CloudConfig): void {
  // 端点强制 https（安全审计 2026-10-26 B12：http:// 端点会把 Token 与同步数据明文送出）
  if (config.endpoint.trim() && !/^https:\/\//i.test(config.endpoint.trim())) {
    throw new Error('云端端点必须是 https:// 地址（http 明文传输会泄漏 Token）')
  }
  localStorage.setItem(MODE_KEY, config.mode)
  localStorage.setItem(ENDPOINT_KEY, config.endpoint.trim())
  localStorage.setItem(TOKEN_KEY, config.token.trim())
  localStorage.setItem(ACCOUNT_KEY, config.accountId.trim())
  localStorage.setItem(DBID_KEY, config.databaseId.trim())
}

export function lastSyncAt(): string | null {
  return localStorage.getItem(LASTSYNC_KEY)
}

/** 云端配置是否已填到可同步（端点模式看端点；D1 直连看三项齐）——打开应用自动同步的门槛 */
export function cloudConfigured(): boolean {
  const c = loadCloudConfig()
  return c.mode === 'd1' ? Boolean(c.accountId && c.databaseId && c.token) : Boolean(c.endpoint)
}

interface SyncResult {
  ok: boolean
  newCount: number
  skipCount: number
  serverTime: string | null
  error: string | null
}

interface PushResult {
  ok: boolean
  imported: number
  skipped: number
  error: string | null
}

function markSynced(serverTime: string | null): void {
  localStorage.setItem(LASTSYNC_KEY, serverTime ?? new Date().toISOString())
}

/** 云端条目 → 本地 Item 形态（Curated：expiresAt 置空，本地负责保留策略） */
function cloudToLocal(raw: Record<string, unknown>): Item {
  const score = (raw.score ?? {}) as Record<string, number>
  const now = String(raw.fetchedAt ?? new Date().toISOString())
  return normalizeItem({
    id: `itmc_${String(raw.cloudId ?? raw.fingerprint ?? Math.random().toString(36).slice(2, 8))}`,
    sourceId: String(raw.sourceId ?? ''),
    sourceName: String(raw.sourceName ?? ''),
    url: String(raw.url ?? ''),
    title: String(raw.title ?? ''),
    summary: String(raw.summary ?? ''),
    fingerprint: String(raw.fingerprint ?? ''),
    eventGroup: null,
    publishedAt: (raw.publishedAt as string) ?? null,
    fetchedAt: now,
    stage: 'scored',
    score: {
      total: Number(score.total ?? 0),
      source: Number(score.source ?? 0),
      novelty: Number(score.novelty ?? 0),
      relevance: Number(score.relevance ?? 0),
      utility: Number(score.utility ?? 0),
    },
    scoreReason: String(raw.scoreReason ?? ''),
    aiBy: 'rules',
    tags: Array.isArray(raw.tags) ? (raw.tags as string[]) : [],
    otFlag: (raw.otFlag as Item['otFlag']) ?? null,
    expiresAt: null,
    annotation: { notes: '', vote: null, keepForever: false, linkedReviewId: null },
    createdAt: now,
    updatedAt: now,
    schemaVersion: 1,
  })
}

/** D1 行（snake_case）→ 本地 Item */
function d1RowToLocal(r: Record<string, unknown>): Item {
  return cloudToLocal({
    cloudId: r.id,
    sourceId: r.source_id,
    sourceName: r.source_name,
    url: r.url,
    title: r.title,
    summary: r.summary,
    fingerprint: r.fingerprint,
    publishedAt: r.published_at,
    fetchedAt: r.fetched_at,
    score: {
      total: r.score_total,
      source: r.score_source,
      novelty: r.score_novelty,
      relevance: r.score_relevance,
      utility: r.score_utility,
    },
    scoreReason: r.score_reason,
    tags: safeTags(r.tags),
    otFlag: r.ot_flag,
  })
}

function safeTags(v: unknown): unknown[] {
  if (Array.isArray(v)) return v
  if (typeof v === 'string') {
    try {
      const p = JSON.parse(v)
      return Array.isArray(p) ? p : []
    } catch {
      return []
    }
  }
  return []
}

async function mergeItems(incoming: Item[]): Promise<{ newCount: number; skipCount: number }> {
  let newCount = 0
  let skipCount = 0
  for (const item of incoming) {
    if (!item.fingerprint) {
      skipCount++
      continue
    }
    const existing = await db.items.where('fingerprint').equals(item.fingerprint).first()
    if (existing) {
      skipCount++
      continue
    }
    await db.items.put(item)
    newCount++
  }
  return { newCount, skipCount }
}

/* ------------------------------ ① 端点模式 ------------------------------ */

async function syncViaEndpoint(config: CloudConfig, since: string): Promise<SyncResult> {
  if (!config.endpoint) return { ok: false, newCount: 0, skipCount: 0, serverTime: null, error: '未配置同步端点' }
  const resp = await fetch(
    `${config.endpoint.replace(/\/$/, '')}/api/items?since=${encodeURIComponent(since)}`,
    { headers: config.token ? { authorization: `Bearer ${config.token}` } : {} },
  )
  if (!resp.ok) return { ok: false, newCount: 0, skipCount: 0, serverTime: null, error: `HTTP ${resp.status}` }
  const data = (await resp.json()) as { serverTime?: string; items?: Record<string, unknown>[] }
  const { newCount, skipCount } = await mergeItems((data.items ?? []).map(cloudToLocal))
  const serverTime = data.serverTime ?? new Date().toISOString()
  return { ok: true, newCount, skipCount, serverTime, error: null }
}

async function pushViaEndpoint(config: CloudConfig): Promise<PushResult> {
  const sources = await listActiveSources()
  const resp = await fetch(`${config.endpoint.replace(/\/$/, '')}/api/sources`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(config.token ? { authorization: `Bearer ${config.token}` } : {}) },
    body: JSON.stringify({
      sources: sources.map((s) => ({ name: s.name, url: s.url, domain: s.domain, tier: s.tier, weight: s.weight })),
    }),
  })
  if (!resp.ok) return { ok: false, imported: 0, skipped: 0, error: `HTTP ${resp.status}` }
  const data = (await resp.json()) as { imported?: number; skipped?: number }
  return { ok: true, imported: data.imported ?? 0, skipped: data.skipped ?? 0, error: null }
}

/* ------------------------------ ② D1 直连模式 ------------------------------ */

async function d1QueryImpl(config: CloudConfig, sql: string, params: (string | number)[]): Promise<Record<string, unknown>[]> {
  // api.cloudflare.com 不发 CORS 头（预检 405），浏览器页面直连必被拦——D1 查询先走本地
  // 网关代理（8788，随 dev/serve/桌面版自启，已带跨域头）；网关不在（网络级失败）再退
  // 直连（Node 语境可用）。网关有响应但报错（如 Token 无效 401）必须如实抛出——
  // 2026-10-28 修复：旧版把这类业务错误也吞进 fallback 直连，浏览器端被 CORS 拦后
  // 只剩 "Failed to fetch"，真实原因（凭据错）被完全掩盖
  let resp: Response
  try {
    resp = await fetch('http://127.0.0.1:8788/d1/query', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ accountId: config.accountId, databaseId: config.databaseId, token: config.token, sql, params }),
      signal: AbortSignal.timeout(30_000),
    })
    if (!resp.ok) {
      const body = await resp.text().catch(() => '')
      const detail = body.match(/"error"\s*:\s*"([^"]+)"/)?.[1] ?? `HTTP ${resp.status}`
      throw new Error(`D1 查询失败：${detail}（检查 账户 ID / 数据库 ID / API Token；API Token 需在 Cloudflare 控制台创建，不是部署输出的 ptk_ 开头 Token）`)
    }
  } catch (e) {
    if (e instanceof Error && e.message.startsWith('D1 查询失败')) throw e
    // 网关本身不在（连接被拒/超时）→ 尝试直连（浏览器会被 CORS 拦，但 Node/测试语境可用）
    resp = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${config.accountId}/d1/database/${config.databaseId}/query`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${config.token}` },
        body: JSON.stringify({ sql, params }),
      },
    )
  }
  if (!resp.ok) {
    const body = await resp.text().catch(() => '')
    throw new Error(`Cloudflare API HTTP ${resp.status}${body ? `：${body.slice(0, 120)}` : ''}`)
  }
  const data = (await resp.json()) as { success?: boolean; errors?: { message?: string }[]; result?: { results?: Record<string, unknown>[] }[] }
  if (!data.success) throw new Error(data.errors?.[0]?.message ?? 'Cloudflare API 返回失败')
  return data.result?.[0]?.results ?? []
}

/** D1 直连查询（设备镜像也走它——同一账号同一库，见 db/deviceMirror.ts） */
export async function d1Query(config: CloudConfig, sql: string, params: (string | number)[]): Promise<Record<string, unknown>[]> {
  return d1QueryImpl(config, sql, params)
}

async function syncViaD1(config: CloudConfig, since: string): Promise<SyncResult> {
  if (!config.accountId || !config.databaseId || !config.token) {
    return { ok: false, newCount: 0, skipCount: 0, serverTime: null, error: 'D1 直连需要：账户 ID + 数据库 ID + API Token（设置里有创建指引）' }
  }
  const rows = await d1Query(
    config,
    "SELECT * FROM items WHERE stage = 'scored' AND fetched_at > ? ORDER BY fetched_at DESC LIMIT 500",
    [since],
  )
  const { newCount, skipCount } = await mergeItems(rows.map(d1RowToLocal))
  // 水位用本批结果的最大 fetched_at（本地时钟与云端时钟漂移时，本地 now 可能越过未拉取的条目导致永久漏拉）
  const maxFetched = rows.reduce((m, r) => {
    const v = (r as { fetched_at?: string }).fetched_at ?? ''
    return v > m ? v : m
  }, '')
  const serverTime = maxFetched || new Date().toISOString()
  return { ok: true, newCount, skipCount, serverTime, error: null }
}

async function pushViaD1(config: CloudConfig): Promise<PushResult> {
  if (!config.accountId || !config.databaseId || !config.token) {
    return { ok: false, imported: 0, skipped: 0, error: 'D1 直连需要：账户 ID + 数据库 ID + API Token' }
  }
  const sources = await listActiveSources()
  let imported = 0
  let skipped = 0
  let firstError: string | null = null
  for (const s of sources) {
    try {
      const rows = await d1Query(config, 'SELECT id FROM sources WHERE url = ?', [s.url])
      if (rows.length > 0) {
        skipped++
        continue
      }
      await d1Query(
        config,
        `INSERT INTO sources (id, name, url, domain, tier, weight, active, fail_streak, created_at, updated_at)
         VALUES ('src_l_' || lower(hex(randomblob(8))), ?, ?, ?, ?, ?, 1, 0, ?, ?)`,
        [s.name, s.url, s.domain, s.tier, s.weight, new Date().toISOString(), new Date().toISOString()],
      )
      imported++
    } catch (e) {
      // 写入失败（限流/约束冲突等）不能伪装成"跳过"：记下首个错误让调用方看到
      skipped++
      if (!firstError) firstError = e instanceof Error ? e.message : String(e)
    }
  }
  return { ok: true, imported, skipped, error: firstError ? `部分推送失败（已推 ${imported} 个）：${firstError}` : null }
}

/* ------------------------------ 统一入口 ------------------------------ */

export async function syncFromCloud(): Promise<SyncResult> {
  const config = loadCloudConfig()
  const since = localStorage.getItem(LASTSYNC_KEY) ?? ''
  try {
    const r =
      config.mode === 'd1' ? await syncViaD1(config, since) : await syncViaEndpoint(config, since)
    if (r.ok) markSynced(r.serverTime)
    return r
  } catch (e) {
    return { ok: false, newCount: 0, skipCount: 0, serverTime: null, error: e instanceof Error ? e.message : '网络失败' }
  }
}

export async function pushSourcesToCloud(): Promise<PushResult> {
  const config = loadCloudConfig()
  try {
    return config.mode === 'd1' ? await pushViaD1(config) : await pushViaEndpoint(config)
  } catch (e) {
    return { ok: false, imported: 0, skipped: 0, error: e instanceof Error ? e.message : '网络失败' }
  }
}

/** 测试当前配置的连通性（不打数据）：端点模式拉 1 条；D1 直连查一条 counts */
export async function testConnection(): Promise<{ ok: boolean; message: string }> {
  const config = loadCloudConfig()
  try {
    if (config.mode === 'd1') {
      if (!config.token) return { ok: false, message: 'API Token 还没填——按下方「创建 API Token」三步指引创建后粘进来（部署输出的 ptk_ 开头 Token 在这里无效）' }
      if (!config.accountId || !config.databaseId) return { ok: false, message: '账户 ID / 数据库 ID 还没填——一键部署会自动填好，或到 Cloudflare 控制台首页复制' }
      const rows = await d1Query(config, 'SELECT count(*) AS n FROM sources', [])
      const n = (rows[0]?.n as number) ?? 0
      return { ok: true, message: `连接成功！云端已有 ${n} 个信源` }
    }
    if (!config.endpoint) return { ok: false, message: '先填写部署输出的端点地址' }
    const resp = await fetch(`${config.endpoint.replace(/\/$/, '')}/api/digest?n=1`, {
      headers: config.token ? { authorization: `Bearer ${config.token}` } : {},
    })
    return resp.ok ? { ok: true, message: '连接成功！' } : { ok: false, message: `端点可达但返回 HTTP ${resp.status}` }
  } catch {
    return {
      ok: false,
      message:
        config.mode === 'endpoint'
          ? '连不上（workers.dev 在大陆网络常被阻断）——建议切到 D1 直连模式'
          : '连不上：本地网关（127.0.0.1:8788）未在运行，或 账户 ID / 数据库 ID / Token 有误',
    }
  }
}

/** 云端抓取时间（北京时间整点表）：读与推。D1 模式直查/写 config 表；
 *  端点模式走 worker 的 /api/config/schedule。用户在设置页改，无需命令行。 */
export async function getScheduleHours(): Promise<{ ok: boolean; hours?: number[]; message: string }> {
  const config = loadCloudConfig()
  // 云端未配置时直接返回（空地址会退化成打到应用自身的相对路径请求）
  if (config.mode === 'endpoint' ? !config.endpoint : !config.accountId || !config.databaseId) {
    return { ok: false, message: '云端未配置' }
  }
  try {
    if (config.mode === 'd1') {
      const rows = await d1Query(config, 'SELECT value FROM config WHERE key = ?', ['schedule_hours'])
      const raw = (rows[0]?.value as string) ?? ''
      const hours = raw ? raw.split(',').map(Number) : [9, 11, 15, 18, 19, 20, 23]
      return { ok: true, hours, message: '' }
    }
    const resp = await fetch(`${config.endpoint.replace(/\/$/, '')}/api/config/schedule`)
    if (!resp.ok) return { ok: false, message: `云端返回 HTTP ${resp.status}` }
    const data = (await resp.json()) as { hours?: number[] }
    return { ok: true, hours: data.hours ?? [9, 11, 15, 18, 19, 20, 23], message: '' }
  } catch {
    return { ok: false, message: '读不到云端抓取时间——检查云端同步配置' }
  }
}

export async function pushScheduleHours(hours: number[]): Promise<{ ok: boolean; message: string }> {
  if (!hours.length || hours.some((h) => !Number.isInteger(h) || h < 0 || h > 23)) {
    return { ok: false, message: '抓取时间须为 0-23 的整点（用逗号分隔）' }
  }
  const config = loadCloudConfig()
  try {
    if (config.mode === 'd1') {
      await d1Query(config, 'INSERT OR REPLACE INTO config(key, value) VALUES(?, ?)', ['schedule_hours', hours.join(',')])
      return { ok: true, message: `已保存：每天 ${hours.join('、')} 点自动抓取` }
    }
    const resp = await fetch(`${config.endpoint.replace(/\/$/, '')}/api/config/schedule`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${config.token}` },
      body: JSON.stringify({ hours }),
    })
    if (!resp.ok) {
      const t = await resp.text().catch(() => '')
      return { ok: false, message: `云端返回 HTTP ${resp.status}${t ? '：' + t.slice(0, 80) : ''}` }
    }
    return { ok: true, message: `已保存：每天 ${hours.join('、')} 点自动抓取` }
  } catch {
    return { ok: false, message: '保存失败——检查云端同步配置与网络' }
  }
}

/** 云端采集偏好（兴趣域/屏蔽词/上下文）：向导部署后用户可在设置页改，改完即生效 */
export type CloudPrefs = { interests: string; dislikes: string; context: string }

export async function getCloudPrefs(): Promise<{ ok: boolean; prefs?: CloudPrefs; message: string }> {
  const config = loadCloudConfig()
  if (config.mode === 'endpoint' ? !config.endpoint : !config.accountId || !config.databaseId) {
    return { ok: false, message: '云端未配置' }
  }
  try {
    if (config.mode === 'd1') {
      const rows = await d1Query(config, 'SELECT key, value FROM config WHERE key IN (?, ?, ?)', ['interests', 'dislikes', 'context'])
      const map = new Map(rows.map((r) => [r.key as string, r.value as string]))
      return {
        ok: true,
        prefs: {
          interests: map.get('interests') ?? '',
          dislikes: map.get('dislikes') ?? '',
          context: map.get('context') ?? '',
        },
        message: '',
      }
    }
    const resp = await fetch(`${config.endpoint.replace(/\/$/, '')}/api/config/prefs`)
    if (!resp.ok) return { ok: false, message: `云端返回 HTTP ${resp.status}` }
    const data = (await resp.json()) as CloudPrefs
    return { ok: true, prefs: data, message: '' }
  } catch {
    return { ok: false, message: '读不到云端偏好——检查云端同步配置' }
  }
}

export async function pushCloudPrefs(prefs: CloudPrefs): Promise<{ ok: boolean; message: string }> {
  const config = loadCloudConfig()
  try {
    if (config.mode === 'd1') {
      const entries = Object.entries(prefs).filter(([, v]) => String(v).trim() !== '') as [string, string][]
      if (!entries.length) return { ok: false, message: '至少填一项再保存' }
      for (const [k, v] of entries) {
        await d1Query(config, 'INSERT OR REPLACE INTO config(key, value) VALUES(?, ?)', [k, String(v).slice(0, 300)])
      }
      return { ok: true, message: '云端采集偏好已保存，下次抓取生效' }
    }
    const resp = await fetch(`${config.endpoint.replace(/\/$/, '')}/api/config/prefs`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${config.token}` },
      body: JSON.stringify(prefs),
    })
    if (!resp.ok) {
      const t = await resp.text().catch(() => '')
      return { ok: false, message: `云端返回 HTTP ${resp.status}${t ? '：' + t.slice(0, 80) : ''}` }
    }
    return { ok: true, message: '云端采集偏好已保存，下次抓取生效' }
  } catch {
    return { ok: false, message: '保存失败——检查云端同步配置与网络' }
  }
}


/* ------------------------------ 外部数据推送拉取（/api/ingest） ------------------------------ */

export interface IngestPullResult {
  ok: boolean
  pulled: number
  error: string | null
}

interface IngestRow {
  id: string
  source: string
  title: string
  content: string
  created_at: string
}

/** 推送数据拉取水位（created_at > since 增量；本地块按 extId 去重兜底） */
function ingestSince(): string {
  return localStorage.getItem(INGEST_SINCE_KEY) ?? ''
}

/**
 * 拉取云端 /api/ingest 的推送数据 → 本地数据块。
 * 端点模式走 Worker；D1 直连走 api.cloudflare.com（大陆可达）。两种模式同一套去重与水位。
 */
export async function syncIngestBlocks(): Promise<IngestPullResult> {
  const config = loadCloudConfig()
  const since = ingestSince()
  let rows: IngestRow[] = []
  try {
    if (config.mode === 'd1') {
      if (!config.accountId || !config.databaseId || !config.token) {
        return { ok: false, pulled: 0, error: 'D1 直连需要：账户 ID + 数据库 ID + API Token（设置里有创建指引）' }
      }
      const r = await d1Query(
        config,
        'SELECT id, source, title, content, created_at FROM ingest_blocks WHERE created_at > ? ORDER BY created_at LIMIT 200',
        [since],
      )
      rows = r as unknown as IngestRow[]
    } else {
      if (!config.endpoint || !config.token) return { ok: false, pulled: 0, error: '端点模式需要：Worker 地址 + TOKEN' }
      // Token 走 Authorization 头（安全审计 2026-10-26 B3：URL 查询串会落入边缘日志与代理日志）
      const resp = await fetch(`${config.endpoint.replace(/\/$/, '')}/api/ingest?since=${encodeURIComponent(since)}`, {
        headers: { authorization: `Bearer ${config.token}` },
      })
      if (!resp.ok) return { ok: false, pulled: 0, error: `拉取失败（HTTP ${resp.status}）` }
      const body = (await resp.json()) as { blocks?: IngestRow[] }
      rows = body.blocks ?? []
    }
  } catch (e) {
    return { ok: false, pulled: 0, error: e instanceof Error ? e.message : String(e) }
  }

  let pulled = 0
  let newest = since
  for (const row of rows) {
    // 水位按本批所有行推进（含坏行）：坏行若不推进水位，每次同步都会被重新拉取
    if (row.created_at > newest) newest = row.created_at
    if (!row.id || !row.title || !row.content) continue
    const dup = await db.blocks.where('extId').equals(row.id).first()
    if (dup) continue
    const source = row.source && row.source !== 'api' ? `${row.source} · ${row.title}` : row.title
    await saveBlock({ title: source, content: row.content, extId: row.id })
    pulled++
  }
  if (newest) localStorage.setItem(INGEST_SINCE_KEY, newest)
  return { ok: true, pulled, error: null }
}
