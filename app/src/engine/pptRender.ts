/**
 * 幻灯片规格 → PptxGenJS 渲染（与规格分离，便于测试与替换皮肤）。
 * 版式按 spec.kind 分派：title/stats/chart/bullets。
 */
import type PptxGenJS from 'pptxgenjs'
import type { SlideSpec } from './pptExport'
import { PPT_COLORS as C } from './pptExport'

// PPTX 的 typeface 属性禁含双引号（pptxgenjs 不转义，会炸 XML）——用 Windows 全量预装的微软雅黑
const FONT = 'Microsoft YaHei'

// 统一左缘标准（2026-10-12 对齐修复）：内容页所有元素（标题/正文/表格/图表/页脚）从同一列起步；
// 封面与章节页的琥珀条也锚定该列，文字在其右侧 0.3"
const X = 0.6
const COL_W = 8.8

/** 按视觉宽度估算行数：CJK 记 1、其余约 0.55 个汉字宽，行宽即内容列宽 */
export function estimateLines(text: string, fontSize: number, colWidthIn: number): number {
  let units = 0
  for (const ch of text) units += /[\u2E80-\u9FFF\uF900-\uFAFF\uFF00-\uFFEF]/.test(ch) ? 1 : 0.55
  return Math.max(1, Math.ceil((units * fontSize) / 72 / colWidthIn))
}

function addFooter(slide: PptxGenJS.Slide, footer: string, dark: boolean): void {
  slide.addText(footer, {
    x: X, y: 5.15, w: 9, h: 0.3, fontSize: 10,
    color: dark ? C.MUTED_INV : C.MUTED, fontFace: FONT,
  })
}

