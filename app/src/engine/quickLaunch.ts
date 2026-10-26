/**
 * 快速启动清单（2026-10-13 用户拍板）：处理页「快速启动」卡 + 调研页提示词跳转共用。
 * 内置默认常用 AI 站点，用户可增删改与置顶；打开即记最近使用（排序 = 最近在前）。
 * 存 localStorage（书签级个人配置，不进备份——换机重配成本低，不为几个链接背备份复杂度）。
 */

export interface QuickSite {
  id: string
  name: string
  url: string
  /** 最近一次打开的时间戳（毫秒）；从未用过为 0。排序 = 最近在前，未用过的保持清单顺序 */
  lastUsedAt?: number
}

const KEY = 'pwork-quick-sites'

/** 内置默认（大陆可达优先；用户可自行增删） */
export const DEFAULT_QUICK_SITES: QuickSite[] = [
  { id: 'doubao', name: '豆包', url: 'https://www.doubao.com/chat/' },
  { id: 'deepseek', name: 'DeepSeek', url: 'https://chat.deepseek.com/' },
  { id: 'kimi', name: 'Kimi', url: 'https://kimi.moonshot.cn/chat' },
  { id: 'tongyi', name: '通义千问', url: 'https://www.tongyi.com/' },
  { id: 'chatglm', name: '智谱清言', url: 'https://chatglm.cn/' },
  { id: 'jimeng', name: '即梦', url: 'https://jimeng.jianying.com/' },
  { id: 'kling', name: '可灵', url: 'https://app.klingai.com/' },
]

function newId(): string {
  return `qs_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`
}

/** 网址归一：没写协议的补 https://；非法输入返回 null（本地 localhost 服务放行——LM Studio 这类） */
export function normalizeSiteUrl(input: string): string | null {
  let u = input.trim()
  if (!u) return null
  if (!/^https?:\/\//i.test(u)) u = `https://${u}`
  try {
    const parsed = new URL(u)
    const host = parsed.hostname.toLowerCase()
    const isLocal = host === 'localhost' || host === '127.0.0.1' || host === '[::1]'
    if (!isLocal && !host.includes('.')) return null
    return parsed.href
  } catch {
    return null
  }
}

function validEntries(raw: unknown): QuickSite[] {
  if (!Array.isArray(raw)) return []
  return raw.filter((s): s is QuickSite => {
    const site = s as QuickSite
    // 读取层兜底（安全审计 2026-10-26 A-4）：只拒绝显式非 http(s) 协议（脚本协议地址），
    // 防 localStorage 被污染后进 window.open；无协议的地址原样放行（归一发生在编辑层）
    const u = site?.url
    const colon = typeof u === 'string' ? u.indexOf(':') : -1
    if (typeof u === 'string' && colon > 0) {
      const scheme = u.slice(0, colon).toLowerCase()
      if (scheme !== 'http' && scheme !== 'https') return false
    }
    return (
      typeof site?.id === 'string' && typeof site?.name === 'string' && !!site.name.trim() && typeof u === 'string'
    )
  })
}

export function loadQuickSites(): QuickSite[] {
  try {
    const v = localStorage.getItem(KEY)
    if (!v) return [...DEFAULT_QUICK_SITES]
    const sites = validEntries(JSON.parse(v))
    return sites.length > 0 ? sites : [...DEFAULT_QUICK_SITES]
  } catch {
    return [...DEFAULT_QUICK_SITES]
  }
}

export function saveQuickSites(sites: QuickSite[]): void {
  localStorage.setItem(KEY, JSON.stringify(sites))
}

/** 新建站点条目（id 自动生成） */
export function makeSite(name: string, url: string): QuickSite {
  return { id: newId(), name: name.trim(), url }
}

/** 排序：最近使用在前（未用过的按清单原顺序）——稳定排序保证不跳变 */
export function byRecentUse(sites: QuickSite[]): QuickSite[] {
  return sites
    .map((s, i) => ({ s, i }))
    .sort((a, b) => (b.s.lastUsedAt ?? 0) - (a.s.lastUsedAt ?? 0) || a.i - b.i)
    .map((x) => x.s)
}

/** 记一次使用（调研页等外部入口共用排序时调用；持久化到 localStorage） */
export function markQuickSiteUsed(id: string): void {
  const sites = loadQuickSites()
  const hit = sites.find((s) => s.id === id)
  if (!hit) return
  saveQuickSites(sites.map((s) => (s.id === id ? { ...s, lastUsedAt: Date.now() } : s)))
}
