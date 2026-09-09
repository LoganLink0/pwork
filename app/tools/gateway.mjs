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
import { existsSync, readFileSync } from 'node:fs'
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
        res.writeHead(upstream.status, { 'Content-Type': 'application/json; charset=utf-8' })
        res.end(await upstream.text())
      } catch (e) {
        json(res, 502, { error: `上游请求失败：${e instanceof Error ? e.message : String(e)}` })
      }
    })
    return
  }

  json(res, 404, { error: 'not found' })
})

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[PWORK 网关] http://127.0.0.1:${PORT}/v1 ｜ 上游：${normalizeUpstream(CHAT_URL)} ｜ Key：${CHAT_KEY ? '已配置' : '未配置（/health 可用，对话返回 503）'}`)
})
