/**
 * 页面注册表（0.4-5 模块注册表，2026-10-29）：每个页面在此登记一次，
 * 路由（App Routes）、侧栏导航（WORKSPACE_NAV / MODULE_NAV children）、
 * 面包屑（PAGE_META）、命令面板页面项全部从这里派生——新增页面改这一处，
 * 四个入口自动获得。契约测试（contracts.test.ts）断言本表完备性。
 *
 * 归属（nav）决定出现在哪些入口：
 * - workspace：侧栏工作区段；module:<key>：模块子项（sidebar=true 才进 MODULE_NAV children）
 * - palette：只在命令面板的页面组出现（侧栏无位次，如外部数据/设置/帮助）
 * - none：不进任何导航（详情路由、重定向、内部页）
 * 嵌套布局页（速记 /review）的子路由带 label+sidebarNav 时，同样进 MODULE_NAV children。
 */
import type { ReactNode } from 'react'
import { Outlet } from 'react-router-dom'

export interface LazyModule {
  default: React.ComponentType
}
export type PageLoader = () => Promise<LazyModule>

export interface ChildRoute {
  path: string
  index?: boolean
  loader?: PageLoader
  /** 子路由进 MODULE_NAV children 时必填 */
  label?: string
  icon?: string
  sidebarNav?: boolean
}

export type NavSlot =
  | 'workspace'
  | 'module:input'
  | 'module:process'
  | 'module:output'
  | 'module:review'
  | 'palette'
  | 'none'

export interface PageReg {
  path: string
  /** 懒加载组件（redirect 页不需要；带 children 的布局页可用 layoutElement 代替） */
  loader?: PageLoader
  /** 嵌套布局的父 element（如回路的 review-root 容器）；有 children 且无 loader 时必填 */
  layoutElement?: ReactNode
  /** 重定向目标（设置即渲染 <Navigate replace>） */
  redirect?: string
  /** 嵌套子路由（父级为布局页，自身必有 loader） */
  children?: ChildRoute[]
  label: string
  mark: string
  /** PAGE_META 条目 [标题, 路径文案]；键 = metaPath ?? path */
  meta: [string, string]
  /** PAGE_META 键与路由 path 不同构时显式给出（详情路由写父路径） */
  metaPath?: string
  nav: NavSlot
  /** module 子项是否进侧栏 MODULE_NAV children（面板按 nav!=='none' 恒可见） */
  sidebar?: boolean
  end?: boolean
  countFrom?: 'notes' | 'sources'
  /** 命令面板 sub 文案（默认「页面」） */
  paletteSub?: string
}

