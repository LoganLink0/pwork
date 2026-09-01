/**
 * PPT 导出（输出 O1 增补，用户需求）：ReportData → 幻灯片规格（纯函数可测）
 * → PptxGenJS 本地渲染 .pptx（零 Key、不上传）。
 * 配色为 v3「冷静的工作台」tokens 字面量（Canvas/Pptx 无法读 CSS 变量）。
 */
import type { ReportData } from './reportData'

export interface SlideSpec {
  kind: 'title' | 'stats' | 'bullets'
  title: string
  bullets: string[]
  stats: [string, string][]
  footer: string
}

export function buildReportSlides(d: ReportData): SlideSpec[] {
  const modeLabel = d.mode === 'weekly' ? '周报' : '月报'
  const footer = `PWORK · 个人工作台 · ${d.today}`
  const slides: SlideSpec[] = [
    {
      kind: 'title',
      title: `PWORK ${modeLabel}`,
      bullets: [d.rangeLabel, `生成于 ${d.today}`],
      stats: [],
      footer,
    },
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

/** 渲染并触发下载 .pptx（动态引入 pptxgenjs，保持首包精简） */
export async function exportReportPptx(d: ReportData): Promise<string> {
  const { default: PptxGenJS } = await import('pptxgenjs')
  const pptx = new PptxGenJS()
  pptx.layout = 'LAYOUT_16x9'
  pptx.author = 'PWORK'
  pptx.title = `PWORK ${d.mode === 'weekly' ? '周报' : '月报'}`

  const INK = '211E1A'
  const SOFT = '66625A'
  const FAINT = '97928A'
  const ACCENT = 'B0500F'
  const BG = 'FAF9F7'

  for (const spec of buildReportSlides(d)) {
    const slide = pptx.addSlide()
    slide.background = { color: BG }
    // 页脚
    slide.addText(spec.footer, { x: 0.5, y: 5.1, w: 9, h: 0.3, fontSize: 10, color: FAINT })
    if (spec.kind === 'title') {
      slide.addText(spec.title, { x: 0.6, y: 1.8, w: 8.8, h: 0.9, fontSize: 40, bold: true, color: INK })
      slide.addShape(pptx.ShapeType.rect, { x: 0.65, y: 2.75, w: 0.08, h: 0.7, fill: { color: ACCENT } })
      slide.addText(spec.bullets.join('\n'), { x: 0.9, y: 2.7, w: 8, h: 0.9, fontSize: 16, color: SOFT })
    } else if (spec.kind === 'stats') {
      slide.addText(spec.title, { x: 0.6, y: 0.5, w: 9, h: 0.6, fontSize: 26, bold: true, color: INK })
      spec.stats.forEach(([v, l], i) => {
        const x = 0.6 + (i % 2) * 4.6
        const y = 1.5 + Math.floor(i / 2) * 1.7
        slide.addShape(pptx.ShapeType.rect, { x, y, w: 4.2, h: 1.4, fill: { color: 'FFFFFF' }, line: { color: 'E6E4DF' } })
        slide.addShape(pptx.ShapeType.rect, { x, y, w: 0.06, h: 1.4, fill: { color: ACCENT } })
        slide.addText(v, { x: x + 0.25, y: y + 0.15, w: 3.6, h: 0.7, fontSize: 32, bold: true, color: INK })
        slide.addText(l, { x: x + 0.25, y: y + 0.9, w: 3.6, h: 0.35, fontSize: 12, color: FAINT })
      })
    } else {
      slide.addText(spec.title, { x: 0.6, y: 0.5, w: 9, h: 0.6, fontSize: 26, bold: true, color: INK })
      if (spec.bullets.length) {
        slide.addText(
          spec.bullets.map((b) => ({ text: b, options: { bullet: false, breakLine: true } })),
          { x: 0.7, y: 1.3, w: 8.9, h: 3.6, fontSize: 15, color: SOFT, lineSpacingMultiple: 1.4 },
        )
      } else {
        slide.addText('（本期无记录）', { x: 0.7, y: 1.5, w: 8, h: 0.5, fontSize: 14, color: FAINT })
      }
    }
  }

  const filename = `PWORK-${d.mode === 'weekly' ? 'weekly' : 'monthly'}-${d.today}.pptx`
  await pptx.writeFile({ fileName: filename })
  return filename
}
