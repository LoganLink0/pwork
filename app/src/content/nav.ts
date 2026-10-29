/**
 * 导航与页面元信息（PRD §3.1 / §3.2；0.4-5 起全部从页面注册表派生）。
 * 数据源 = ../registry.tsx（单点登记）；本文件只做派生，导出签名与手写时代一致，
 * Sidebar / BottomNav / Topbar / 命令面板等消费方零改动。
 * 模块前缀即模块边界：/input /process /output /review；工作区与设置为壳级路由。
 */
import { PAGE_REGISTRY } from '../registry'

export interface NavChild {
  to: string
  icon: string
  label: string
  /** 侧边栏计数来源 */
  countFrom?: 'notes' | 'sources'
}

export interface NavModule {
  key: 'input' | 'process' | 'output' | 'review'
  icon: string
  label: string
  status: 'active' | 'planned' | 'built'
  /** 模块标记类名（shell.css：.mark-input 等） */
  mark: string
  to?: string
  children?: NavChild[]
}

export const WORKSPACE_NAV: { to: string; icon: string; label: string; end?: boolean; mark: string }[] =
  PAGE_REGISTRY
    .filter((p) => p.nav === 'workspace')
    .map((p) => ({ to: p.path, icon: p.mark === 'mark-workspace' ? workspaceIcon(p.path) : 'today', label: p.label, end: p.end, mark: p.mark }))

function workspaceIcon(path: string): string {
  const icons: Record<string, string> = { '/': 'today', '/tasks': 'tasks', '/goals': 'goals' }
  return icons[path] ?? 'today'
}

/** 模块骨架（壳级结构数据）：children 从注册表派生 */
const MODULE_SKELETON: NavModule[] = [
  { key: 'input', icon: 'inbox', label: '输入', status: 'active', mark: 'mark-input' },
  { key: 'process', icon: 'cpu', label: '处理', status: 'active', mark: 'mark-process', to: '/process' },
  { key: 'output', icon: 'upload', label: '输出', status: 'active', mark: 'mark-output', to: '/output' },
  { key: 'review', icon: 'repeat', label: '回路', status: 'built', mark: 'mark-review' },
]

/** 图标表（注册表只存数据，图标语义留在派生层） */
const CHILD_ICONS: Record<string, string> = {
  '/input/notes': 'pen',
  '/input/digest': 'fileText',
  '/input/sources': 'rss',
  '/input/items': 'archive',
  '/review': 'folder',
  '/review/new': 'plusCircle',
  '/review/assets': 'layers',
  '/review/analytics': 'pieChart',
}

function childIcon(path: string): string {
  return CHILD_ICONS[path] ?? 'fileText'
}

export const MODULE_NAV: NavModule[] = MODULE_SKELETON.map((m) => {
  if (m.to) return m // 单链接模块（处理/输出）无 children
  const key = `module:${m.key}` as const
  const kids: NavChild[] = []
  for (const p of PAGE_REGISTRY) {
    if (p.nav !== key || !p.sidebar) continue
    kids.push({ to: p.path, icon: childIcon(p.path), label: p.label, countFrom: p.countFrom })
    for (const c of p.children ?? []) {
      if (c.sidebarNav && !c.index) {
        kids.push({ to: `${p.path}/${c.path}`, icon: childIcon(`${p.path}/${c.path}`), label: c.label ?? '' })
      }
    }
  }
  return { ...m, children: kids }
})

/** 面包屑元信息：路由 → [标题, 路径文案, 模块标记类]（键 = metaPath ?? path） */
export const PAGE_META: Record<string, [string, string, string]> = Object.fromEntries(
  PAGE_REGISTRY.map((p) => [p.metaPath ?? p.path, [...p.meta, p.mark] as [string, string, string]]),
)

/** 移动端底部导航（PRD §4.1：<768px 五项；图标/文案与页面注册不同构，保留静态表） */
export const BOTTOM_NAV = [
  { to: '/', icon: 'today', label: '今日', end: true },
  { to: '/input/notes', icon: 'inbox', label: '输入' },
  { to: '/tasks', icon: 'tasks', label: '待办' },
  { to: '/review', icon: 'repeat', label: '回路' },
  { to: '/settings', icon: 'more', label: '更多' },
]

/** 命令面板的页面组：注册表中导航可见（nav!=='none'）的全部页面；
 *  模块子项 sub 显示所属模块名（「速记 输入」——面板里的归属线索），palette 条目用自己的说明 */
const MODULE_LABEL: Record<string, string> = {
  'module:input': '输入',
  'module:process': '处理',
  'module:output': '输出',
  'module:review': '回路',
}

export const PALETTE_PAGES: { to: string; icon: string; label: string; sub: string }[] = PAGE_REGISTRY.filter(
  (p) => p.nav !== 'none',
).map((p) => ({
  to: p.path,
  icon: p.nav === 'workspace' ? workspaceIcon(p.path) : childIcon(p.path),
  label: p.label,
  sub: p.paletteSub ?? MODULE_LABEL[p.nav] ?? '页面',
}))

/** 面包屑：精确匹配优先，否则按前缀最长匹配（覆盖 /input/notes/:id 等详情路由） */
export function crumbFor(pathname: string): [string, string, string] {
  if (PAGE_META[pathname]) return PAGE_META[pathname]
  const hit = Object.keys(PAGE_META)
    .filter((p) => p !== '/' && pathname.startsWith(p))
    .sort((a, b) => b.length - a.length)[0]
  if (hit) {
    const [title, trail, mark] = PAGE_META[hit]
    return [title, `${trail} · 详情`, mark]
  }
  return PAGE_META['/']
}
