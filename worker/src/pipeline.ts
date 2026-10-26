/**
 * 抓取流水线（04 §4 五级的 C2 云端形态）：Fetch → Dedup → PreFilter → AI/规则评分 → 写 D1。
 * 约束：并发 ≤5、单源超时 10s；免费档子请求限额——单次 cron 最多处理 24 个源（4 批 × 并发 6）。
 */

import type { AiConfig } from './ai'
import { aiPrefilter, aiScore } from './ai'
import { fingerprintOf, prefilterByRules, scoreByRules, type WorkerSource } from './rules'
import { parseFeed, parseRss2Json } from './rss'
import { assertPublicHttpUrl, guardedFetch } from './urlGuard'

export interface Env {
  DB: D1Database
  TOKEN: string
  LLM_TOKEN?: string
  /** 读端点可选鉴权（安全审计 B9）：设置后 /api/items、/api/digest、/api/sources、/rss/daily.xml 需携带 */
  READ_TOKEN?: string
  AI_BASE_URL: string
  AI_MODEL_CHEAP: string
  AI_MODEL_STRONG: string
  /** LLM 代理端点允许的第二个模型（与 AI_MODEL_CHEAP 构成白名单） */
  AI_MODEL?: string
  AI_DAILY_TOKEN_BUDGET: string
  INTERESTS: string
  DISLIKES: string
  CONTEXT: string
  AI_API_KEY?: string
}

export const TTL_DAYS = 14
const CONCURRENCY = 5
const TIMEOUT_MS = 10_000

export function aiConfigFrom(env: Env): AiConfig {
  return {
    baseUrl: env.AI_BASE_URL,
    apiKey: env.AI_API_KEY,
    modelCheap: env.AI_MODEL_CHEAP,
    modelStrong: env.AI_MODEL_STRONG,
    dailyBudget: Number(env.AI_DAILY_TOKEN_BUDGET) || 300_000,
    interests: env.INTERESTS.split(',').map((s) => s.trim()).filter(Boolean),
    dislikes: env.DISLIKES.split(',').map((s) => s.trim()).filter(Boolean),
    context: env.CONTEXT,
  }
}

/** 每日 token 熔断（D1 usage 表，UTC 日）；返回 false 表示已熔断 */
export async function spendTokens(env: Env, n: number): Promise<boolean> {
  const day = new Date().toISOString().slice(0, 10)
  const row = await env.DB.prepare('SELECT tokens FROM usage WHERE day = ?').bind(day).first<{ tokens: number }>()
  const used = row?.tokens ?? 0
  const budget = Number(env.AI_DAILY_TOKEN_BUDGET) || 300_000
  if (used >= budget) return false
  await env.DB.prepare(
    'INSERT INTO usage (day, tokens) VALUES (?, ?) ON CONFLICT(day) DO UPDATE SET tokens = tokens + ?',
  )
    .bind(day, n, n)
    .run()
  return used + n <= budget
}

async function fetchWithTimeout(url: string, timeoutMs: number, headers?: Record<string, string>): Promise<Response> {
  // 出站统一走 guardedFetch（URL 守卫：拒绝内网/环回/保留地址）
  return guardedFetch(url, headers ? { headers } : undefined, timeoutMs)
}

// 部分源（如 Solidot）会 403 拒绝非浏览器 UA——出站统一带浏览器 UA
const BROWSER_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36'

/** 抓一个源：直连 →（失败）rss2json 服务端转接。云端无 CORS 限制，直连为主。
 *  守卫拒绝（内网/环回地址）的 URL 不再交给 rss2json——内网主机名不能向第三方披露（安全审计 B6） */
