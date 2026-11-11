/**
 * 动作注册表（阶段二 2.3，2026-11-11）：命令面板、工具轮盘、全局快捷键三处动作同源——
 * 一次登记，入口各自消费。回路模块「一次注册、四处自动获得」的哲学推广到动作层；
 * 外部项目（2.5 起）注册动作即自动获得全部入口。
 *
 * 设计要点：run 不闭包 navigate——执行上下文（ActionCtx）由调用方注入，
 * 注册表保持纯数据形态，非组件上下文（轮盘 dispatch 映射、单测）可安全引用。
 * 轮盘格位模型（content/wheel.ts，用户数据）不动：其 quick/fetch 两类格位
 * 在执行端映射到本表的 action id（wheelActionForKind），route/url 系直接导航不经表。
 */

/** 执行上下文：由组件侧（App 壳/面板/快捷键）注入 */
export interface ActionCtx {
  navigate: (path: string) => void
  openQuickNote: () => void
  openPalette?: (via?: 'key' | 'littlep') => void
}

export interface AppAction {
  id: string
  /** 界面名（同一概念全站同名） */
  label: string
  icon: string
  /** 一句话用途（设置页键位/面板 sub 共用） */
  desc: string
  /** 是否出现在命令面板动作组（打开面板/轮盘自身不出现） */
  inPalette: boolean
  /** 是否受 typing 守卫约束（单键快捷键在输入框内不触发；组合键类动作不受限） */
  guardTyping: boolean
  run: (ctx: ActionCtx) => void
}

export const APP_ACTIONS: AppAction[] = [
  {
    id: 'quick-note',
    label: '新速记',
    icon: 'zap',
    desc: '任何地方唤起速记输入',
    inPalette: true,
    guardTyping: true,
    run: (ctx) => ctx.openQuickNote(),
  },
  {
    id: 'new-review',
    label: '新建复盘',
    icon: 'repeat',
    desc: '开一场新的复盘',
    inPalette: true,
    guardTyping: false,
    run: (ctx) => ctx.navigate('/review/new'),
  },
  {
    id: 'fetch-digest',
    label: '立即抓取',
    icon: 'rss',
    desc: '抓一轮全部信源并进信息日报',
    inPalette: true,
    guardTyping: false,
    run: (ctx) => {
      // 依赖延迟引入：采集 store 挂着网关与库，注册表保持零模块级依赖
      void import('../store/collect').then((m) => void m.useCollect.getState().runFetchAll())
      ctx.navigate('/input/digest')
    },
  },
  {
    id: 'open-help',
    label: '帮助',
    icon: 'helpCircle',
    desc: '打开帮助',
    inPalette: false,
    guardTyping: true,
    run: (ctx) => ctx.navigate('/help'),
  },
  {
    id: 'open-settings',
    label: '设置',
    icon: 'settings',
    desc: '打开设置',
    inPalette: false,
    guardTyping: true,
    run: (ctx) => ctx.navigate('/settings'),
  },
  {
    id: 'open-palette',
    label: '命令面板',
    icon: 'search',
    desc: '跨模块检索与跳转（/ 永远可用）',
    inPalette: false,
    guardTyping: false,
    run: (ctx) => ctx.openPalette?.('key'),
  },
]

/** 按 id 取动作（未知 id 返回 undefined——外部注册前先查） */
export function actionById(id: string): AppAction | undefined {
  return APP_ACTIONS.find((a) => a.id === id)
}

/** 命令面板动作组（inPalette 标记过滤，顺序即表序） */
export function paletteActions(): AppAction[] {
  return APP_ACTIONS.filter((a) => a.inPalette)
}

/**
 * 轮盘格位 kind → 动作 id（执行端收敛：quick/fetch 的实际行为只在这一处定义）。
 * route/url/topmost 三类格位保持直接执行（任意路径/外链/系统动作不经表）。
 */
export function wheelActionForKind(kind: 'quick' | 'fetch'): string {
  return kind === 'quick' ? 'quick-note' : 'fetch-digest'
}
