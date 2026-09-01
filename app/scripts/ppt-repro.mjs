/**
 * PPT 损坏复现脚本（诊断用）：生成 A(含图表) / B(不含图表) 两个文件到临时目录，
 * 用 PowerPoint COM 逐一验证可打开性，定位损坏元素。
 * 运行：cd app && node scripts/ppt-repro.mjs
 */
import PptxGenJS from 'pptxgenjs'
import { writeFileSync } from 'node:fs'

const OUT = process.env.TEMP || '.'
const C = { BG_DARK: '211E1A', BG_LIGHT: 'FAF9F7', CARD: 'FFFFFF', PRIMARY: 'B0500F', ACCENT: 'E8833A', TEXT: '211E1A', TEXT_INV: 'ECEBE7', MUTED: '97928A', MUTED_INV: '827D73', LINE: 'E6E4DF' }
const FONT = 'Microsoft YaHei'

function buildSlides(withChart) {
  const slides = [
    { kind: 'title', title: 'PWORK 周报', bullets: ['近 7 天 · 至 2026-09-01'], stats: [], footer: 'PWORK · 2026-09-01', dark: true },
  ]
  if (withChart) {
    slides.push({
      kind: 'chart', title: '任务闭环率趋势', bullets: [], stats: [], footer: 'PWORK · 2026-09-01',
      chart: { labels: ['08-25', '08-31', '09-01'], values: [20, 35, 45] },
    })
  }
  slides.push(
    { kind: 'stats', title: '本期关键数字', bullets: [], stats: [['45%', '任务闭环率'], ['5', '本期闭环'], ['1', '进行中目标'], ['4', '新增洞察']], footer: 'PWORK · 2026-09-01' },
    { kind: 'bullets', title: '任务', bullets: ['✅ 完成采集信源验证', '□ 未闭环 2 项（逾期 1）'], stats: [], footer: 'PWORK · 2026-09-01' },
    { kind: 'bullets', title: '目标进展', bullets: ['◎ 完成周复盘闭环验证（2026-09-06）'], stats: [], footer: 'PWORK · 2026-09-01' },
    { kind: 'bullets', title: '本周洞察', bullets: ['💡 外部机会要进 SWOT 才能变成策略'], stats: [], footer: 'PWORK · 2026-09-01' },
    { kind: 'bullets', title: '外部环境（高分条目）', bullets: ['少数派周报（评分 65 · 少数派）'], stats: [], footer: 'PWORK · 2026-09-01' },
    { kind: 'title', title: '谢谢观看', bullets: ['PWORK 周报 · 数据来自本机工作台'], stats: [], footer: 'PWORK · 2026-09-01', dark: true },
  )
  return slides
}

function render(pptx, specs) {
  for (const spec of specs) {
    const slide = pptx.addSlide()
    const dark = spec.dark ?? false
    slide.background = { color: dark ? C.BG_DARK : C.BG_LIGHT }
    slide.addText(spec.footer, { x: 0.5, y: 5.15, w: 9, h: 0.3, fontSize: 10, color: dark ? C.MUTED_INV : C.MUTED, fontFace: FONT })

    if (spec.kind === 'title') {
      slide.addShape(pptx.ShapeType.rect, { x: 0.65, y: 2.2, w: 0.09, h: 1.1, fill: { color: C.ACCENT } })
      slide.addText(spec.title, { x: 0.95, y: 2.1, w: 8.5, h: 0.95, fontSize: 40, bold: true, color: dark ? C.TEXT_INV : C.TEXT, fontFace: FONT })
      if (spec.bullets.length) slide.addText(spec.bullets.join('\n'), { x: 0.98, y: 3.1, w: 8, h: 0.8, fontSize: 15, color: dark ? C.MUTED_INV : C.MUTED, fontFace: FONT })
      continue
    }
    slide.addText(spec.title, { x: 0.6, y: 0.45, w: 9, h: 0.6, fontSize: 26, bold: true, color: C.TEXT, fontFace: FONT })

    if (spec.kind === 'stats') {
      spec.stats.forEach(([v, l], i) => {
        const x = 0.6 + (i % 2) * 4.65
        const y = 1.45 + Math.floor(i / 2) * 1.8
        slide.addShape(pptx.ShapeType.rect, { x, y, w: 4.25, h: 1.55, fill: { color: C.CARD }, line: { color: C.LINE, width: 0.75 } })
        slide.addShape(pptx.ShapeType.rect, { x, y, w: 0.05, h: 1.55, fill: { color: C.ACCENT } })
        slide.addText(v, { x: x + 0.3, y: y + 0.18, w: 3.6, h: 0.75, fontSize: 34, bold: true, color: C.TEXT, fontFace: FONT })
        slide.addText(l, { x: x + 0.3, y: y + 0.98, w: 3.6, h: 0.35, fontSize: 12, color: C.MUTED, fontFace: FONT })
      })
      continue
    }
    if (spec.kind === 'chart' && spec.chart) {
      // 方式 A（当前 app 代码）：逐点拆成多个 series
      slide.addChart(pptx.ChartType.bar, [
        { name: '任务闭环率', labels: spec.chart.labels, values: spec.chart.values },
      ], {
        x: 0.9, y: 1.35, w: 8.3, h: 3.55,
        barDir: 'col', barGapWidthPct: 80,
        chartColors: [C.PRIMARY],
        showValue: true, dataLabelColor: C.TEXT, dataLabelFontSize: 11, dataLabelPosition: 'outEnd',
        catAxisLabelColor: C.MUTED, valAxisHidden: true, valAxisMaxVal: 100,
        catAxisLineColor: C.LINE, showLegend: false, showTitle: false,
      })
      continue
    }
    const rows = spec.bullets
    rows.forEach((b, i) => {
      const y = 1.35 + i * 0.62
      slide.addText(b, { x: 0.75, y, w: 8.7, h: 0.5, fontSize: 15, color: C.TEXT, fontFace: FONT })
      if (i < rows.length - 1) slide.addShape(pptx.ShapeType.line, { x: 0.75, y: y + 0.52, w: 8.7, h: 0, line: { color: C.LINE, width: 0.75 } })
    })
    if (rows.length === 0) slide.addText('（本期无记录）', { x: 0.75, y: 1.5, w: 8, h: 0.5, fontSize: 14, color: C.MUTED, fontFace: FONT })
  }
}

async function make(name, withChart) {
  const pptx = new PptxGenJS()
  pptx.layout = 'LAYOUT_16x9'
  pptx.author = 'PWORK'
  render(pptx, buildSlides(withChart))
  const file = `${OUT}\\${name}`
  await pptx.writeFile({ fileName: file })
  console.log('written:', file)
}

const which = process.argv[2] ?? 'both'
if (which === 'both' || which === 'A') await make('ppt-a-chart.pptx', true)
if (which === 'both' || which === 'B') await make('ppt-b-nochart.pptx', false)
console.log('done')