export async function fetchSourceFeed(url: string): Promise<{ ok: boolean; error: string | null; items: { title: string; url: string; summary: string; publishedAt: string | null }[] }> {
  assertPublicHttpUrl(url)
  try {
    const resp = await fetchWithTimeout(url, TIMEOUT_MS, { 'user-agent': BROWSER_UA })
    if (resp.ok) {
      const r = parseFeed(await resp.text())
      if (r.ok) return r
    } else {
      const via = await fetchWithTimeout(
        `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(url)}`,
        TIMEOUT_MS,
      )
      if (via.ok) {
        const r = parseRss2Json(await via.text())
        if (r.ok) return r
        return { ok: false, items: [], error: `HTTP ${resp.status} + 转接失败` }
      }
      return { ok: false, items: [], error: `HTTP ${resp.status}` }
    }
  } catch (e) {
    if (e instanceof Error && e.message.startsWith('拒绝')) return { ok: false, items: [], error: e.message }
    const msg = e instanceof Error && e.name === 'AbortError' ? '超时（>10s）' : '网络失败'
    try {
      const via = await fetchWithTimeout(
        `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(url)}`,
        TIMEOUT_MS,
      )
      if (via.ok) {
        const r = parseRss2Json(await via.text())
        if (r.ok) return r
      }
    } catch {
      /* 转接也失败 */
    }
    return { ok: false, items: [], error: msg }
  }
  return { ok: false, items: [], error: '解析失败' }
}

export interface SourceRunResult {
  sourceId: string
  sourceName: string
  ok: boolean
  newCount: number
  duplicateCount: number
  discardedCount: number
  error: string | null
  autoStopped: boolean
}

