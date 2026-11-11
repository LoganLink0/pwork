/**
 * PWORK MCP 薄壳（阶段二 2.1 批）：stdio JSON-RPC（MCP 协议 2024-11-05，官方规范查证：
 * 消息换行分隔、stdout 只发 MCP 消息、错误分协议错误与工具执行错误两路）。
 * 工具集 = 本地网关 /api/v1/library/* 的只增子集（速记追加 / 待办创建）——
 * 写入经 PWORK 桌面版内嵌网关（127.0.0.1:8788）校验令牌后由应用落库。
 *
 * 令牌来源（按序取第一个非空）：环境变量 PWORK_LIBRARY_TOKEN → 桌面版 gateway.env 同名键。
 * 用法：MCP 客户端配置 command=node，args=[本文件绝对路径]。
 * 运行要求：Node 18+（原生 fetch）。
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createInterface } from 'node:readline'

const GATEWAY = (process.env.PWORK_GATEWAY_URL || 'http://127.0.0.1:8788').replace(/\/+$/, '')
const PROTOCOL_VERSION = '2024-11-05'
const SERVER_INFO = { name: 'pwork-mcp', version: '0.1.0' }

/** 令牌：环境变量优先，未设则读桌面版 gateway.env 同名键（同机信任，不落第二份配置） */
function loadToken() {
  const env = (process.env.PWORK_LIBRARY_TOKEN ?? '').trim()
  if (env) return env
  const base = process.env.APPDATA || join(process.env.USERPROFILE ?? '', 'AppData', 'Roaming')
  try {
    const line = readFileSync(join(base, 'com.pwork.workbench', 'gateway.env'), 'utf8')
      .split('\n')
      .find((l) => l.startsWith('PWORK_LIBRARY_TOKEN='))
    return line ? line.slice('PWORK_LIBRARY_TOKEN='.length).trim() : ''
  } catch {
    return ''
  }
}

const TOOLS = [
  {
    name: 'pwork_add_note',
    description:
      '向用户的 PWORK 工作台追加一条速记（本机写入，只增不删）。body 必填；title 缺省取正文首行；tags 可选（最多 10 个，每个不超过 16 字）。',
    inputSchema: {
      type: 'object',
      properties: {
        body: { type: 'string', description: '速记正文（最多 2 万字符）' },
        title: { type: 'string', description: '标题（可选，缺省取正文首行，最多 60 字）' },
        tags: { type: 'array', items: { type: 'string' }, description: '标签（可选）' },
      },
      required: ['body'],
    },
  },
  {
    name: 'pwork_add_task',
    description:
      '在用户的 PWORK 工作台创建一条待办（本机写入，只增不删）。title 必填；due 为 YYYY-MM-DD；recurrenceDays 为循环间隔天数（1=每天 7=每周 14=两周 30=每月 90=每季）。',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: '待办标题（最多 120 字）' },
        due: { type: 'string', description: '期限 YYYY-MM-DD（可选）' },
        recurrenceDays: { type: 'number', description: '重复间隔天数（可选：1/7/14/30/90）' },
      },
      required: ['title'],
    },
  },
]

async function callGateway(path, payload, token) {
  let resp
  try {
    resp = await fetch(`${GATEWAY}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(payload),
    })
  } catch {
    return { isError: true, text: 'PWORK 未运行或网关不可达（127.0.0.1:8788 无响应）——启动 PWORK 桌面版后再试' }
  }
  let data = null
  try {
    data = await resp.json()
  } catch {
    // 非 JSON 响应走下方统一报错
  }
  if (resp.status === 401) {
    return { isError: true, text: '接入令牌不匹配——在 PWORK 设置 → 外部接入 复制最新令牌（或设 PWORK_LIBRARY_TOKEN 环境变量）' }
  }
  if (resp.status === 429) {
    return { isError: true, text: '写入太频繁（每分钟上限 30 次），稍后再试' }
  }
  if (!resp.ok || !data?.ok) {
    return { isError: true, text: `写入失败：${data?.error ?? `HTTP ${resp.status}`}` }
  }
  return { isError: false, text: path.endsWith('/notes') ? '已写入 PWORK 速记' : '已写入 PWORK 待办' }
}

async function callTool(name, args, token) {
  if (name === 'pwork_add_note') {
    const payload = { body: String(args?.body ?? '') }
    if (args?.title != null) payload.title = String(args.title)
    if (Array.isArray(args?.tags)) payload.tags = args.tags.map(String)
    return callGateway('/api/v1/library/notes', payload, token)
  }
  const payload = { title: String(args?.title ?? '') }
  if (typeof args?.due === 'string' && args.due) payload.due = args.due
  if (typeof args?.recurrenceDays === 'number') payload.recurrenceDays = args.recurrenceDays
  return callGateway('/api/v1/library/tasks', payload, token)
}

async function respond(msg) {
  const { id, method, params } = msg
  if (method === 'initialize') {
    // 版本协商：客户端请求的版本不支持时，回我们支持的最新稳定版（规范约定）
    const requested = params?.protocolVersion
    return {
      jsonrpc: '2.0',
      id,
      result: {
        protocolVersion: requested === PROTOCOL_VERSION ? requested : PROTOCOL_VERSION,
        capabilities: { tools: { listChanged: false } },
        serverInfo: SERVER_INFO,
      },
    }
  }
  if (method === 'tools/list') {
    return { jsonrpc: '2.0', id, result: { tools: TOOLS } }
  }
  if (method === 'tools/call') {
    const name = params?.name
    if (!TOOLS.some((t) => t.name === name)) {
      return { jsonrpc: '2.0', id, error: { code: -32602, message: `Unknown tool: ${name}` } }
    }
    const token = loadToken()
    if (!token) {
      return {
        jsonrpc: '2.0',
        id,
        result: {
          content: [{ type: 'text', text: '未找到接入令牌——启动 PWORK 桌面版（令牌自动生成），或设 PWORK_LIBRARY_TOKEN 环境变量' }],
          isError: true,
        },
      }
    }
    const r = await callTool(name, params?.arguments ?? {}, token)
    return { jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: r.text }], isError: r.isError } }
  }
  return { jsonrpc: '2.0', id, error: { code: -32601, message: `Method not found: ${method}` } }
}

function write(obj) {
  process.stdout.write(`${JSON.stringify(obj)}\n`)
}

const rl = createInterface({ input: process.stdin, terminal: false })
rl.on('line', (line) => {
  const trimmed = line.trim()
  if (!trimmed) return
  let msg
  try {
    msg = JSON.parse(trimmed)
  } catch {
    return
  }
  if (msg.jsonrpc !== '2.0' || typeof msg.method !== 'string') return
  // 通知（无 id）无需应答；notifications/initialized 之后无动作
  if (msg.id === undefined || msg.id === null) return
  respond(msg).then(write).catch((e) => {
    write({ jsonrpc: '2.0', id: msg.id, error: { code: -32603, message: `内部错误：${e instanceof Error ? e.message : String(e)}` } })
  })
})
