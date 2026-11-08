/**
 * 配对码直执行（2026-11-08 手机端两步配对）：/api/d1/query 收到「配对码」或部署 Token
 * 鉴权时，不再转发官方 API，用 worker 自己的 D1 绑定就地执行——手机端配置从
 * 「Cloudflare API Token + 账户 ID + 数据库 ID」缩到「端点地址 + 配对码」，
 * 且少绕一跳官方 API。
 *
 * 白名单（配对码持有者 = 使用者自己的手机，仍按最小授权收口）：
 *   语句类型  仅 SELECT / INSERT / UPDATE / DELETE，单条（拒绝分号与注释）；
 *   涉及表    仅 items / sources / config / pwork_sync_records——同步链路的全部表；
 *   其余任何表（notes / aiCache / errorLog 等个人数据）一律拒绝。
 */
import type { Env } from './pipeline'

const ALLOWED_PREFIX = /^(?:select|insert|update|delete)\b/i
const ALLOWED_TABLES = new Set(['items', 'sources', 'config', 'pwork_sync_records', 'ingest_blocks'])
const TABLE_RE = /\b(?:from|into|update|join)\s+["`[]?([a-zA-Z_][a-zA-Z0-9_]*)["`\]]?/gi
const PAIRING_CACHE_TTL_MS = 60_000

/** 单条白名单语句校验：不过就抛错（错误消息会原样到前端展示给用户） */
export function assertSyncSql(sqlRaw: string): void {
  const sql = sqlRaw.trim()
  if (!sql) throw new Error('空语句')
  if (/[;]|--|\/\*/.test(sql)) throw new Error('仅允许单条语句（不含分号与注释）')
  if (!ALLOWED_PREFIX.test(sql)) throw new Error('仅允许查询与增改语句（SELECT / INSERT / UPDATE / DELETE）')
  const tables = new Set<string>()
  for (const m of sql.matchAll(TABLE_RE)) tables.add(m[1].toLowerCase())
  if (tables.size === 0) throw new Error('无法识别语句涉及的表')
  for (const t of tables) {
    if (!ALLOWED_TABLES.has(t)) throw new Error(`表不在同步白名单内：${t}`)
  }
}

/** 就地执行并按官方 API 的响应形状包装（前端 readD1Results 解析同一套，零改动） */
export async function executeSyncSql(env: Env, sql: string, params: (string | number | null)[]): Promise<unknown> {
  const stmt = env.DB.prepare(sql).bind(...params)
  const res = /^select\b/i.test(sql.trim()) ? await stmt.all() : await stmt.run()
  return { success: true, result: [{ results: res.results ?? [] }] }
}

/** 读配对码（config 表，isolate 内 60s 缓存——每次查询多一跳读也伤） */
let pairingCache: { code: string | null; at: number } | null = null

export async function getPairingCode(env: Env): Promise<string | null> {
  if (pairingCache && Date.now() - pairingCache.at < PAIRING_CACHE_TTL_MS) return pairingCache.code
  const row = await env.DB.prepare('SELECT value FROM config WHERE key = ?').bind('sync_pairing_code').first<{ value: string }>()
  pairingCache = { code: row?.value ?? null, at: Date.now() }
  return pairingCache.code
}
