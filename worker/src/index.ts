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
  const header = request.headers.get('authorization') ?? ''
  const url = new URL(request.url)
  const queryToken = url.searchParams.get('token') ?? ''
  const token = header.replace(/^Bearer\s+/i, '') || queryToken
  return token === env.TOKEN
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

    // ── 写操作：必须鉴权 ──
    if (path === '/api/fetch' && request.method === 'POST') {
      if (!checkAuth(request, env)) return json({ error: 'unauthorized' }, 401)
      const summary = await runPipeline(env, aiConfigFrom(env))
      return json(summary)
    }

    if (path === '/api/sources' && request.method === 'POST') {
      if (!checkAuth(request, env)) return json({ error: 'unauthorized' }, 401)
      const body = (await request.json().catch(() => null)) as { sources?: unknown } | null
      const list = Array.isArray(body?.sources) ? (body!.sources as Record<string, unknown>[]) : []
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
        const weight = typeof s.weight === 'number' ? s.weight : tier === 1 ? 1.0 : tier === 1.5 ? 0.7 : 0.4
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
        ingestEnsured = true
      }
      if (request.method === 'POST') {
        const body = (await request.json().catch(() => null)) as { blocks?: unknown; title?: unknown; content?: unknown; source?: unknown } | null
        const raw: Record<string, unknown>[] = Array.isArray(body?.blocks)
          ? (body!.blocks as Record<string, unknown>[])
          : body && typeof body === 'object' && body.title !== undefined
            ? [body]
            : []
        const ids: string[] = []
        let skipped = 0
        for (const b of raw) {
          const title = typeof b.title === 'string' ? b.title.trim().slice(0, 40) : ''
          const content = typeof b.content === 'string' ? b.content.trim().slice(0, 20000) : ''
          if (!title || !content) {
            skipped++
            continue
          }
          const id = `ing_${crypto.randomUUID().slice(0, 13)}`
          await env.DB.prepare('INSERT INTO ingest_blocks (id, source, title, content, created_at) VALUES (?, ?, ?, ?, ?)')
            .bind(id, String(b.source ?? 'api').slice(0, 40), title, content, new Date().toISOString())
            .run()
          ids.push(id)
        }
        return json({ accepted: ids.length, ids, skipped })
      }
      const since = url.searchParams.get('since') ?? ''
      const { results } = await env.DB.prepare(
        'SELECT id, source, title, content, created_at FROM ingest_blocks WHERE created_at > ? ORDER BY created_at LIMIT 200',
      )
        .bind(since)
        .all()
      return json({ blocks: results })
    }

    // ── 读操作：开放 ──
    if (path === '/api/items' && request.method === 'GET') {
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
      const n = Math.min(50, Number(url.searchParams.get('n') ?? 10))
      const { results } = await env.DB.prepare(
        "SELECT * FROM items WHERE stage = 'scored' ORDER BY score_total DESC, fetched_at DESC LIMIT ?",
      )
        .bind(n)
        .all<ItemRow>()
      return json({ items: results.map(rowToLocalItem) })
    }

    if (path === '/api/sources' && request.method === 'GET') {
      const { results } = await env.DB.prepare('SELECT * FROM sources WHERE active = 1 ORDER BY tier').all()
      return json({ sources: results })
    }

    if (path === '/rss/daily.xml' && request.method === 'GET') {
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
      const upstream = await fetch(env.AI_BASE_URL.replace(/\/+$/, '') + '/chat/completions', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: 'Bearer ' + env.AI_API_KEY },
        body: JSON.stringify({
          model: body.model || env.AI_MODEL_CHEAP || 'deepseek-chat',
          messages: body.messages,
          temperature: body.temperature ?? 0.7,
        }),
      })
      return new Response(upstream.body, { status: upstream.status, headers: { 'content-type': 'application/json; charset=utf-8', ...CORS } })
    }

    if (path === '/') {
      return json({
        name: 'pwork-collect',
        endpoints: ['/api/items?since=&minScore=&ot=', '/api/digest?n=', '/api/sources', '/api/fetch (POST, auth)', '/api/ingest (POST 推送 / GET 拉取, auth)', '/api/llm/chat/completions (POST, LLM_TOKEN auth)', '/rss/daily.xml'],
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
