/**
 * 条目指纹：规范化 URL + 归一化标题 → 哈希（去重主键，04 §3.2）。
 * 纯函数；规则宁可漏杀不可误杀（fingerprint 不同但同事件 → C2 eventGroup 兜底）。
 */

/** URL 规范化：去跟踪参数、统一协议/大小写/尾斜杠 */
export function normalizeUrl(raw: string): string {
  let url = raw.trim()
  try {
    const u = new URL(url)
    // 去跟踪参数（utm_* / from / ref / spm 等）
    const drop: string[] = []
    u.searchParams.forEach((_v, k) => {
      if (/^(utm_|spm|from|ref|source|share_|tt_)/i.test(k)) drop.push(k)
    })
    drop.forEach((k) => u.searchParams.delete(k))
    u.protocol = 'https:'
    u.hostname = u.hostname.toLowerCase()
    if (u.pathname.length > 1 && u.pathname.endsWith('/')) {
      u.pathname = u.pathname.slice(0, -1)
    }
    url = u.toString()
  } catch {
    // 非 URL（如 data: 或异常输入）：退化为去空白原样
    url = url.replace(/\s+/g, '')
  }
  return url
}

/** 标题归一化：去空白/标点/大小写（中文保留，全半角统一） */
export function normalizeTitle(title: string): string {
  return title
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\s\u3000]+/g, '')
    .replace(/[\p{P}\p{S}]+/gu, '')
    .slice(0, 80)
}

/** FNV-1a 32 位哈希（无需 crypto 依赖，碰撞率对本场景足够） */
function hash(s: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0).toString(36)
}

/** 条目指纹：规范化 URL 与归一化标题分别哈希后拼接（URL 为主，标题防同 URL 换文） */
export function fingerprintOf(url: string, title: string): string {
  return `${hash(normalizeUrl(url))}_${hash(normalizeTitle(title))}`
}
