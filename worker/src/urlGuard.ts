/**
 * 服务端外联守卫（2026-09-29，AIHOT SSRF 防线的轻量版）：
 * 所有由本 Worker 发起的出站请求统一走 guardedFetch——仅允许 http/https，
 * 且拒绝环回/内网/链路本地/保留地址（误配置或被注入时把爆炸半径压到公网）。
 * 2026-10-26 安全审计 B6 加固：数字/十六进制 IPv4 变体、IPv4 映射 IPv6、尾点主机名
 * 全部归一化后再判；重定向手动跟随、逐跳过守卫。
 */

/** 十进制/十六进制段按 inet_aton 语义求值（"2130706433"、"0x7f000001"、"0x7f.1" 一类） */
function parseIpv4Like(host: string): [number, number, number, number] | null {
  const parts = host.split('.')
  if (parts.length === 0 || parts.length > 4) return null
  const segs: number[] = []
  for (const p of parts) {
    let v: number
    if (/^0[xX][0-9a-fA-F]+$/.test(p)) v = parseInt(p, 16)
    else if (/^0[0-7]+$/.test(p)) v = parseInt(p, 8)
    else if (/^\d+$/.test(p)) v = parseInt(p, 10)
    else return null
    if (!Number.isFinite(v) || v < 0 || v > 0xffffffff) return null
    segs.push(v)
  }
  // inet_aton：末段承担剩余全部位（a、a.b、a.b.c、a.b.c.d 四种宽度）
  let packed: number
  if (segs.length === 4) packed = ((segs[0]! << 24) | (segs[1]! << 16) | (segs[2]! << 8) | segs[3]!) >>> 0
  else if (segs.length === 3) packed = ((segs[0]! << 24) | (segs[1]! << 16) | segs[2]!) >>> 0
  else if (segs.length === 2) packed = ((segs[0]! << 24) | segs[1]!) >>> 0
  else packed = segs[0]! >>> 0
  return [(packed >>> 24) & 255, (packed >>> 16) & 255, (packed >>> 8) & 255, packed & 255]
}

function isPrivateIpv4(a: number, b: number): boolean {
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) || // CGNAT
    (a === 169 && b === 254) || // 链路本地/云 metadata
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    a >= 224 // 组播/保留/广播段
  )
}

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
  // 尾点去掉（"localhost." 多数解析器仍解析为环回）
  const h = u.hostname.toLowerCase().replace(/\.$/, '')
  if (h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local') || h.endsWith('.internal')) {
    throw new Error(`拒绝内网主机名：${h}`)
  }
  // 点分十进制（含十/十六/八进制变体）
  if (/^(\d+|0x[0-9a-fA-F]+)(\.(?:\d+|0x[0-9a-fA-F]+))*$/.test(h)) {
    const ipv4 = parseIpv4Like(h)
    if (ipv4 && isPrivateIpv4(ipv4[0]!, ipv4[1]!)) throw new Error(`拒绝内网/保留地址：${h}`)
    if (ipv4) return
  }
  if (h.includes(':')) {
    // IPv6 字面量（new URL 的 hostname 保留方括号）
    const v6 = h.replace(/^\[/, '').replace(/\]$/, '').toLowerCase()
    if (v6 === '::1' || v6 === '::' || /^f[cd]/.test(v6) || /^fe[89ab]/.test(v6)) {
      throw new Error(`拒绝内网/保留地址：${v6}`)
    }
    // IPv4 映射 IPv6：::ffff:127.0.0.1 / ::ffff:7f00:1 / NAT64 64:ff9b::/96
    for (const marker of ['::ffff:', '64:ff9b::']) {
      const idx = v6.indexOf(marker)
      if (idx >= 0) {
        const tail = v6.slice(idx + marker.length)
        const dot = tail.split('.').length === 4 ? parseIpv4Like(tail) : null
        if (dot) {
          if (isPrivateIpv4(dot[0]!, dot[1]!)) throw new Error(`拒绝内网/保留地址：${v6}`)
          continue
        }
        // 纯十六进制两段（::ffff:7f00:1 → 127.0.0.1）
        const hex = tail.replace(/:/g, '')
        if (/^[0-9a-f]{1,8}$/.test(hex)) {
          const packed = parseInt(hex, 16)
          if (isPrivateIpv4((packed >>> 24) & 255, (packed >>> 16) & 255)) throw new Error(`拒绝内网/保留地址：${v6}`)
        }
      }
    }
  }
}

/** 统一出站入口：先过 URL 守卫，再带超时 fetch（GET 默认绕 CF 缓存）。
 *  重定向手动逐跳跟随（每跳重新过守卫，最多 5 跳）——默认的 follow 模式跳转目标不再受检（B6）。 */
export async function guardedFetch(url: string, init: RequestInit | undefined, timeoutMs: number): Promise<Response> {
  assertPublicHttpUrl(url)
  let currentUrl = url
  let currentInit: RequestInit | undefined = init
  for (let hop = 0; hop <= 5; hop++) {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), timeoutMs)
    let resp: Response
    try {
      resp = await fetch(currentUrl, { ...currentInit, redirect: 'manual', signal: ctrl.signal, ...(currentInit ? {} : { cf: { cacheTtl: 0 } }) })
    } finally {
      clearTimeout(timer)
    }
    if (resp.status >= 300 && resp.status < 400) {
      const loc = resp.headers.get('location')
      if (!loc) return resp
      currentUrl = new URL(loc, currentUrl).toString()
      assertPublicHttpUrl(currentUrl)
      // 301/302/303 的 POST 降级为 GET（浏览器同款语义），body 不再携带
      if (currentInit?.method === 'POST' && (resp.status === 301 || resp.status === 302 || resp.status === 303)) {
        currentInit = { headers: currentInit.headers }
      }
      continue
    }
    return resp
  }
  throw new Error(`重定向超过 5 跳：${url.slice(0, 60)}`)
}
