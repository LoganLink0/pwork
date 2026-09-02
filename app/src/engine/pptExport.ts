/**
 * PPT 导出（输出 O1 增补）：ReportData → 幻灯片规格（纯函数可测）→ PptxGenJS 本地渲染 .pptx。
 * 设计规范工程化自官方 pptx skill：
 *  ① 三明治结构——深色封面/结尾 + 浅色内容页；
 *  ② 每页一个视觉焦点——超大数字或原生图表（禁止"色条+列表"的 AI 模板味）；
 *  ③ 原生图表（闭环率趋势柱图/闭环率环形图）随快照数据点亮；
 *  ④ 配色常量集中定义：BG/PRIMARY/ACCENT/TEXT/MUTED（v3 同源），禁止逐页手挑。
 * 快照 ≥2 条时自动点亮"趋势图表页"。
 */
import type { ReportData } from './reportData'
import type { ReportSnapshot } from '../types/models'

export interface SlideSpec {
  kind: 'title' | 'stats' | 'bullets' | 'chart'
  title: string
  bullets: string[]
  stats: [string, string][]
  /** kind='chart' 时：labels 与 values 等长 */
  chart?: { labels: string[]; values: number[] }
  footer: string
  /** 深色页（封面/结尾）标记 */
  dark?: boolean
}

// v3 同源配色（字面量：pptx 无法读 CSS 变量）
export const PPT_COLORS = {
  BG_DARK: '211E1A',
  BG_LIGHT: 'FAF9F7',
  CARD: 'FFFFFF',
  PRIMARY: 'B0500F',
  ACCENT: 'E8833A',
  TEXT: '211E1A',
  TEXT_INV: 'ECEBE7',
  MUTED: '97928A',
  MUTED_INV: '827D73',
  LINE: 'E6E4DF',
} as const

function buildContentSlides(d: ReportData): SlideSpec[] {
  const footer = `PWORK · 个人工作台 · ${d.today}`
  const slides: SlideSpec[] = [
    {
      kind: 'stats',
      title: '本期关键数字',
      bullets: [],
      stats: [
        [`${d.tasks.closureRate}%`, '任务闭环率'],
        [String(d.tasks.closed.length), '本期闭环'],
        [String(d.goals.active.length), '进行中目标'],
        [String(d.insights.length), '新增洞察'],
      ],
      footer,
    },
    {
      kind: 'bullets',
      title: '任务',
      bullets: [
        ...d.tasks.closed.slice(0, 6).map((t) => `✅ ${t.title}`),
        d.tasks.openCount > 0 ? `□ 未闭环 ${d.tasks.openCount} 项（逾期 ${d.tasks.overdueCount}）` : '',
      ].filter(Boolean),
      stats: [],
      footer,
    },
    {
      kind: 'bullets',
      title: '目标进展',
      bullets: [
        ...d.goals.active.map((g) => `◎ ${g.title}${g.due ? `（${g.due}）` : ''}`),
        d.goals.doneInRange > 0 ? `🎉 本期达成 ${d.goals.doneInRange} 个` : '',
      ].filter(Boolean),
      stats: [],
      footer,
    },
    {
      kind: 'bullets',
      title: '本周洞察',
      bullets: d.insights.slice(0, 6).map((i) => `💡 ${i.text}`),
      stats: [],
      footer,
    },
    {
      kind: 'bullets',
      title: '外部环境（高分条目）',
      bullets: d.topItems.map((i) => `${i.title}（评分 ${i.score} · ${i.sourceName}）`),
      stats: [],
      footer,
    },
  ]
  return slides
}

export function buildReportSlides(d: ReportData, snapshots: ReportSnapshot[] = []): SlideSpec[] {
  const modeLabel = d.mode === 'weekly' ? '周报' : '月报'
  const footer = `PWORK · 个人工作台 · ${d.today}`
  const slides: SlideSpec[] = []

  // 封面（深色，大字焦点）
  slides.push({
    kind: 'title',
    title: `PWORK ${modeLabel}`,
    bullets: [d.rangeLabel],
    stats: [],
    footer,
    dark: true,
  })

  // 趋势图表页（快照 ≥2 时点亮；原生图表，焦点即图）
  if (snapshots.length >= 2) {
    slides.push({
      kind: 'chart',
      title: '任务闭环率趋势',
      bullets: [],
      stats: [],
      chart: {
        labels: snapshots.map((s) => s.day.slice(5)), // MM-DD
        values: snapshots.map((s) => s.closureRate),
      },
      footer,
    })
  }

  slides.push(...buildContentSlides(d))

  // 外部数据块（输出扩展）：每个块一页，"键: 值"行渲染为指标行
  for (const b of d.blocks) {
    const bullets = [...b.kv.map((r) => `${r.k}：${r.v}`), ...b.text].slice(0, 6)
    if (bullets.length === 0) continue
    slides.push({
      kind: 'bullets',
      title: b.title,
      bullets,
      stats: [],
      footer,
    })
  }

  // 结尾（深色）
  slides.push({
    kind: 'title',
    title: '谢谢观看',
    bullets: [`PWORK ${modeLabel} · 数据来自本机工作台`],
    stats: [],
    footer,
    dark: true,
  })
  return slides
}
