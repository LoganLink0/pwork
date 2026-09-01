/**
 * .pptx 文件写出层：动态引入 pptxgenjs（首包精简），渲染规格并触发下载。
 */
import type { ReportData } from './reportData'
import type { ReportSnapshot } from '../types/models'
import { buildReportSlides } from './pptExport'

export async function exportReportPptx(d: ReportData, snapshots: ReportSnapshot[] = []): Promise<string> {
  const [{ default: PptxGenJS }, { renderReport }] = await Promise.all([
    import('pptxgenjs'),
    import('./pptRender'),
  ])
  const pptx = new PptxGenJS()
  pptx.layout = 'LAYOUT_16x9'
  pptx.author = 'PWORK'
  pptx.title = `PWORK ${d.mode === 'weekly' ? '周报' : '月报'}`
  const specs = buildReportSlides(d, snapshots)
  await renderReport(pptx, specs)
  const filename = `PWORK-${d.mode === 'weekly' ? 'weekly' : 'monthly'}-${d.today}.pptx`
  await pptx.writeFile({ fileName: filename })
  return filename
}
