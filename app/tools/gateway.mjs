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
const CHAT_URL = env.PWORK_LLM_BASE_URL || 'https://api.deepseek.com/v1/chat/completions'
const CHAT_KEY = env.PWORK_LLM_API_KEY || ''
const USAGE_LOG = resolve(process.cwd(), 'gateway-usage.log')

const json = (res, status, obj) => {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify(obj))
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
  if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin)) {
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
    json(res, 200, { ok: true, chatConfigured: Boolean(CHAT_KEY), upstream: CHAT_URL.replace(/\/chat\/completions$/, '') })
    return
  }

  if (path.endsWith('/chat/completions') && req.method === 'POST') {
    if (!CHAT_KEY) {
      json(res, 503, { error: '网关未配置 PWORK_LLM_API_KEY——请在 app/.env.local 填写后重启网关' })
      return
    }
    let body = ''
    req.on('data', (c) => (body += c))
    req.on('end', async () => {
      try {
        const upstream = await fetch(normalizeUpstream(CHAT_URL), {
          method: 'POST',
          headers: { 'content-type': 'application/json', authorization: `Bearer ${CHAT_KEY}` },
          body,
        })
        const text = await upstream.text()
        logUsage(body, text)
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

/** 记账：请求体里的 model + 响应里的 usage 落一行 JSONL；滚动上限 2MB（保留最近约 5000 条） */
function logUsage(reqBody, respText) {
  try {
    const model = JSON.parse(reqBody)?.model ?? 'unknown'
    const usage = JSON.parse(respText)?.usage
    if (!usage) return
    const line =
      JSON.stringify({
        t: new Date().toISOString(),
        model,
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

/** 汇总：总次数/总 tokens、按模型分布、覆盖时间窗 */
function usageSummary() {
  try {
    if (!existsSync(USAGE_LOG)) return { calls: 0, tokens: 0, byModel: {}, since: null, until: null }
    const rows = readFileSync(USAGE_LOG, 'utf-8')
      .split('\n')
      .filter(Boolean)
      .map((l) => JSON.parse(l))
      .filter((r) => Date.now() - new Date(r.t).getTime() < 30 * 86400_000) // 近 30 天
    const byModel = {}
    for (const r of rows) byModel[r.model] = (byModel[r.model] ?? 0) + (r.tokens ?? 0)
    return {
      calls: rows.length,
      tokens: rows.reduce((s, r) => s + (r.tokens ?? 0), 0),
      byModel,
      since: rows[0]?.t ?? null,
      until: rows.at(-1)?.t ?? null,
    }
  } catch {
    return { calls: 0, tokens: 0, byModel: {}, since: null, until: null, error: '用量文件读取失败' }
  }
}

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[PWORK 网关] http://127.0.0.1:${PORT}/v1 ｜ 上游：${normalizeUpstream(CHAT_URL)} ｜ Key：${CHAT_KEY ? '已配置' : '未配置（/health 可用，对话返回 503）'}`)
})
