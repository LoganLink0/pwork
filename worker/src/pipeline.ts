/**
 * 抓取流水线（04 §4 五级的 C2 云端形态）：Fetch → Dedup → PreFilter → AI/规则评分 → 写 D1。
 * 约束：并发 ≤5、单源超时 10s；免费档子请求限额——单次 cron 最多处理 24 个源（4 批 × 并发 6）。
 */

import type { AiConfig } from './ai'
import { aiPrefilter, aiScore } from './ai'
import { fingerprintOf, prefilterByRules, scoreByRules, type WorkerSource } from './rules'
import { parseFeed, parseRss2Json } from './rss'

export interface Env {
  DB: D1Database
  TOKEN: string
  AI_BASE_URL: string
  AI_MODEL_CHEAP: string
  AI_MODEL_STRONG: string
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

async function fetchWithTimeout(url: string, timeoutMs: number): Promise<Response> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    return await fetch(url, { signal: ctrl.signal, cf: { cacheTtl: 0 } })
  } finally {
    clearTimeout(timer)
  }
}

/** 抓一个源：直连 →（失败）rss2json 服务端转接。云端无 CORS 限制，直连为主 */
export async function fetchSourceFeed(url: string): Promise<{ ok: boolean; error: string | null; items: { title: string; url: string; summary: string; publishedAt: string | null }[] }> {
  try {
    const resp = await fetchWithTimeout(url, TIMEOUT_MS)
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

  // 免费档子请求限额：单次最多写 ~50 条的清理操作
  await env.DB.prepare("DELETE FROM items WHERE stage IN ('raw', 'discarded') AND expires_at < ?").bind(new Date().toISOString()).run()

  return {
    ranAt: new Date().toISOString(),
    results,
    totalNew: results.reduce((n, r) => n + r.newCount, 0),
  }
}
