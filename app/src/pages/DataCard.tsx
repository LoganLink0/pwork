import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { gatherReportData, type ReportData, type ReportMode } from '../engine/reportData'
import { todayLocal } from '../engine/datetime'

/** 数据快照卡片（输出 O3）：闭环率/目标/洞察 → 分享卡片图（Canvas，复用 v3 配色） */
export function DataCard() {
  const [data, setData] = useState<ReportData | null>(null)
  const [mode, setMode] = useState<ReportMode>('weekly')
  const [url, setUrl] = useState<string | null>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const prev = useRef<string | null>(null)

  useEffect(() => {
    void gatherReportData(mode).then(setData)
  }, [mode])

  const W = 1000
  const H = 700

  const generate = () => {
    if (!data) return
    const canvas = canvasRef.current ?? document.createElement('canvas')
    canvas.width = W
    canvas.height = H
    const ctx = canvas.getContext('2d')!
    ctx.fillStyle = '#faf9f7'
    ctx.fillRect(0, 0, W, H)
    ctx.fillStyle = '#211e1a'
    ctx.font = '700 44px -apple-system, "PingFang SC", sans-serif'
    ctx.textBaseline = 'top'
    ctx.fillText(`PWORK ${mode === 'weekly' ? '周报' : '月报'}快照`, 72, 72)
    ctx.font = '400 26px -apple-system, sans-serif'
    ctx.fillStyle = '#97928a'
    ctx.fillText(data.rangeLabel, 72, 136)
    const stats: [string, string][] = [
      [data.tasks.closureRate + '%', '任务闭环率'],
      [String(data.tasks.closed.length), '本期闭环'],
      [String(data.insights.length), '新增洞察'],
      [String(data.goals.active.length), '进行中目标'],
    ]
    stats.forEach(([v, l], i) => {
      const x = 72 + (i % 2) * 440
      const y = 200 + Math.floor(i / 2) * 170
      ctx.fillStyle = '#ffffff'
      ctx.strokeStyle = '#e6e4df'
      ctx.lineWidth = 1
      ctx.fillRect(x, y, 400, 140)
      ctx.strokeRect(x, y, 400, 140)
      ctx.fillStyle = '#e8833a'
      ctx.fillRect(x, y, 6, 140)
      ctx.fillStyle = '#211e1a'
      ctx.font = '700 52px -apple-system, sans-serif'
      ctx.fillText(v, x + 32, y + 34)
      ctx.fillStyle = '#97928a'
      ctx.font = '400 24px -apple-system, sans-serif'
      ctx.fillText(l, x + 32, y + 106)
    })
    ctx.fillStyle = '#97928a'
    ctx.font = '400 28px -apple-system, sans-serif'
    ctx.fillText(`PWORK · 个人工作台 · ${todayLocal()}`, 72, H - 90)

    if (prev.current) URL.revokeObjectURL(prev.current)
    const u = canvas.toDataURL('image/png')
    prev.current = u
    canvasRef.current = canvas
    setUrl(u)
  }

  return (
    <section className="settings" style={{ maxWidth: 'var(--content-w)' }}>
      <div className="page-head">
        <h1>周报导出为数据卡片</h1>
        <span className="sub">本期关键数字 → 分享卡片图（Canvas 本地渲染）</span>
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
            <button type="button" className="btn-primary" disabled={!data} onClick={generate} data-testid="datacard-btn">生成卡片</button>
          </div>
          {url && (
            <div style={{ paddingTop: 'var(--sp-3)' }}>
              <img src={url} alt="数据快照卡片" style={{ maxWidth: '100%', borderRadius: 'var(--r-md)', border: '1px solid var(--line)' }} />
              <div className="set-row" style={{ paddingTop: 'var(--sp-2)' }}>
                <a href={url} download={`pwork-snapshot-${data?.today ?? ''}.png`} className="btn-ghost" style={{ textDecoration: 'none' }}>⬇ 下载 PNG</a>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  )
}