/** 处理单个源：抓取 → 去重 → 预筛（AI→规则）→ 评分（AI→规则）→ 写 D1 */
export async function runSource(env: Env, ai: AiConfig, source: WorkerSource, domainCount: Map<string, number>, todayUtc: string): Promise<SourceRunResult> {
  const base: SourceRunResult = { sourceId: source.id, sourceName: source.name, ok: false, newCount: 0, duplicateCount: 0, discardedCount: 0, error: null, autoStopped: false }
  const feed = await fetchSourceFeed(source.url)
  if (!feed.ok) {
    base.error = feed.error
    base.autoStopped = await markFail(env, source, feed.error ?? '未知错误')
    return base
  }
  await env.DB.prepare('UPDATE sources SET fail_streak = 0, last_ok_at = ?, last_error = NULL WHERE id = ?')
    .bind(new Date().toISOString(), source.id)
    .run()

  for (const raw of feed.items) {
    const fp = fingerprintOf(raw.url, raw.title)
    const dup = await env.DB.prepare('SELECT 1 FROM items WHERE fingerprint = ?').bind(fp).first()
    if (dup) {
      base.duplicateCount++
      continue
    }
    const now = new Date().toISOString()
    const expiresAt = new Date(Date.now() + TTL_DAYS * 86_400_000).toISOString()
    const domainSeen = domainCount.get(source.domain) ?? 0

    // ③ 预筛：AI 4a → 规则
    let pass = true
    let discardReason = ''
    const aiPre = await aiPrefilter(ai, raw.title, raw.summary, (n) => spendTokens(env, n))
    if (aiPre) {
      pass = aiPre.pass
      discardReason = aiPre.reason
    } else {
      const r = prefilterByRules(raw.title, raw.summary, ai.dislikes)
      pass = r.pass
      discardReason = r.reason
    }
    if (!pass) {
      await env.DB.prepare(
        `INSERT INTO items (id, source_id, source_name, url, title, summary, fingerprint, published_at, fetched_at, stage, score_total, expires_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'discarded', 0, ?, ?)`,
      )
        .bind(`itm_${crypto.randomUUID().slice(0, 13)}`, source.id, source.name, raw.url, raw.title, raw.summary, fp, raw.publishedAt, now, expiresAt, now)
        .run()
      base.discardedCount++
      domainCount.set(source.domain, domainSeen + 1)
      continue
    }

    // ④ 评分：AI 4b → 规则
    const aiS = await aiScore(ai, raw.title, raw.summary, (n) => spendTokens(env, n))
    let total: number
    let sSource = source.weight
    let novelty: number
    let relevance: number
    let utility: number
    let reason: string
    let tags: string[]
    let otFlag: string | null = null
    let aiBy = 'rules'
    if (aiS) {
      // 云端 AI 分已有四维；source 维度本地补权
      total = Math.round(100 * (0.3 * source.weight + 0.25 * aiS.novelty + 0.25 * aiS.relevance + 0.2 * aiS.utility))
      novelty = aiS.novelty
      relevance = aiS.relevance
      utility = aiS.utility
      reason = aiS.reason
      tags = aiS.tags
      otFlag = aiS.otFlag
      aiBy = ai.modelStrong
    } else {
      const r = scoreByRules(source, raw.title, raw.summary, domainSeen, ai.interests)
      total = r.total
      novelty = r.novelty
      relevance = r.relevance
      utility = r.utility
      reason = r.reason
      tags = r.tags
    }

    await env.DB.prepare(
      `INSERT INTO items (id, source_id, source_name, url, title, summary, fingerprint, published_at, fetched_at, stage, score_total, score_source, score_novelty, score_relevance, score_utility, score_reason, ai_by, tags, ot_flag, expires_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'scored', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        `itm_${crypto.randomUUID().slice(0, 13)}`,
        source.id,
        source.name,
        raw.url,
        raw.title,
        raw.summary,
        fp,
        raw.publishedAt,
        now,
        total,
        sSource,
        novelty,
        relevance,
        utility,
        reason,
        aiBy,
        JSON.stringify(tags),
        otFlag,
        // scored 层仍给 TTL（本地拉取后云端可清，04 §2 C2）；本地入库转 Curated
        expiresAt,
        now,
      )
      .run()
    base.newCount++
    domainCount.set(source.domain, domainSeen + 1)
  }
  base.ok = true
  // 抓取成功但整轮零新增：把"feed 内容未更新"记进 last_error，源列表可见，不再静默
  if (base.newCount === 0 && base.duplicateCount > 0 && base.discardedCount === 0) {
    await env.DB.prepare('UPDATE sources SET last_error = ? WHERE id = ?')
      .bind(`feed ${base.duplicateCount} 条全部重复（源内容未更新）`, source.id)
      .run()
  }
  void todayUtc
  return base
}

async function markFail(env: Env, source: WorkerSource, error: string): Promise<boolean> {
  const row = await env.DB.prepare('SELECT fail_streak, active FROM sources WHERE id = ?').bind(source.id).first<{ fail_streak: number; active: number }>()
  const streak = (row?.fail_streak ?? 0) + 1
  const autoStop = streak >= 3 && (row?.active ?? 0) === 1
  await env.DB.prepare('UPDATE sources SET fail_streak = ?, active = ?, last_error = ? WHERE id = ?')
    .bind(streak, autoStop ? 0 : (row?.active ?? 1), error.slice(0, 120), source.id)
    .run()
  return autoStop
}

/** 并发受限映射 */
async function mapLimited<T, R>(tasks: T[], limit: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const results: R[] = []
  let cursor = 0
  const workers = Array.from({ length: Math.min(limit, tasks.length) }, async () => {
    while (cursor < tasks.length) {
      const i = cursor++
      results[i] = await fn(tasks[i]!)
    }
  })
  await Promise.all(workers)
  return results
}

export interface RunSummary {
  ranAt: string
  results: SourceRunResult[]
  totalNew: number
}

/** cron / 手动触发入口：活跃源全量跑一轮 */
export async function runPipeline(env: Env, ai: AiConfig): Promise<RunSummary> {
  const { results: sources } = await env.DB.prepare('SELECT * FROM sources WHERE active = 1 ORDER BY tier').all<WorkerSource>()
  const todayUtc = new Date().toISOString().slice(0, 10)
  const domainCount = new Map<string, number>()
  for (const s of sources) domainCount.set(s.domain, 0)

  const results = await mapLimited(sources, CONCURRENCY, (s) => runSource(env, ai, s, domainCount, todayUtc))

  // 清理（B4，2026-10-26 安全审计：云端是暂存层，所有表都要有界）——
  // items 的 expires_at = 写入 + 14 天 TTL，到期后再留 7 天宽限（给本地拉取留窗口）后删除；
  // ingest_blocks 保 14 天；ingest_rate/usage 只留 90 天。D1 batch 一次往返
  const d7 = new Date(Date.now() - 7 * 86_400_000).toISOString()
  const d14 = new Date(Date.now() - 14 * 86_400_000).toISOString()
  const d90 = new Date(Date.now() - 90 * 86_400_000).toISOString()
  await env.DB.batch([
    env.DB.prepare('DELETE FROM items WHERE expires_at < ?').bind(d7),
    env.DB.prepare('DELETE FROM ingest_blocks WHERE created_at < ?').bind(d14),
    env.DB.prepare('DELETE FROM ingest_rate WHERE minute < ?').bind(d90),
    env.DB.prepare('DELETE FROM usage WHERE day < ?').bind(d90.slice(0, 10)),
  ])

  return {
    ranAt: new Date().toISOString(),
    results,
    totalNew: results.reduce((n, r) => n + r.newCount, 0),
  }
}
