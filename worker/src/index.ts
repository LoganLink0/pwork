/**
 * 入口：HTTP API（本地工作台同步端点，04 §9）+ Cron 触发。
 * 鉴权：写操作必须 Bearer TOKEN；读操作开放（对齐 AIHOT 匿名读）。
 * 端点：
 *   GET  /api/items?since=&minScore=&ot=   增量同步（CORS 开放）
 *   GET  /api/digest?date=&n=              当日 Top N
 *   GET  /api/sources                      信源清单
 *   POST /api/sources                      推送信源清单（覆盖式合并）
 *   POST /api/ingest                       外部数据推送（单块或 { blocks: [...] }，鉴权）
 *   GET  /api/ingest?since=                拉取推送数据（鉴权——业务数据默认敏感）
 *   POST /api/fetch                        手动触发一轮抓取
 *   GET  /rss/daily.xml                    当日 Top N 对外输出
 *   POST /api/llm/chat/completions         LLM 代理（Bearer LLM_TOKEN；本地工具经此调 AI，真 Key 只存服务端 secret）
 */

import { aiConfigFrom, runPipeline, type Env } from './pipeline'
import { INGEST_MAX_PER_MINUTE, INGEST_MAX_PER_REQUEST, minuteKey, normalizeIngest } from './ingest'
import { assertPublicHttpUrl, guardedFetch } from './urlGuard'

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, POST, OPTIONS',
  'access-control-allow-headers': 'content-type, authorization',
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8', ...CORS } })
}

/** ingest_blocks 建表只需每个 isolate 做一次（D1 无迁移机制，端点内幂等确保） */
let ingestEnsured = false

function checkAuth(request: Request, env: Env): boolean {
  // TOKEN 未配置或为空串时一律拒绝（安全审计 2026-10-26 B10：空串时 '' === '' 会放行全部写操作）
  if (!env.TOKEN) return false
  const header = request.headers.get('authorization') ?? ''
  const token = header.replace(/^Bearer\s+/i, '')
  return token === env.TOKEN
}

/** 读端点可选鉴权（B9）：设置了 READ_TOKEN 时匿名读关闭，个人兴趣画像不再对全网公开 */
function checkReadAuth(request: Request, env: Env): boolean {
  if (!env.READ_TOKEN) return true
  const token = (request.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '')
  return token === env.READ_TOKEN
}

interface ItemRow {
  id: string
  source_id: string
  source_name: string
  url: string
  title: string
  summary: string
  fingerprint: string
  published_at: string | null
  fetched_at: string
  stage: string
  score_total: number
  score_source: number
  score_novelty: number
  score_relevance: number
  score_utility: number
  score_reason: string
  ai_by: string
  tags: string
  ot_flag: string | null
}

