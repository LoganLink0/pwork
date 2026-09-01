/**
 * 占位页内容（PRD §4.7：不做假功能、不留死链接；说清"将要做什么、为什么现在没有、现在能做什么"）。
 * key 与路由占位类型一一对应。
 */

export interface PlaceholderContent {
  icon: string
  title: string
  lead: string
  will: [string, string][]
  goLabel: string
  goTo: string
}

export const PLACEHOLDER: Record<string, PlaceholderContent> = {
  output: {
    icon: '📤',
    title: '输出 · 规划中（远期）',
    lead: '将要解决：报告 / 交付物工作区。',
    will: [
      ['为什么现在没有', '输出形态依赖处理模块验证后的数据结构，现在定义会做死。'],
      ['现在能做什么', '月度 HTML 报告（复盘工作台独立版已有）、速记导出 md 已可用。'],
    ],
    goLabel: '去速记',
    goTo: '/input/notes',
  },
}
