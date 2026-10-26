/**
 * PWORK 本地网关：API Key 的安全存放点（零依赖，Node 18+）
 *
 * 架构：浏览器 → 本地网关(127.0.0.1) → 上游 LLM API
 * Key 只存 app/.env.local（已被 .gitignore 忽略），浏览器端永远接触不到。
 * 同时彻底规避浏览器直连的 CORS 限制。
 *
 * 用法：
 *   1. 复制 app/tools/.env.example 为 app/.env.local，填写 PWORK_LLM_API_KEY
 *   2. app 目录运行 npm run gateway（默认端口 8788）
 *   3. 应用「设置 → AI · BYOK」选择「本地网关」模式
 *
 * 安全边界：
 *   - 仅绑定 127.0.0.1，局域网不可访问
 *   - CORS 仅放行 localhost / 127.0.0.1 来源
 *   - 响应、控制台日志永不回显 Key；/health 只返回布尔状态
 */
import http from 'node:http'
import { appendFileSync, existsSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

function loadEnv() {
  const vars = {}
  for (const f of ['.env.local', '.env']) {
    const p = resolve(process.cwd(), f)
    if (!existsSync(p)) continue
    for (const line of readFileSync(p, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)\s*$/)
      if (m && vars[m[1]] === undefined) vars[m[1]] = m[2].replace(/^["']|["']$/g, '')
    }
  }
  return { ...vars, ...process.env }
}

const env = loadEnv()
const PORT = Number(env.PWORK_GATEWAY_PORT || 8788)
const USAGE_LOG = resolve(process.cwd(), 'gateway-usage.log')
// 以下均为 let：POST /key 写入新配置后热更新（applyEnv），无需重启网关进程
let CHAT_URL = env.PWORK_LLM_BASE_URL || 'https://api.deepseek.com/v1/chat/completions'
let CHAT_KEY = env.PWORK_LLM_API_KEY || ''
// 模型固定（2026-10-19）：设了就以网关为准替换请求体里的 model——上游/模型是运维侧的事，
// 浏览器里存的旧模型名（如换了厂商后的 glm-*）不该让用户手改。不设则原样透传。
let CHAT_MODEL = env.PWORK_LLM_MODEL || ''
// 联网搜索（2026-10-19 起支持 DeepSeek 自研 Search API，默认跟随 LLM 上游——同一把 Key 的世界）：
// 上游是 DeepSeek → POST /v1/tools/search {query,count}；是智谱 → tools 端点 web-search-pro。
// 显式 PWORK_SEARCH_API_KEY/BASE_URL 优先；计费 DeepSeek ¥0.005/次（仅成功非空计费）/智谱 ¥0.03/次。
let SEARCH_URL = env.PWORK_SEARCH_BASE_URL || defaultSearchUrl(CHAT_URL)
let SEARCH_MODEL = env.PWORK_SEARCH_MODEL || 'web-search-pro'
let SEARCH_KEY = env.PWORK_SEARCH_API_KEY || CHAT_KEY

function defaultSearchUrl(chatUrl) {
  return chatUrl.includes('bigmodel')
    ? 'https://open.bigmodel.cn/api/paas/v4/tools'
    : 'https://api.deepseek.com/v1/tools/search'
}

/** 配置热更新：/key 写盘后重算全部派生变量（与启动时同一套取值逻辑） */
function applyEnv() {
  const fresh = loadEnv()
  CHAT_URL = fresh.PWORK_LLM_BASE_URL || 'https://api.deepseek.com/v1/chat/completions'
  CHAT_KEY = fresh.PWORK_LLM_API_KEY || ''
  CHAT_MODEL = fresh.PWORK_LLM_MODEL || ''
  SEARCH_URL = fresh.PWORK_SEARCH_BASE_URL || defaultSearchUrl(CHAT_URL)
  SEARCH_MODEL = fresh.PWORK_SEARCH_MODEL || 'web-search-pro'
  SEARCH_KEY = fresh.PWORK_SEARCH_API_KEY || CHAT_KEY
}

/** 合并写入 .env.local：同名键整组重写（先删旧行再追加新值），其它行与注释保留 */
function mergeEnvFile(path, sets) {
  const keys = Object.keys(sets)
  const lines = (existsSync(path) ? readFileSync(path, 'utf8') : '').split(/\r?\n/)
  const kept = lines.filter((l) => l.trim() === '' || l.trim().startsWith('#') || !keys.some((k) => l.trimStart().startsWith(`${k}=`)))
  const out = kept.filter((l) => l.trim() !== '')
  for (const [k, v] of Object.entries(sets)) if (v) out.push(`${k}=${v}`)
  writeFileSync(path, `${out.join('\n')}\n`)
}

const json = (res, status, obj) => {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify(obj))
}

/** 请求体统一读取：上限 1MB，超限回 413（安全审计 2026-10-26：本机恶意页面耗内存面） */
const MAX_BODY = 1_048_576
function readBody(req, res, onEnd) {
  let body = ''
  let overflow = false
  req.on('data', (c) => {
    if (overflow) return
    body += c
    if (body.length > MAX_BODY) overflow = true
  })
  req.on('end', () => {
    if (overflow) {
      json(res, 413, { error: 'request body too large' })
      return
    }
    onEnd(body)
  })
}

/** 归一上游地址：允许填基础地址、带 /v1、或完整端点 */
function normalizeUpstream(url) {
  const u = String(url || '').trim().replace(/\/+$/, '')
  if (/\/chat\/completions$/.test(u)) return u
  if (/\/v\d+[a-z]*$/i.test(u)) return `${u}/chat/completions`
  return `${u}/v1/chat/completions`
}

const server = http.createServer(async (req, res) => {
  const origin = req.headers.origin || ''
  // 准入三道闸（安全审计 2026-10-26）：Host 白名单防 DNS rebinding；带 Origin 的请求
  // 必须命中白名单（阻断恶意网页 text/plain 简单请求直接刷 Key）；不带 Origin 的
  // 本机客户端（curl 冒烟、脚本）照常放行。白名单含桌面 WebView 源 tauri.localhost。
  const host = String(req.headers.host || '').toLowerCase()
  const hostOk =
    host === `127.0.0.1:${PORT}` || host === `localhost:${PORT}` || host === `[::1]:${PORT}` ||
    host === '127.0.0.1' || host === 'localhost'
  const originOk = !origin || /^https?:\/\/(localhost|127\.0\.0\.1|tauri\.localhost|\[::1\])(:\d+)?$/i.test(origin)
  if (!hostOk || !originOk) {
    json(res, 403, { error: 'forbidden' })
    return
  }
  if (/^https?:\/\/(localhost|127\.0\.0\.1|tauri\.localhost|\[::1\])(:\d+)?$/i.test(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin)
    res.setHeader('Vary', 'Origin')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  }
  if (req.method === 'OPTIONS') {
    res.writeHead(204)
    res.end()
    return
  }

  const url = new URL(req.url, `http://127.0.0.1:${PORT}`)
  const path = url.pathname

  if (path === '/health') {
    json(res, 200, {
      ok: true,
      chatConfigured: Boolean(CHAT_KEY),
      searchConfigured: Boolean(SEARCH_KEY),
      model: CHAT_MODEL || null,
      upstream: CHAT_URL.replace(/\/chat\/completions$/, ''),
    })
    return
  }

  // 配置写入（2026-10-26 引导页/设置页直配 Key）：合并写 .env.local 并热更新内存——写完即可连接测试。
  // 暴露面与既有端点同级（本机回环来源限定，三道闸之后才到这里）；请求体里过的 Key 不落日志
  if (path === '/key' && req.method === 'POST') {
    readBody(req, res, async (body) => {
      try {
        const { key, baseUrl = '', model = '' } = JSON.parse(body || '{}')
        if (typeof key !== 'string' || !key.trim()) {
          json(res, 400, { ok: false, error: 'Key 不能为空' })
          return
        }
        if (/[\n\r\0]/.test(key) || /[\n\r\0]/.test(baseUrl) || /[\n\r\0]/.test(model)) {
          json(res, 400, { ok: false, error: 'Key/上游地址/模型名含换行等非法字符' })
          return
        }
        mergeEnvFile(resolve(process.cwd(), '.env.local'), {
          PWORK_LLM_API_KEY: key.trim(),
          PWORK_LLM_BASE_URL: String(baseUrl).trim(),
          PWORK_LLM_MODEL: String(model).trim(),
        })
        applyEnv()
        json(res, 200, { ok: true })
      } catch (e) {
        json(res, 500, { ok: false, error: `配置写入失败：${e instanceof Error ? e.message : String(e)}` })
      }
    })
    return
  }

  // 联网搜索代理：{ query, count } → 智谱 tools API → 归一化 { ok, results:[{title,link,content}] }
  if (path === '/search' && req.method === 'POST') {
    if (!SEARCH_KEY) {
      json(res, 503, { ok: false, error: '网关未配置搜索 Key——在 gateway.env/.env.local 写 PWORK_SEARCH_API_KEY（不写则复用 PWORK_LLM_API_KEY）' })
      return
    }
    readBody(req, res, async (body) => {
      try {
        const { query, count } = JSON.parse(body || '{}')
        if (!query || typeof query !== 'string') {
          json(res, 400, { ok: false, error: '缺少 query' })
          return
        }
        const isDeepSeek = SEARCH_URL.includes('deepseek')
        // DeepSeek Search API：POST /v1/tools/search {query,count} → results[].{title,url,summary}
        // 智谱 tools：{model,messages} → choices[].message.tool_calls[].search_result
        const upstream = await fetch(SEARCH_URL, {
          method: 'POST',
          headers: { 'content-type': 'application/json', authorization: `Bearer ${SEARCH_KEY}` },
          body: isDeepSeek
            ? JSON.stringify({ query: query.slice(0, 128), count: Math.min(Math.max(count || 6, 1), 50) })
            : JSON.stringify({ model: SEARCH_MODEL, messages: [{ role: 'user', content: query }], stream: false }),
        })
        const text = await upstream.text()
        if (!upstream.ok) {
          const msg = JSON.parse(text)?.error?.message ?? text.slice(0, 200)
          json(res, 502, { ok: false, error: `搜索上游 ${upstream.status}：${msg}` })
          return
        }
        const data = JSON.parse(text)
        const raw = isDeepSeek
          ? (data.results ?? []).map((r) => ({ title: r.title ?? '', link: r.url ?? '', content: r.summary ?? r.snippet ?? '' }))
          : (data.choices?.[0]?.message?.tool_calls ?? [])
              .flatMap((tc) => tc.search_result ?? [])
              .map((r) => ({ title: String(r.title ?? ''), link: String(r.link ?? ''), content: String(r.content ?? '') }))
        const hits = raw.filter((r) => r.link)
        logUsage(JSON.stringify({ model: isDeepSeek ? 'deepseek-search' : SEARCH_MODEL }), text)
        json(res, 200, { ok: true, results: hits.slice(0, count || 6) })
      } catch (e) {
        json(res, 502, { ok: false, error: `搜索失败：${e instanceof Error ? e.message : String(e)}` })
      }
    })
    return
  }

  // D1 直连代理（2026-10-20）：api.cloudflare.com 不带 CORS 头，浏览器页面直连必被拦；
  // 云端同步/设备同步的 D1 查询经此转发。Token 随请求带来——不落盘、不进日志。
  if (path === '/d1/query' && req.method === 'POST') {
    readBody(req, res, async (body) => {
      try {
        const { accountId, databaseId, token, sql, params } = JSON.parse(body || '{}')
        const okAccount = /^[0-9a-f]{32}$/i.test(accountId ?? '')
        const okDb = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(databaseId ?? '')
        if (!okAccount || !okDb || typeof token !== 'string' || !token || typeof sql !== 'string' || !sql) {
          json(res, 400, { ok: false, error: '账户 ID / 数据库 ID / Token / SQL 缺失或格式不对' })
          return
        }
        const upstream = await fetch(
          `https://api.cloudflare.com/client/v4/accounts/${accountId}/d1/database/${databaseId}/query`,
          {
            method: 'POST',
            headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
            body: JSON.stringify({ sql, params: Array.isArray(params) ? params : [] }),
          },
        )
        const text = await upstream.text()
        // Cloudflare 响应（{success, result, errors}）原样透传，前端按既有结构解析
        res.writeHead(upstream.status, { 'Content-Type': 'application/json; charset=utf-8' })
        res.end(text)
      } catch (e) {
        json(res, 502, { ok: false, error: `D1 代理失败：${e instanceof Error ? e.message : String(e)}` })
      }
    })
    return
  }

  if (path.endsWith('/chat/completions') && req.method === 'POST') {
    if (!CHAT_KEY) {
      json(res, 503, { error: '网关未配置 PWORK_LLM_API_KEY——请在 app/.env.local 填写后重启网关' })
      return
    }
    readBody(req, res, async (body) => {
      try {
        // 提取并剥离 purpose（前端场景标记，只用于记账，不转发上游）；模型固定时替换 model
        let purpose = null
        let parsed = null
        try {
          parsed = JSON.parse(body)
          if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
            purpose = typeof parsed.purpose === 'string' ? parsed.purpose : null
            delete parsed.purpose
          }
        } catch {
          /* 非 JSON 原样透传，上游会拒 */
        }
        const outBody = parsed
          ? JSON.stringify(CHAT_MODEL ? { ...parsed, model: CHAT_MODEL } : parsed)
          : body
        const upstream = await fetch(normalizeUpstream(CHAT_URL), {
          method: 'POST',
          headers: { 'content-type': 'application/json', authorization: `Bearer ${CHAT_KEY}` },
          body: outBody,
        })
        const text = await upstream.text()
        logUsage(outBody, text, purpose)
        res.writeHead(upstream.status, { 'Content-Type': 'application/json; charset=utf-8' })
        res.end(text)
      } catch (e) {
        json(res, 502, { error: `上游请求失败：${e instanceof Error ? e.message : String(e)}` })
      }
    })
    return
  }

  // 用量查询（本机来源限定，同 health）：BYOK 的成本可见性——先看见，再谈限
  if (path === '/usage' && req.method === 'GET') {
    json(res, 200, usageSummary())
    return
  }

  json(res, 404, { error: 'not found' })
})

