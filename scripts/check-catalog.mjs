/**
 * 推荐信源目录活性验证（0.4-6 内容插件层）：CI 定时与 PR 触发跑。
 * 逐源请求（15 秒超时），判定标准与入库纪律一致——HTTP 200 且响应体是 feed
 * （<rss / <feed / <rdf / JSON feed 特征）。结果写 GitHub Step Summary；
 * 退出码恒 0（feed 时好时坏，验证是哨兵，硬卡 PR 会误伤贡献者）。
 * 用法：node scripts/check-catalog.mjs [源文件路径，默认 app/src/content/source-catalog.json]
 */
import { readFileSync } from 'node:fs'

const file = process.argv[2] ?? 'app/src/content/source-catalog.json'
const catalog = JSON.parse(readFileSync(file, 'utf-8'))

const sources = (catalog.domains ?? []).flatMap((g) => (g.sources ?? []).map((s) => ({ ...s, domain: g.domain })))
const recommended = new Set(catalog.recommended ?? [])

// 结构自检：recommended 必须都能在目录里找到（名称引用的完整性）
const byName = new Set(sources.map((s) => s.name))
const dangling = [...recommended].filter((n) => !byName.has(n))
if (dangling.length > 0) {
  console.error(`recommended 里引用了不存在的源名：${dangling.join('、')}`)
  process.exit(1)
}

const FEED_RE = /<rss|<feed[\s>]|<rdf|<rdf:RDF|"version":\s*"https:\/\/jsonfeed\.org"/i
const results = []

async function probe(s) {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 15_000)
  const started = Date.now()
  try {
    const resp = await fetch(s.url, {
      signal: ctrl.signal,
      redirect: 'follow',
      headers: { 'user-agent': 'Mozilla/5.0 (compatible; pwork-catalog-check/1.0)' },
    })
    const body = (await resp.text()).slice(0, 4096)
    const ok = resp.status === 200 && FEED_RE.test(body)
    return { name: s.name, domain: s.domain, url: s.url, ok, detail: ok ? `${Date.now() - started}ms` : `HTTP ${resp.status}${FEED_RE.test(body) ? '（响应体是 feed 但状态码异常）' : '（响应体不是 feed）'}` }
  } catch (e) {
    return { name: s.name, domain: s.domain, url: s.url, ok: false, detail: e.name === 'AbortError' ? '超时（15s）' : String(e).slice(0, 80) }
  } finally {
    clearTimeout(timer)
  }
}

// 并发 5，避免触发站点限流
const queue = [...sources]
while (queue.length > 0) {
  const batch = queue.splice(0, 5)
  results.push(...(await Promise.all(batch.map(probe))))
}

const bad = results.filter((r) => !r.ok)
const star = (s) => (recommended.has(s.name) ? ' ⭐' : '')
console.log(`推荐信源目录活性验证：${results.length - bad.length}/${results.length} 正常`)
for (const r of results) console.log(`${r.ok ? '✓' : '✗'} [${r.domain}] ${r.name}${star(r)} — ${r.detail}`)

// GitHub Step Summary（本地跑没有该环境变量，跳过）
if (process.env.GITHUB_STEP_SUMMARY) {
  const lines = [
    `## 推荐信源目录活性验证`,
    '',
    `**${results.length - bad.length}/${results.length} 正常**（⭐ = 首页快捷导入包成员）`,
    '',
    '| 状态 | 领域 | 源 | 说明 |',
    '|---|---|---|---|',
    ...results.map((r) => `| ${r.ok ? '✅' : '❌'} | ${r.domain} | ${r.name}${star(r)} | ${r.detail} |`),
  ]
  require('node:fs').appendFileSync(process.env.GITHUB_STEP_SUMMARY, lines.join('\n'))
}

if (bad.length > 0) {
  console.warn(`\n${bad.length} 个源异常——建议核对后修订 source-catalog.json（换地址/降级/移除）`)
}
