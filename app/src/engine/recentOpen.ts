import { WORKSPACE_NAV, MODULE_NAV } from '../content/nav'

/**
 * 最近打开（WorkBuddy 学习批，2026-11-06）：路由变化时记录页面访问，
 * 同路径去重置顶，上限 6 条，侧栏「最近打开」分组消费。
 * 存 localStorage（轻量导航状态，与主题/键位同层）。
 * 消费用 useSyncExternalStore：写入即派事件，快照走模块级缓存（引用稳定）。
 */
export interface RecentItem {
  path: string
  label: string
  ts: number
}

const STORE_KEY = 'pwork-recent'
const MAX_ITEMS = 6
const EVENT = 'pwork-recent-changed'

/** path → 页面名：从导航表构建（工作区 + 模块子页） */
const LABELS: Map<string, string> = (() => {
  const m = new Map<string, string>()
  for (const it of WORKSPACE_NAV) m.set(it.to, it.label)
  for (const mod of MODULE_NAV) {
    if (mod.children) for (const c of mod.children) m.set(c.to, c.label)
    else if (mod.to) m.set(mod.to, mod.label)
  }
  return m
})()

/** 不计入最近打开的路径：引导页是独占流程；根路径（今日）是侧栏第一项常驻 */
const SKIP = new Set(['/welcome', '/'])

let cache: RecentItem[] | null = null

function readStore(): RecentItem[] {
  try {
    const v = localStorage.getItem(STORE_KEY)
    return v ? (JSON.parse(v) as RecentItem[]) : []
  } catch {
    return []
  }
}

/** 快照（引用稳定：读过的缓存住，写入时更新） */
export function loadRecent(): RecentItem[] {
  if (cache === null) cache = readStore()
  return cache
}

function write(items: RecentItem[]): void {
  cache = items
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(items))
  } catch {
    // 存储异常静默跳过
  }
  window.dispatchEvent(new Event(EVENT))
}

export function subscribeRecent(cb: () => void): () => void {
  window.addEventListener(EVENT, cb)
  return () => window.removeEventListener(EVENT, cb)
}

export function recordRecent(path: string, now = Date.now()): RecentItem[] {
  if (SKIP.has(path)) return loadRecent()
  const label = LABELS.get(path)
  if (!label) return loadRecent()
  const rest = loadRecent().filter((it) => it.path !== path)
  write([{ path, label, ts: now }, ...rest].slice(0, MAX_ITEMS))
  return loadRecent()
}
