/**
 * 服务端外联守卫（2026-09-29，AIHOT SSRF 防线的轻量版）：
 * 所有由本 Worker 发起的出站请求统一走 guardedFetch——仅允许 http/https，
 * 且拒绝环回/内网/链路本地/保留地址（误配置或被注入时把爆炸半径压到公网）。
 */

export function assertPublicHttpUrl(raw: string): void {
  let u: URL
  try {
    u = new URL(raw)
  } catch {
    throw new Error(`非法 URL：${raw.slice(0, 60)}`)
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') {
    throw new Error(`仅允许 http/https 协议：${u.protocol}`)
  }
  const h = u.hostname.toLowerCase()
  if (h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local') || h.endsWith('.internal')) {
    throw new Error(`拒绝内网主机名：${h}`)
  }
  const ipv4 = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)
  if (ipv4) {
    const a = Number(ipv4[1])
    const b = Number(ipv4[2])
    const isPrivate =
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) || // CGNAT
      (a === 169 && b === 254) || // 链路本地/云 metadata
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      a >= 224 // 组播/保留/广播段
    if (isPrivate) throw new Error(`拒绝内网/保留地址：${h}`)
    return
  }
  if (h.includes(':')) {
    // IPv6 字面量（new URL 的 hostname 保留方括号）
    const v6 = h.replace(/^\[/, '').replace(/\]$/, '').toLowerCase()
    if (v6 === '::1' || v6 === '::' || /^f[cd]/.test(v6) || /^fe[89ab]/.test(v6)) {
      throw new Error(`拒绝内网/保留地址：${v6}`)
    }
  }
}

/** 统一出站入口：先过 URL 守卫，再带超时 fetch（GET 默认绕 CF 缓存） */
export async function guardedFetch(url: string, init: RequestInit | undefined, timeoutMs: number): Promise<Response> {
  assertPublicHttpUrl(url)
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    return await fetch(url, { ...init, signal: ctrl.signal, ...(init ? {} : { cf: { cacheTtl: 0 } }) })
  } finally {
    clearTimeout(timer)
  }
}