/** 记账：请求体里的 model + 场景标记 + 响应里的 usage 落一行 JSONL；滚动上限 2MB（保留最近约 5000 条） */
function logUsage(reqBody, respText, purpose = null) {
  try {
    const model = JSON.parse(reqBody)?.model ?? 'unknown'
    const usage = JSON.parse(respText)?.usage
    if (!usage) return
    const line =
      JSON.stringify({
        t: new Date().toISOString(),
        model,
        purpose: purpose ?? '',
        tokens: usage.total_tokens ?? 0,
        prompt: usage.prompt_tokens ?? 0,
        completion: usage.completion_tokens ?? 0,
      }) + '\n'
    appendFileSync(USAGE_LOG, line)
    if (statSync(USAGE_LOG).size > 2_000_000) {
      const lines = readFileSync(USAGE_LOG, 'utf-8').split('\n').filter(Boolean)
      writeFileSync(USAGE_LOG, lines.slice(-5000).map((l) => l + '\n').join(''))
    }
  } catch {
    /* 记账失败不影响代理 */
  }
}

/** 汇总：总次数/总 tokens、按模型与按场景分布、覆盖时间窗 */
function usageSummary() {
  try {
    if (!existsSync(USAGE_LOG)) return { calls: 0, tokens: 0, byModel: {}, byPurpose: {}, since: null, until: null }
    const rows = readFileSync(USAGE_LOG, 'utf-8')
      .split('\n')
      .filter(Boolean)
      .map((l) => JSON.parse(l))
      .filter((r) => Date.now() - new Date(r.t).getTime() < 30 * 86400_000) // 近 30 天
    const byModel = {}
    const byPurpose = {}
    for (const r of rows) {
      byModel[r.model] = (byModel[r.model] ?? 0) + (r.tokens ?? 0)
      const p = r.purpose || '未标记'
      byPurpose[p] = (byPurpose[p] ?? 0) + (r.tokens ?? 0)
    }
    return {
      calls: rows.length,
      tokens: rows.reduce((s, r) => s + (r.tokens ?? 0), 0),
      byModel,
      byPurpose,
      since: rows[0]?.t ?? null,
      until: rows.at(-1)?.t ?? null,
    }
  } catch {
    return { calls: 0, tokens: 0, byModel: {}, since: null, until: null, error: '用量文件读取失败' }
  }
}

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[PWORK 网关] http://127.0.0.1:${PORT}/v1 ｜ 上游：${normalizeUpstream(CHAT_URL)} ｜ Key：${CHAT_KEY ? '已配置' : '未配置（/health 可用，对话返回 503）'} ｜ 搜索：${SEARCH_KEY ? `${SEARCH_MODEL} 已配置` : '未配置（/search 返回 503）'}`)
})
