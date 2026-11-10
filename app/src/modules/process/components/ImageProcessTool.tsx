import { useRef, useState } from 'react'
import { toast } from '../../../engine/toast'

/** 图片压缩 / 缩放 / 格式转换：纯 Canvas 本地处理 */
export function ImageProcessTool() {
  const [file, setFile] = useState<File | null>(null)
  const [srcUrl, setSrcUrl] = useState<string | null>(null)
  const [srcSize, setSrcSize] = useState({ w: 0, h: 0 })
  const [maxWidthPct, setMaxWidthPct] = useState(100)
  const [format, setFormat] = useState<'jpeg' | 'webp' | 'png'>('jpeg')
  const [quality, setQuality] = useState(0.85)
  const [result, setResult] = useState<{ url: string; size: number; w: number; h: number } | null>(null)
  const imgRef = useRef<HTMLImageElement | null>(null)
  const prevUrl = useRef<string | null>(null)

  const onFile = (f: File | undefined) => {
    if (!f) return
    setFile(f)
    setResult(null)
    imgRef.current = null  // 换文件先清旧图：坏文件零反馈时不得拿上一张图出结果（盲审 P1）
    if (prevUrl.current) URL.revokeObjectURL(prevUrl.current)
    const url = URL.createObjectURL(f)
    setSrcUrl(url)
    const img = new Image()
    img.onload = () => {
      imgRef.current = img
      setSrcSize({ w: img.naturalWidth, h: img.naturalHeight })
    }
    img.onerror = () => {
      // 无法解码（盲审 P1：此前零反馈，控件照常展示误导用户）
      imgRef.current = null
      toast('error', '这个文件无法作为图片打开——换一张图片试试')
    }
    img.src = url
  }

  const process = () => {
    const img = imgRef.current
    if (!img) {
      toast('error', '还没有可处理的图片——重新选择一张能打开的图片')
      return
    }
    const targetW = Math.max(1, Math.round(img.naturalWidth * (maxWidthPct / 100)))
    const targetH = Math.round(img.naturalHeight * (targetW / img.naturalWidth))
    const canvas = document.createElement('canvas')
    canvas.width = targetW
    canvas.height = targetH
    const ctx = canvas.getContext('2d')!
    // 有损格式（jpeg/webp）先铺白底：透明 PNG 直接 drawImage 会转出黑底（盲审 P2 实测）
    if (format !== 'png') {
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, targetW, targetH)
    }
    ctx.drawImage(img, 0, 0, targetW, targetH)
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          toast('error', `这个浏览器不支持编码 ${format.toUpperCase()}——换 PNG 格式试试`)
          return
        }
        if (prevUrl.current) URL.revokeObjectURL(prevUrl.current)
        const url = URL.createObjectURL(blob)
        prevUrl.current = url
        setResult({ url, size: blob.size, w: targetW, h: targetH })
      },
      `image/${format}`,
      quality,
    )
  }

  const fmtSize = (n: number) => (n < 1024 * 1024 ? `${(n / 1024).toFixed(0)} KB` : `${(n / 1024 / 1024).toFixed(2)} MB`)
  const ext = format === 'jpeg' ? 'jpg' : format

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-3)' }}>
      <div className="set-row">
        <label>选择图片</label>
        <input type="file" accept="image/*" onChange={(e) => onFile(e.target.files?.[0])} aria-label="选择图片" />
      </div>
      {srcUrl && (
        <img src={srcUrl} alt="原图" style={{ maxWidth: '100%', maxHeight: 240, borderRadius: 'var(--r-md)', border: '1px solid var(--line)' }} />
      )}
      {file && (
        <>
          <div className="set-row">
            <label>宽度</label>
            <input type="range" min={10} max={100} step={5} value={maxWidthPct} onChange={(e) => setMaxWidthPct(Number(e.target.value))} aria-label="宽度百分比" />
            <span className="val tnum">{maxWidthPct}%（{Math.round(srcSize.w * maxWidthPct / 100)} px）</span>
          </div>
          <div className="set-row">
            <label>格式</label>
            <div className="radio">
              {(['jpeg', 'webp', 'png'] as const).map((f) => (
                <button key={f} type="button" className={format === f ? 'on' : ''} onClick={() => setFormat(f)}>{f.toUpperCase()}</button>
              ))}
            </div>
          </div>
          {format !== 'png' && (
            <div className="set-row">
              <label>质量</label>
              <input type="range" min={0.3} max={1} step={0.05} value={quality} onChange={(e) => setQuality(Number(e.target.value))} aria-label="质量" />
              <span className="val tnum">{Math.round(quality * 100)}%</span>
            </div>
          )}
          <div className="set-row">
            <button type="button" className="btn-primary" onClick={process} data-testid="img-process-btn">处理图片</button>
            <span className="val" style={{ color: 'var(--ink-faint)', fontSize: 'var(--fs-xs)' }}>原图 {fmtSize(file.size)} · 本地处理，不上传</span>
          </div>
          {result && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-2)' }}>
              {/* 处理结果预览（盲审 P1：产物此前不可见、下载链接是空文本） */}
              <img
                src={result.url}
                alt="处理后预览"
                style={{ maxWidth: '100%', maxHeight: 240, borderRadius: 'var(--r-md)', border: '1px solid var(--line-strong)' }}
              />
              <div className="notice">
                {result.w}×{result.h} · {fmtSize(result.size)}
                {file.size > 0 && result.size < file.size && <>（比原图小 {Math.round((1 - result.size / file.size) * 100)}%）</>}　
                <a href={result.url} download={`image.${ext}`} className="btn-ghost" style={{ textDecoration: 'none' }}>下载 {ext.toUpperCase()}</a>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