function rowToLocalItem(r: ItemRow) {
  return {
    cloudId: r.id,
    sourceId: r.source_id,
    sourceName: r.source_name,
    url: r.url,
    title: r.title,
    summary: r.summary,
    fingerprint: r.fingerprint,
    publishedAt: r.published_at,
    fetchedAt: r.fetched_at,
    stage: r.stage === 'discarded' ? 'discarded' : 'scored', // 本地入库转 Curated 由本地侧决定
    score: {
      total: r.score_total,
      source: r.score_source,
      novelty: r.score_novelty,
      relevance: r.score_relevance,
      utility: r.score_utility,
    },
    scoreReason: r.score_reason,
    aiBy: r.ai_by,
    tags: JSON.parse(r.tags || '[]') as string[],
    otFlag: r.ot_flag,
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)
    const path = url.pathname

    if (request.method === 'OPTIONS') return new Response(null, { headers: CORS })

    // ── 健康检查：开放、无数据（部署向导与启动器探测用） ──
    if (path === '/api/health') return json({ ok: true, time: new Date().toISOString() })

    // ── 写操作：必须鉴权 ──
    if (path === '/api/fetch' && request.method === 'POST') {
      if (!checkAuth(request, env)) return json({ error: 'unauthorized' }, 401)
      const summary = await runPipeline(env, aiConfigFrom(env))
      return json(summary)
    }

    if (path === '/api/sources' && request.method === 'POST') {
      if (!checkAuth(request, env)) return json({ error: 'unauthorized' }, 401)
      const body = (await request.json().catch(() => null)) as { sources?: unknown } | null
      const list = (Array.isArray(body?.sources) ? (body!.sources as Record<string, unknown>[]) : []).slice(0, 100) // B11：条数上限，防 Token 泄漏后写入配额被刷爆
      let imported = 0
      let skipped = 0
      for (const s of list) {
        const name = typeof s.name === 'string' ? s.name : ''
        const src = typeof s.url === 'string' ? s.url : ''
        if (!name || !src) {
          skipped++
          continue
        }
        const tier = Number(s.tier) || 2
        // B11：weight 夹在 0-5（负数与超大值会扭曲评分加权）
        const rawWeight = typeof s.weight === 'number' ? s.weight : tier === 1 ? 1.0 : tier === 1.5 ? 0.7 : 0.4
        const weight = Math.min(5, Math.max(0, rawWeight))
        await env.DB.prepare(
          `INSERT INTO sources (id, name, url, domain, tier, weight, active, fail_streak, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, 1, 0, ?, ?)
           ON CONFLICT(url) DO UPDATE SET name = excluded.name, domain = excluded.domain, tier = excluded.tier, weight = excluded.weight, updated_at = excluded.updated_at`,
        )
          .bind(`src_${crypto.randomUUID().slice(0, 13)}`, name, src, String(s.domain ?? 'other'), tier, weight, new Date().toISOString(), new Date().toISOString())
          .run()
        imported++
      }
      return json({ imported, skipped })
    }

    // ── 外部数据推送（输入第三通道的机器入口）：业务数据默认敏感，读写都鉴权（复用 TOKEN） ──
    if (path === '/api/ingest' && (request.method === 'POST' || request.method === 'GET')) {
      if (!checkAuth(request, env)) return json({ error: 'unauthorized' }, 401)
      if (!ingestEnsured) {
        await env.DB.prepare(
          'CREATE TABLE IF NOT EXISTS ingest_blocks (id TEXT PRIMARY KEY, source TEXT NOT NULL DEFAULT \'api\', title TEXT NOT NULL, content TEXT NOT NULL, created_at TEXT NOT NULL)',
        ).run()
        await env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_ingest_created ON ingest_blocks(created_at)').run()
        await env.DB.prepare('CREATE TABLE IF NOT EXISTS ingest_rate (minute TEXT PRIMARY KEY, n INTEGER NOT NULL)').run()
        ingestEnsured = true
      }
      if (request.method === 'POST') {
        // 分钟级限流（D1 计数，AIHOT 做法）：Token 泄漏时把写入敞口压到有界
        const minute = minuteKey()
        const row = await env.DB.prepare(
          'INSERT INTO ingest_rate (minute, n) VALUES (?, 1) ON CONFLICT(minute) DO UPDATE SET n = n + 1 RETURNING n',
        )
          .bind(minute)
          .first<{ n: number }>()
        const minuteCount = row?.n ?? 1
        if (minuteCount > INGEST_MAX_PER_MINUTE) {
          return json({ error: `rate limited：每分钟最多 ${INGEST_MAX_PER_MINUTE} 次推送，请稍后重试` }, 429)
        }
        const body = (await request.json().catch(() => null)) as unknown
        const { blocks, skipped, truncated } = normalizeIngest(body)
        const ids: string[] = []
        for (const b of blocks) {
          const id = `ing_${crypto.randomUUID().slice(0, 13)}`
          await env.DB.prepare('INSERT INTO ingest_blocks (id, source, title, content, created_at) VALUES (?, ?, ?, ?, ?)')
            .bind(id, b.source, b.title, b.content, new Date().toISOString())
            .run()
          ids.push(id)
        }
        return json({ accepted: ids.length, ids, skipped, truncated, minuteCount })
      }
      const since = url.searchParams.get('since') ?? ''
      const { results } = await env.DB.prepare(
        'SELECT id, source, title, content, created_at FROM ingest_blocks WHERE created_at > ? ORDER BY created_at LIMIT 200',
      )
        .bind(since)
        .all()
      return json({ blocks: results })
    }

    // ── 读操作：默认开放；设置了 READ_TOKEN 则需鉴权（B9） ──
    if (path === '/api/items' && request.method === 'GET') {
      if (!checkReadAuth(request, env)) return json({ error: 'unauthorized（已启用读鉴权 READ_TOKEN）' }, 401)
      const since = url.searchParams.get('since') ?? ''
      const minScore = Number(url.searchParams.get('minScore') ?? 0)
      const ot = url.searchParams.get('ot')
      let sql = "SELECT * FROM items WHERE stage = 'scored' AND score_total >= ?"
      const binds: (string | number)[] = [minScore]
      if (since) {
        sql += ' AND fetched_at > ?'
        binds.push(since)
      }
      if (ot) {
        sql += ' AND ot_flag = ?'
        binds.push(ot)
      }
      sql += ' ORDER BY fetched_at DESC LIMIT 500'
      const { results } = await env.DB.prepare(sql).bind(...binds).all<ItemRow>()
      return json({ serverTime: new Date().toISOString(), items: results.map(rowToLocalItem) })
    }

    if (path === '/api/digest' && request.method === 'GET') {
      if (!checkReadAuth(request, env)) return json({ error: 'unauthorized（已启用读鉴权 READ_TOKEN）' }, 401)
      const n = Math.min(50, Number(url.searchParams.get('n') ?? 10))
      const { results } = await env.DB.prepare(
        "SELECT * FROM items WHERE stage = 'scored' ORDER BY score_total DESC, fetched_at DESC LIMIT ?",
      )
        .bind(n)
        .all<ItemRow>()
      return json({ items: results.map(rowToLocalItem) })
    }

    if (path === '/api/sources' && request.method === 'GET') {
      if (!checkReadAuth(request, env)) return json({ error: 'unauthorized（已启用读鉴权 READ_TOKEN）' }, 401)
      const { results } = await env.DB.prepare('SELECT * FROM sources WHERE active = 1 ORDER BY tier').all()
      return json({ sources: results })
    }

    if (path === '/rss/daily.xml' && request.method === 'GET') {
      if (!checkReadAuth(request, env)) return json({ error: 'unauthorized（已启用读鉴权 READ_TOKEN）' }, 401)
      const { results } = await env.DB.prepare(
        "SELECT title, url, summary, score_total FROM items WHERE stage = 'scored' ORDER BY score_total DESC, fetched_at DESC LIMIT 10",
      )
        .all<{ title: string; url: string; summary: string; score_total: number }>()
      const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      const xml = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<rss version="2.0"><channel>',
        `<title>PWORK 每日精选</title><link>${esc(url.origin)}</link><description>评分 Top 10</description>`,
        ...results.map(
          (r) =>
            `<item><title>${esc(r.title)}（评分 ${r.score_total}）</title><link>${esc(r.url)}</link><description>${esc(r.summary)}</description></item>`,
        ),
        '</channel></rss>',
      ].join('\n')
      return new Response(xml, { headers: { 'content-type': 'application/xml; charset=utf-8', ...CORS } })
    }

    // ── LLM 代理：本地工具（内容工厂工作台等）经此调用 AI——真实 Key 只存服务端 secret，浏览器侧不落 Key。
    // 鉴权用独立的 LLM_TOKEN（与采集写入的 TOKEN 分开）：口令泄露只损失调用量，换口令即止血，不暴露 AI Key 本体。 ──
    if (path === '/api/llm/chat/completions' && request.method === 'POST') {
      const auth = (request.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '')
      if (!env.LLM_TOKEN || auth !== env.LLM_TOKEN) return json({ error: 'unauthorized（需 Bearer LLM_TOKEN）' }, 401)
      if (!env.AI_API_KEY) return json({ error: 'AI_API_KEY 未配置（npx wrangler secret put AI_API_KEY）' }, 503)
      let body: { model?: string; messages?: unknown[]; temperature?: number }
      try {
        body = await request.json()
      } catch {
        return json({ error: 'invalid json' }, 400)
      }
      if (!Array.isArray(body.messages) || body.messages.length === 0) return json({ error: 'messages required' }, 400)
      // B7：条数与输出上限——口令泄漏时损失有界，不再能拿最贵模型刷无上限调用
      if (body.messages.length > 40) return json({ error: 'messages 最多 40 条' }, 400)
      const allowedModels = [env.AI_MODEL_CHEAP, env.AI_MODEL].filter((m): m is string => Boolean(m))
      const model = allowedModels.length === 0 ? 'deepseek-chat' : allowedModels[0]!
      if (allowedModels.length > 0 && body.model && !allowedModels.includes(body.model)) {
        return json({ error: `model 只允许：${allowedModels.join(' / ')}` }, 400)
      }
      const upstreamUrl = env.AI_BASE_URL.replace(/\/+$/, '') + '/chat/completions'
      assertPublicHttpUrl(upstreamUrl) // AI_BASE_URL 误配置指向内网时拒绝外联
      const upstream = await guardedFetch(upstreamUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: 'Bearer ' + env.AI_API_KEY },
        body: JSON.stringify({
          model,
          messages: body.messages,
          temperature: body.temperature ?? 0.7,
          max_tokens: 2000,
        }),
      }, 60_000)
      return new Response(upstream.body, { status: upstream.status, headers: { 'content-type': 'application/json; charset=utf-8', ...CORS } })
    }

    if (path === '/') {
      return json({
        name: 'pwork-collect',
        docs: {
          openReads: ['GET /api/items', 'GET /api/digest', 'GET /api/sources', 'GET /rss/daily.xml', 'GET /api/health'],
          authedWrites: ['POST /api/fetch 手动触发抓取', 'POST /api/sources 推送信源', 'POST /api/ingest 外部数据推送（限流）', 'GET /api/ingest 拉取推送数据', 'POST /api/llm/chat/completions LLM 代理（LLM_TOKEN）'],
        },
      })
    }

    return json({ error: 'not found' }, 404)
  },

  // Cron：定时抓取（时间见 wrangler.toml triggers）
  async scheduled(_event: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(
      runPipeline(env, aiConfigFrom(env)).then((s) => {
        console.log(`[cron] new=${s.totalNew} ok=${s.results.filter((r) => r.ok).length}/${s.results.length}`)
      }),
    )
  },
} satisfies ExportedHandler<Env>
