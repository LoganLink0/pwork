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
  draft: {
    icon: '✍',
    title: '文章草稿（O4 待办）',
    lead: '将要解决：速记与洞察聚合 → 博客文章骨架 + AI 润色。',
    will: [
      ['为什么现在没有', '文章形态等真实写作场景出现后定义（处理模块的工具刚起步）。'],
      ['现在能做什么', 'AI 全库问答（处理页）可以帮你把散落想法先汇总起来。'],
    ],
    goLabel: '去处理',
    goTo: '/process',
  },
  video: {
    icon: '🎬',
    title: '数据视频（O5 远期）',
    lead: '将要解决：数据变化 → 短视频。',
    will: [
      ['为什么现在没有', '依赖 AI 生成能力与真实需求，立占位不实现。'],
      ['现在能做什么', '数据快照卡片已可分享关键数字。'],
    ],
    goLabel: '去数据卡片',
    goTo: '/output/card',
  },
}
