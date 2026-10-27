/**
 * 导航与页面元信息（PRD §3.1 / §3.2）。
 * 模块前缀即模块边界：/input /process /output /review；工作区与设置为壳级路由。
 */

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

export const WORKSPACE_NAV: { to: string; icon: string; label: string; end?: boolean; mark: string }[] = [
  { to: '/', icon: 'today', label: '今日', end: true, mark: 'mark-workspace' },
  { to: '/tasks', icon: 'tasks', label: '待办', mark: 'mark-workspace' },
  { to: '/goals', icon: 'goals', label: '目标', mark: 'mark-workspace' },
  { to: '/cloud', icon: 'cloud', label: '云端同步', mark: 'mark-workspace' },
]

export const MODULE_NAV: NavModule[] = [
  {
    key: 'input',
    icon: 'inbox',
    label: '输入',
    status: 'active',
    mark: 'mark-input',
    children: [
      { to: '/input/notes', icon: 'pen', label: '速记', countFrom: 'notes' },
      { to: '/input/digest', icon: 'fileText', label: '信息日报' },
      { to: '/input/sources', icon: 'rss', label: '信源', countFrom: 'sources' },
      { to: '/input/items', icon: 'archive', label: '条目库' },
    ],
  },
  { key: 'process', icon: 'cpu', label: '处理', status: 'active', mark: 'mark-process', to: '/process' },
  { key: 'output', icon: 'upload', label: '输出', status: 'active', mark: 'mark-output', to: '/output' },
  {
    key: 'review',
    icon: 'repeat',
    label: '回路',
    status: 'built',
    mark: 'mark-review',
    children: [
      { to: '/review', icon: 'folder', label: '复盘档案' },
      { to: '/review/new', icon: 'plusCircle', label: '新建复盘' },
      { to: '/review/assets', icon: 'layers', label: '认知资产' },
      { to: '/review/analytics', icon: 'pieChart', label: '聚合分析' },
    ],
  },
]

/** 面包屑元信息：路由 → [标题, 路径文案, 模块标记类] */
export const PAGE_META: Record<string, [string, string, string]> = {
  '/': ['今日', '工作台 · 首页', 'mark-workspace'],
  '/tasks': ['待办', '工作区 · 任务库', 'mark-workspace'],
  '/goals': ['目标', '工作区 · 目标', 'mark-workspace'],
  '/cloud': ['云端同步', '工作区 · 云端同步', 'mark-workspace'],
  '/input/notes': ['速记', '输入 · 速记', 'mark-input'],
  '/input/notes/new': ['新速记', '输入 · 速记', 'mark-input'],
  '/input/digest': ['信息日报', '输入 · 信息采集', 'mark-input'],
  '/input/sources': ['信源', '输入 · 信息采集', 'mark-input'],
  '/input/items': ['条目库', '输入 · 信息采集', 'mark-input'],
  '/input/blocks': ['外部数据', '输出 · 周报数据源', 'mark-input'],
  '/cases': ['简历辅导（独立应用）', '处理 · 专题', 'mark-process'],
  '/process': ['处理', '模块 · 工具箱', 'mark-process'],
  '/process/t': ['工具', '模块 · 处理工具箱', 'mark-process'],
  '/output': ['输出', '模块 · 交付与成稿', 'mark-output'],
  '/output/report': ['周报导出为 HTML/PPT', '输出 · 成稿', 'mark-output'],
  '/output/read': ['周报导出为朗读音频', '输出 · 成稿', 'mark-output'],
  '/output/card': ['周报导出为数据卡片', '输出 · 分享', 'mark-output'],
  '/output/write': ['PPT 撰写', '输出 · 材料 → PPT', 'mark-output'],
  '/output/article': ['文章草稿', '输出 · 文章草稿', 'mark-output'],
  '/review': ['复盘档案', '回路 · 复盘工作台', 'mark-review'],
  '/review/new': ['新建复盘', '回路 · 复盘工作台', 'mark-review'],
  '/review/wizard': ['复盘向导', '回路 · 复盘工作台', 'mark-review'],
  '/review/meeting': ['复盘会', '回路 · 复盘工作台', 'mark-review'],
  '/review/archive': ['复盘详情', '回路 · 复盘工作台', 'mark-review'],
  '/review/assets': ['认知资产', '回路 · 复盘工作台', 'mark-review'],
  '/review/analytics': ['聚合分析', '回路 · 复盘工作台', 'mark-review'],
  '/review/help': ['帮助', '回路 · 复盘工作台', 'mark-review'],
  '/settings': ['设置', '工作台', 'mark-workspace'],
  '/help': ['帮助', '工作台', 'mark-workspace'],
  '/welcome': ['欢迎', '工作台 · 首访引导', 'mark-workspace'],
  '/design': ['设计系统', '工作台 · 组件样例', 'mark-workspace'],
}

/** 移动端底部导航（PRD §4.1：<768px 五项） */
export const BOTTOM_NAV = [
  { to: '/', icon: 'today', label: '今日', end: true },
  { to: '/input/notes', icon: 'inbox', label: '输入' },
  { to: '/tasks', icon: 'tasks', label: '待办' },
  { to: '/review', icon: 'repeat', label: '回路' },
  { to: '/settings', icon: 'more', label: '更多' },
]

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