/** 渲染一张幻灯片（三明治：dark 页深底大字，light 页浅底内容） */
export function renderSlide(slide: PptxGenJS.Slide, pptx: PptxGenJS, spec: SlideSpec): void {
  const dark = spec.dark ?? false
  slide.background = { color: dark ? C.BG_DARK : C.BG_LIGHT }
  addFooter(slide, spec.footer, dark)

  if (spec.kind === 'title') {
    // 封面/结尾：琥珀竖条锚定内容列 + 大字标题（视觉焦点=大字）
    slide.addShape(pptx.ShapeType.rect, { x: X, y: 2.2, w: 0.09, h: 1.1, fill: { color: C.ACCENT } })
    slide.addText(spec.title, {
      x: X + 0.3, y: 2.1, w: 8.4, h: 0.95, fontSize: 40, bold: true,
      color: dark ? C.TEXT_INV : C.TEXT, fontFace: FONT,
    })
    if (spec.bullets.length) {
      slide.addText(spec.bullets.join('\n'), {
        x: X + 0.3, y: 3.1, w: 8.4, h: 0.8, fontSize: 15,
        color: dark ? C.MUTED_INV : C.MUTED, fontFace: FONT,
      })
    }
    return
  }

  // 内容页页标题
  slide.addText(spec.title, {
    x: X, y: 0.45, w: 9, h: 0.6, fontSize: 26, bold: true,
    color: C.TEXT, fontFace: FONT,
  })

  if (spec.kind === 'stats') {
    // 焦点=超大数字卡片（2×2，发丝线描边，无阴影）
    spec.stats.forEach(([v, l], i) => {
      const x = X + (i % 2) * 4.65
      const y = 1.45 + Math.floor(i / 2) * 1.8
      slide.addShape(pptx.ShapeType.rect, {
        x, y, w: 4.25, h: 1.55, fill: { color: C.CARD }, line: { color: C.LINE, width: 0.75 },
      })
      slide.addShape(pptx.ShapeType.rect, { x, y, w: 0.05, h: 1.55, fill: { color: C.ACCENT } })
      slide.addText(v, { x: x + 0.3, y: y + 0.18, w: 3.6, h: 0.75, fontSize: 34, bold: true, color: C.TEXT, fontFace: FONT })
      slide.addText(l, { x: x + 0.3, y: y + 0.98, w: 3.6, h: 0.35, fontSize: 12, color: C.MUTED, fontFace: FONT })
    })
    return
  }

  if (spec.kind === 'section') {
    // 章节分隔：琥珀竖条锚定内容列 + 章节大字（视觉焦点=章节转场）
    slide.addShape(pptx.ShapeType.rect, { x: X, y: 2.3, w: 0.09, h: 0.9, fill: { color: C.ACCENT } })
    slide.addText(spec.title, {
      x: X + 0.3, y: 2.2, w: 8.4, h: 1.1, fontSize: 32, bold: true,
      color: dark ? C.TEXT_INV : C.TEXT, fontFace: FONT,
    })
    return
  }

  if (spec.kind === 'table' && spec.table) {
    const th = spec.table.headers.map((h) => ({
      text: h,
      options: { bold: true, color: 'FFFFFF', fill: { color: C.PRIMARY }, fontSize: 12, fontFace: FONT },
    }))
    const body = spec.table.rows.map((r, ri) =>
      r.map((c) => ({
        text: String(c),
        options: { fontSize: 11, color: C.TEXT, fontFace: FONT, fill: { color: ri % 2 === 1 ? C.BG_LIGHT : C.CARD } },
      })),
    )
    slide.addTable([th, ...body], {
      x: X, y: 1.35, w: COL_W,
      border: { type: 'solid', color: C.LINE, pt: 0.75 },
      colW: spec.table.headers.length ? Array(spec.table.headers.length).fill(COL_W / spec.table.headers.length) : undefined,
    })
    return
  }

  if (spec.kind === 'chart' && spec.chart) {
    // 焦点=原生柱状图（数值标签直出），与内容列同缘
    slide.addChart(pptx.ChartType.bar, spec.chart.values.map((v, i) => ({
      name: spec.chart!.labels[i] ?? String(i),
      labels: [spec.chart!.labels[i] ?? String(i)],
      values: [v],
    })), {
      x: X, y: 1.35, w: COL_W, h: 3.55,
      barDir: 'col', barGapWidthPct: 80,
      chartColors: [C.PRIMARY],
      showValue: true, dataLabelColor: C.TEXT, dataLabelFontSize: 11, dataLabelPosition: 'outEnd',
      catAxisLabelColor: C.MUTED, valAxisHidden: true, valAxisMaxVal: 100,
      catAxisLineColor: C.LINE, showLegend: false, showTitle: false,
    })
    return
  }

  // bullets：行式分组（发丝分隔线），行高按内容行数自适应（2026-10-12 修复长句换行与线重叠）
  const rows = spec.bullets
  const LINE_H = 0.32
  let y = 1.35
  let skipped = 0
  for (let i = 0; i < rows.length; i++) {
    const lines = estimateLines(rows[i], 15, COL_W)
    const rowH = lines * LINE_H + 0.2
    if (y + rowH > 4.95) {
      skipped = rows.length - i
      break
    }
    slide.addText(rows[i], { x: X, y, w: COL_W, h: lines * LINE_H, fontSize: 15, color: C.TEXT, fontFace: FONT, valign: 'top' })
    y += rowH
    if (i < rows.length - 1) {
      slide.addShape(pptx.ShapeType.line, { x: X, y: y - 0.1, w: COL_W, h: 0, line: { color: C.LINE, width: 0.75 } })
    }
  }
  if (skipped > 0) {
    slide.addText(`（其余 ${skipped} 条略）`, { x: X, y: Math.min(y, 4.95), w: COL_W, h: 0.35, fontSize: 13, color: C.MUTED, fontFace: FONT })
  }
  if (rows.length === 0) {
    slide.addText('（本期无记录）', { x: X, y: 1.5, w: 8, h: 0.5, fontSize: 14, color: C.MUTED, fontFace: FONT })
  }
}

/** 整份报告渲染：规格数组 → pptx 实例（不写文件，由调用方 writeFile） */
export async function renderReport(pptx: PptxGenJS, specs: SlideSpec[]): Promise<void> {
  for (const spec of specs) {
    const slide = pptx.addSlide()
    renderSlide(slide, pptx, spec)
  }
}
