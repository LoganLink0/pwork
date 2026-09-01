import { useRef, useState } from 'react'
import { todayLocal } from '../../engine/datetime'

/** 文字生成卡片图：Canvas 按 v3 配色渲染分享卡片（PNG 下载） */
const CARD_W = 1000
const CARD_H = 1250

export function CardTool() {
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [url, setUrl] = useState<string | null>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const prevUrl = useRef<string | null>(null)

  const generate = () => {
    const canvas = canvasRef.current ?? document.createElement('canvas')
    canvas.width = CARD_W
    canvas.height = CARD_H
    const ctx = canvas.getContext('2d')!
    // v3「冷静的工作台」同源配色（Canvas 无法读 CSS 变量，此处为 tokens 字面量）
    ctx.fillStyle = '#faf9f7'
    ctx.fillRect(0, 0, CARD_W, CARD_H)
    ctx.fillStyle = '#e8833a'
    ctx.fillRect(64, 96, 8, 96)
    // 标题
    ctx.fillStyle = '#211e1a'
    ctx.font = '700 56px -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif'
    ctx.textBaseline = 'top'
    const titleText = title.trim() || 'PWORK 卡片'
    ctx.fillText(titleText.slice(0, 16), 100, 112)
    // 正文（自动换行）
    ctx.font = '400 40px -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif'
    ctx.fillStyle = '#66625a'
    const maxChars = 24
    let y = 300
    for (const para of body.split('\n')) {
      if (!para.trim()) {
        y += 28
        continue
      }
      let rest = para
      while (rest.length > 0) {
        let len = maxChars
        while (ctx.measureText(rest.slice(0, len)).width > CARD_W - 200 && len > 1) len -= 1
        ctx.fillText(rest.slice(0, len), 100, y)
        y += 64
        rest = rest.slice(len)
        if (y > CARD_H - 220) break
      }
      y += 24
      if (y > CARD_H - 220) {
        ctx.fillStyle = '#97928a'
        ctx.font = '400 32px -apple-system, sans-serif'
        ctx.fillText('……（内容过长，已截断）', 100, Math.min(y, CARD_H - 180))
        break
      }
    }
    // 页脚
    ctx.fillStyle = '#97928a'
    ctx.font = '400 28px -apple-system, sans-serif'
    ctx.fillText(`PWORK · 个人工作台 · ${todayLocal()}`, 100, CARD_H - 120)

    if (prevUrl.current) URL.revokeObjectURL(prevUrl.current)
    const u = canvas.toDataURL('image/png')
    prevUrl.current = u
    canvasRef.current = canvas
    setUrl(u)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-3)' }}>
      <div className="set-row">
        <label>标题（可选）</label>
        <input className="input" value={title} placeholder="默认：PWORK 卡片" onChange={(e) => setTitle(e.target.value)} aria-label="卡片标题" />
      </div>
      <div className="set-row" style={{ alignItems: 'flex-start' }}>
        <label>正文</label>
        <textarea
          className="input"
          style={{ minHeight: 140, resize: 'vertical', lineHeight: 1.8, flex: 1 }}
          placeholder="写点什么……（每行一段，自动换行排版）"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          aria-label="卡片正文"
        />
      </div>
      <div className="set-row">
        <button type="button" className="btn-primary" disabled={!body.trim()} onClick={generate} data-testid="card-gen-btn">
          生成卡片
        </button>
        {url && (
          <a href={url} download={`pwork-card-${todayLocal()}.png`} className="btn-ghost" style={{ textDecoration: 'none' }}>
            ⬇ 下载 PNG
          </a>
        )}
      </div>
      {url && <img src={url} alt="卡片预览" style={{ maxWidth: 420, borderRadius: 'var(--r-md)', border: '1px solid var(--line)', alignSelf: 'center' }} />}
    </div>
  )
}
