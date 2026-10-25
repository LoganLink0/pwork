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
  video: {
    icon: 'video',
    title: '数据视频（远期规划）',
    lead: '将要解决：数据变化 → 短视频。',
    will: [
      ['为什么现在没有', '依赖 AI 生成能力与真实需求，立占位不实现。'],
      ['现在能做什么', '数据快照卡片已可分享关键数字。'],
    ],
    goLabel: '去数据卡片',
    goTo: '/output/card',
  },
}
