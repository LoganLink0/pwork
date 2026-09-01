import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { gatherReportData, type ReportData, type ReportMode } from '../engine/reportData'
import { buildReportSlides } from '../engine/pptExport'
import { exportReportPptx } from '../engine/pptFile'

/** PPT 导出（输出）：报告数据 → 六~七页演示文稿，PptxGenJS 本地生成 .pptx */
export function PptExport() {
  const [mode, setMode] = useState<ReportMode>('weekly')
  const [data, setData] = useState<ReportData | null>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')

  useEffect(() => {
    void gatherReportData(mode).then(setData)
  }, [mode])

  const slides = data ? buildReportSlides(data) : []

  const exportPpt = async () => {
    if (!data || busy) return
    setBusy(true)
    setMsg('')
    try {
      const name = await exportReportPptx(data)
      setMsg(`✅ 已生成 ${name}`)
    } catch (e) {
      setMsg(`生成失败：${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="settings" style={{ maxWidth: 'var(--content-w)' }}>
      <div className="page-head">
        <h1>PPT 导出</h1>
        <span className="sub">报告数据 → 演示文稿（.pptx 本地生成，不上传）</span>
        <div className="right">
          <Link to="/output" className="btn-ghost">← 输出工具箱</Link>
        </div>
      </div>

      <div className="set-card">
        <div className="set-body">
          <div className="set-row">
            <label>周期</label>
            <div className="radio">
              <button type="button" className={mode === 'weekly' ? 'on' : ''} onClick={() => setMode('weekly')}>周报</button>
              <button type="button" className={mode === 'monthly' ? 'on' : ''} onClick={() => setMode('monthly')}>月报</button>
            </div>
            <button type="button" className="btn-primary" disabled={!data || busy} onClick={() => void exportPpt()} data-testid="ppt-export-btn">
              {busy ? '生成中…' : '⬇ 生成并下载 .pptx'}
            </button>
          </div>
          {msg && <div className="run-banner" style={{ marginTop: 'var(--sp-2)' }} role="status">{msg}</div>}

          {slides.length > 0 && (
            <div style={{ paddingTop: 'var(--sp-3)' }}>
              <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--ink-faint)', marginBottom: 6 }}>幻灯片结构（{slides.length} 页）</div>
              {slides.map((s, i) => (
                <div key={i} style={{ display: 'flex', gap: 'var(--sp-2)', alignItems: 'baseline', padding: '4px 0', borderBottom: '1px solid var(--line)' }}>
                  <span className="tnum" style={{ fontSize: 'var(--fs-xs)', color: 'var(--ink-faint)', width: 20 }}>{i + 1}</span>
                  <span style={{ fontSize: 'var(--fs-sm)', fontWeight: s.kind === 'title' ? 700 : 400 }}>{s.title}</span>
                  <span style={{ marginLeft: 'auto', fontSize: 'var(--fs-xs)', color: 'var(--ink-faint)' }}>
                    {s.kind === 'stats' ? '关键数字' : s.kind === 'chart' ? '趋势图表' : s.kind === 'title' ? (s.dark ? '封面' : '结尾') : '内容页'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="notice">
        版式为 v3 三明治结构（深色封面/结尾 + 浅色内容页 + 原生趋势图表）；快照 ≥2 条后趋势图表页自动点亮——每生成一次报告，趋势数据就多一格。
      </div>
    </section>
  )
}
