/**
 * 工具轮盘的格位数据（桌面版 Ctrl+Alt+Q 呼出；网页版走 Ctrl+K 面板）。
 * 格位可自定义：设置 → 工具轮盘 编辑，存 localStorage。
 */
export interface WheelSlot {
  id: string
  label: string
  icon: string
  /** route=打开页面；quick=速记浮层；fetch=立即抓取并进日报；url=打开网址 */
  kind: 'route' | 'quick' | 'fetch' | 'url'
  /** route 的页面路径 / url 的地址；quick 与 fetch 无目标 */
  target?: string
}

export const DEFAULT_WHEEL_SLOTS: WheelSlot[] = [
  { id: 'quick', label: '速记', icon: 'zap', kind: 'quick' },
  { id: 'fetch', label: '立即抓取', icon: 'rss', kind: 'fetch' },
  { id: 'review', label: '新建复盘', icon: 'repeat', kind: 'route', target: '/review/new' },
  { id: 'digest', label: '信息日报', icon: 'fileText', kind: 'route', target: '/input/digest' },
  { id: 'process', label: '工具箱', icon: 'grid', kind: 'route', target: '/process' },
  { id: 'help', label: '帮助', icon: 'helpCircle', kind: 'route', target: '/help' },
]

const KEY = 'pwork-wheel-slots'
const KINDS: WheelSlot['kind'][] = ['route', 'quick', 'fetch', 'url']
const ICONS = ['zap', 'rss', 'repeat', 'fileText', 'grid', 'helpCircle', 'globe', 'search', 'pen', 'video', 'headphones', 'image', 'ai', 'cloud', 'barChart', 'pieChart']

export function wheelIcons(): string[] {
  return ICONS
}

/** 读取防御：坏数据回默认；排序上限 8 格（轮盘一圈的可读上限） */
export function loadWheelSlots(): WheelSlot[] {
  try {
    const v = localStorage.getItem(KEY)
    if (!v) return [...DEFAULT_WHEEL_SLOTS]
    const parsed = JSON.parse(v) as WheelSlot[]
    if (!Array.isArray(parsed) || parsed.length === 0) return [...DEFAULT_WHEEL_SLOTS]
    const ok = parsed
      .filter((s) => s && typeof s.label === 'string' && KINDS.includes(s.kind))
      .slice(0, 8)
      .map((s) => ({ ...s, id: s.id || `slot_${Math.random().toString(36).slice(2, 8)}` }))
    return ok.length ? ok : [...DEFAULT_WHEEL_SLOTS]
  } catch {
    return [...DEFAULT_WHEEL_SLOTS]
  }
}

export function saveWheelSlots(slots: WheelSlot[]): void {
  localStorage.setItem(KEY, JSON.stringify(slots))
}
