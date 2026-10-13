/**
 * 联网搜索客户端（2026-10-13"替我调研"升级）：
 * 浏览器 → 本地网关 /search → 智谱 tools API（web-search-pro）。
 * 搜索 Key 只存网关侧（gateway.env/.env.local），浏览器不接触——与 LLM 同一 BYOK 纪律。
 * 网关未配置搜索 Key 时 /search 返回 503，调用方据此降级（不显示联网按钮）。
 */

export interface WebSearchHit {
  title: string
  link: string
  content: string
}

function base(gatewayUrl: string): string {
  return gatewayUrl.replace(/\/+$/, '')
}

/** 走网关搜一次；上游错误（含余额不足 1113 类）以 Error 抛给调用方明示 */
export async function gatewayWebSearch(gatewayUrl: string, query: string, count = 6): Promise<WebSearchHit[]> {
  const r = await fetch(`${base(gatewayUrl)}/search`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ query, count }),
    signal: AbortSignal.timeout(30000),
  })
  const j = (await r.json().catch(() => ({}))) as { ok?: boolean; results?: WebSearchHit[]; error?: string }
  if (!r.ok || !j.ok) throw new Error(j.error ?? `搜索网关 HTTP ${r.status}`)
  return j.results ?? []
}

/** 网关是否配置了搜索（/health.searchConfigured）；探测失败按未配置降级 */
export async function gatewaySearchConfigured(gatewayUrl: string): Promise<boolean> {
  try {
    const r = await fetch(`${base(gatewayUrl)}/health`, { signal: AbortSignal.timeout(3000) })
    const j = (await r.json()) as { searchConfigured?: boolean }
    return Boolean(j.searchConfigured)
  } catch {
    return false
  }
}
