/**
 * 幻灯片规格 → PptxGenJS 渲染（与规格分离，便于测试与替换皮肤）。
 * 版式按 spec.kind 分派：title/stats/chart/bullets。
 */
import type PptxGenJS from 'pptxgenjs'
import type { SlideSpec } from './pptExport'
import { PPT_COLORS as C } from './pptExport'

// PPTX 的 typeface 属性禁含双引号（pptxgenjs 不转义，会炸 XML）——用 Windows 全量预装的微软雅黑
const FONT = 'Microsoft YaHei'

function addFooter(slide: PptxGenJS.Slide, footer: string, dark: boolean): void {
  slide.addText(footer, {
    x: 0.5, y: 5.15, w: 9, h: 0.3, fontSize: 10,
    color: dark ? C.MUTED_INV : C.MUTED, fontFace: FONT,
  })
}

/** 渲染一张幻灯片（三明治：dark 页深底大字，light 页浅底内容） */
export function renderSlide(slide: PptxGenJS.Slide, pptx: PptxGenJS, spec: SlideSpec): void {
  const dark = spec.dark ?? false
  slide.background = { color: dark ? C.BG_DARK : C.BG_LIGHT }
  addFooter(slide, spec.footer, dark)

  if (spec.kind === 'title') {
    // 封面/结尾：左侧琥珀竖条 + 大字标题（视觉焦点=大字）
    slide.addShape(pptx.ShapeType.rect, { x: 0.65, y: 2.2, w: 0.09, h: 1.1, fill: { color: C.ACCENT } })
    slide.addText(spec.title, {
      x: 0.95, y: 2.1, w: 8.5, h: 0.95, fontSize: 40, bold: true,
      color: dark ? C.TEXT_INV : C.TEXT, fontFace: FONT,
    })
    if (spec.bullets.length) {
      slide.addText(spec.bullets.join('\n'), {
        x: 0.98, y: 3.1, w: 8, h: 0.8, fontSize: 15,
        color: dark ? C.MUTED_INV : C.MUTED, fontFace: FONT,
      })
    }
    return
  }

  // 内容页页标题
  slide.addText(spec.title, {
    x: 0.6, y: 0.45, w: 9, h: 0.6, fontSize: 26, bold: true,
    color: C.TEXT, fontFace: FONT,
  })

  if (spec.kind === 'stats') {
    // 焦点=超大数字卡片（2×2，发丝线描边，无阴影）
    spec.stats.forEach(([v, l], i) => {
      const x = 0.6 + (i % 2) * 4.65
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

  if (spec.kind === 'chart' && spec.chart) {
    // 焦点=原生柱状图（数值标签直出）
    slide.addChart(pptx.ChartType.bar, spec.chart.values.map((v, i) => ({
      name: spec.chart!.labels[i] ?? String(i),
      labels: [spec.chart!.labels[i] ?? String(i)],
      values: [v],
    })), {
      x: 0.9, y: 1.35, w: 8.3, h: 3.55,
      barDir: 'col', barGapWidthPct: 80,
      chartColors: [C.PRIMARY],
      showValue: true, dataLabelColor: C.TEXT, dataLabelFontSize: 11, dataLabelPosition: 'outEnd',
      catAxisLabelColor: C.MUTED, valAxisHidden: true, valAxisMaxVal: 100,
      catAxisLineColor: C.LINE, showLegend: false, showTitle: false,
    })
    return
  }

  // bullets：行式分组（首词加粗 + 发丝分隔线），容器留白
  const rows = spec.bullets
  rows.forEach((b, i) => {
    const y = 1.35 + i * 0.62
    slide.addText(b, { x: 0.75, y, w: 8.7, h: 0.5, fontSize: 15, color: C.TEXT, fontFace: FONT })
    if (i < rows.length - 1) {
      slide.addShape(pptx.ShapeType.line, { x: 0.75, y: y + 0.52, w: 8.7, h: 0, line: { color: C.LINE, width: 0.75 } })
    }
  })
  if (rows.length === 0) {
    slide.addText('（本期无记录）', { x: 0.75, y: 1.5, w: 8, h: 0.5, fontSize: 14, color: C.MUTED, fontFace: FONT })
  }
}

/** 整份报告渲染：规格数组 → pptx 实例（不写文件，由调用方 writeFile） */
export async function renderReport(pptx: PptxGenJS, specs: SlideSpec[]): Promise<void> {
  for (const spec of specs) {
    const slide = pptx.addSlide()
    renderSlide(slide, pptx, spec)
  }
}