export const PAGE_REGISTRY: PageReg[] = [
  { path: '/', label: '今日', mark: 'mark-workspace', meta: ['今日', '工作台 · 首页'], nav: 'workspace', end: true,
    loader: () => import('./pages/Home').then((m) => ({ default: m.Home })) },
  { path: '/tasks', label: '待办', mark: 'mark-workspace', meta: ['待办', '工作区 · 任务库'], nav: 'workspace',
    loader: () => import('./pages/Tasks').then((m) => ({ default: m.Tasks })) },
  { path: '/goals', label: '目标', mark: 'mark-workspace', meta: ['目标', '工作区 · 目标'], nav: 'workspace',
    loader: () => import('./pages/Goals').then((m) => ({ default: m.Goals })) },

  { path: '/input/notes', label: '速记', mark: 'mark-input', meta: ['速记', '输入 · 速记'], nav: 'module:input', sidebar: true, countFrom: 'notes',
    loader: () => import('./pages/Notes').then((m) => ({ default: m.Notes })),
    children: [
      { path: '', index: true, loader: () => import('./pages/Notes').then((m) => ({ default: m.NotesEmptyPane })) },
      { path: ':id', loader: () => import('./pages/NoteEditor').then((m) => ({ default: m.NoteEditor })) },
    ] },
  { path: '/input/digest', label: '信息日报', mark: 'mark-input', meta: ['信息日报', '输入 · 信息采集'], nav: 'module:input', sidebar: true,
    loader: () => import('./pages/Digest').then((m) => ({ default: m.Digest })) },
  { path: '/input/sources', label: '信源', mark: 'mark-input', meta: ['信源', '输入 · 信息采集'], nav: 'module:input', sidebar: true, countFrom: 'sources',
    loader: () => import('./pages/Sources').then((m) => ({ default: m.Sources })) },
  { path: '/input/items', label: '条目库', mark: 'mark-input', meta: ['条目库', '输入 · 信息采集'], nav: 'module:input', sidebar: true,
    loader: () => import('./pages/Items').then((m) => ({ default: m.Items })) },
  { path: '/input/blocks', label: '外部数据', mark: 'mark-input', meta: ['外部数据', '输出 · 周报数据源'], nav: 'palette', paletteSub: '周报数据源',
    loader: () => import('./pages/InputBlocks').then((m) => ({ default: m.InputBlocks })) },
  { path: '/cases', label: '简历辅导（独立应用）', mark: 'mark-process', meta: ['简历辅导（独立应用）', '处理 · 专题'], nav: 'palette', paletteSub: '独立应用入口',
    loader: () => import('./pages/CasesPage').then((m) => ({ default: m.CasesPage })) },

  { path: '/process', label: '处理', mark: 'mark-process', meta: ['处理', '模块 · 工具箱'], nav: 'module:process', sidebar: true,
    loader: () => import('./pages/Process').then((m) => ({ default: m.Process })) },
  { path: '/process/t/:toolId', label: '工具', mark: 'mark-process', meta: ['工具', '模块 · 处理工具箱'], nav: 'none', metaPath: '/process/t',
    loader: () => import('./pages/ProcessToolPage').then((m) => ({ default: m.ProcessToolPage })) },

  { path: '/output', label: '输出', mark: 'mark-output', meta: ['输出', '模块 · 交付与成稿'], nav: 'module:output', sidebar: true,
    loader: () => import('./pages/Output').then((m) => ({ default: m.Output })) },
  { path: '/output/report', label: '周报导出', mark: 'mark-output', meta: ['周报导出为 HTML/PPT', '输出 · 成稿'], nav: 'none',
    loader: () => import('./pages/ReportGenerator').then((m) => ({ default: m.ReportGenerator })) },
  { path: '/output/read', label: '朗读音频', mark: 'mark-output', meta: ['周报导出为朗读音频', '输出 · 成稿'], nav: 'none',
    loader: () => import('./pages/ReadOutLoud').then((m) => ({ default: m.ReadOutLoud })) },
  { path: '/output/card', label: '数据卡片', mark: 'mark-output', meta: ['周报导出为数据卡片', '输出 · 分享'], nav: 'none',
    loader: () => import('./pages/DataCard').then((m) => ({ default: m.DataCard })) },
  { path: '/output/ppt', label: 'PPT（旧入口）', mark: 'mark-output', meta: ['周报导出为 HTML/PPT', '输出 · 成稿'], nav: 'none', redirect: '/output/report' },
  { path: '/output/write', label: 'PPT 撰写', mark: 'mark-output', meta: ['PPT 撰写', '输出 · 材料 → PPT'], nav: 'none',
    loader: () => import('./pages/PptWriter').then((m) => ({ default: m.PptWriter })) },
  { path: '/output/article', label: '文章草稿', mark: 'mark-output', meta: ['文章草稿', '输出 · 文章草稿'], nav: 'none',
    loader: () => import('./pages/ArticleDraftPage').then((m) => ({ default: m.ArticleDraftPage })) },
  { path: '/output/research', label: '调研分析', mark: 'mark-output', meta: ['调研分析', '输出 · 调研'], nav: 'none',
    loader: () => import('./pages/ResearchPage').then((m) => ({ default: m.ResearchPage })) },
  { path: '/output/draft', label: '文章草稿（旧入口）', mark: 'mark-output', meta: ['文章草稿', '输出 · 文章草稿'], nav: 'none', redirect: '/output/article' },
  { path: '/output/video', label: '数据视频', mark: 'mark-output', meta: ['数据视频', '输出 · 远期'], nav: 'none',
    loader: () => import('./pages/Placeholder').then((m) => ({ default: () => <m.Placeholder kind="video" /> })) },

  { path: '/review', label: '复盘档案', mark: 'mark-review', meta: ['复盘档案', '回路 · 复盘工作台'], nav: 'module:review', sidebar: true,
    layoutElement: <div className="review-root"><Outlet /></div>,
    children: [
      { path: '', index: true, label: '复盘档案', icon: 'folder', sidebarNav: true,
        loader: () => import('./modules/review/pages/Dashboard').then((m) => ({ default: m.Dashboard })) },
      { path: 'new', label: '新建复盘', icon: 'plusCircle', sidebarNav: true,
        loader: () => import('./modules/review/pages/NewReview').then((m) => ({ default: m.NewReview })) },
      { path: 'wizard', loader: () => import('./modules/review/pages/Wizard').then((m) => ({ default: m.Wizard })) },
      { path: 'meeting', loader: () => import('./modules/review/pages/MeetingRoom').then((m) => ({ default: m.MeetingRoom })) },
      { path: 'archive/:id', loader: () => import('./modules/review/pages/ArchiveDetail').then((m) => ({ default: m.ArchiveDetail })) },
      { path: 'assets', label: '认知资产', icon: 'layers', sidebarNav: true,
        loader: () => import('./modules/review/pages/Library').then((m) => ({ default: m.Library })) },
      { path: 'analytics', label: '聚合分析', icon: 'pieChart', sidebarNav: true,
        loader: () => import('./modules/review/pages/StatsView').then((m) => ({ default: m.StatsView })) },
      { path: 'help', loader: () => import('./modules/review/pages/Help').then((m) => ({ default: m.Help })) },
    ] },

  { path: '/settings', label: '设置', mark: 'mark-workspace', meta: ['设置', '工作台'], nav: 'palette',
    loader: () => import('./pages/Settings').then((m) => ({ default: m.Settings })) },
  { path: '/help', label: '帮助', mark: 'mark-workspace', meta: ['帮助', '工作台'], nav: 'palette',
    loader: () => import('./pages/Help').then((m) => ({ default: m.Help })) },
  { path: '/welcome', label: '首访引导', mark: 'mark-workspace', meta: ['欢迎', '工作台 · 首访引导'], nav: 'none',
    loader: () => import('./pages/Welcome').then((m) => ({ default: m.Welcome })) },
  { path: '/design', label: '设计系统', mark: 'mark-workspace', meta: ['设计系统', '工作台 · 组件样例'], nav: 'none',
    loader: () => import('./pages/DesignSystem').then((m) => ({ default: m.DesignSystem })) },
  { path: '/cloud', label: '云端同步（旧入口）', mark: 'mark-workspace', meta: ['云端同步', '设置 · 云端同步'], nav: 'none', redirect: '/settings?tab=cloud' },
]
