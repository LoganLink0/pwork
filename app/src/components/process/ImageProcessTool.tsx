import { useRef, useState } from 'react'

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
    if (prevUrl.current) URL.revokeObjectURL(prevUrl.current)
    const url = URL.createObjectURL(f)
    setSrcUrl(url)
    const img = new Image()
    img.onload = () => {
      imgRef.current = img
      setSrcSize({ w: img.naturalWidth, h: img.naturalHeight })
    }
    img.src = url
  }

  const process = () => {
    const img = imgRef.current
    if (!img) return
    const targetW = Math.max(1, Math.round(img.naturalWidth * (maxWidthPct / 100)))
    const targetH = Math.round(img.naturalHeight * (targetW / img.naturalWidth))
    const canvas = document.createElement('canvas')
    canvas.width = targetW
    canvas.height = targetH
    const ctx = canvas.getContext('2d')!
    ctx.drawImage(img, 0, 0, targetW, targetH)
    canvas.toBlob(
      (blob) => {
        if (!blob) return
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
            <div className="notice">
              ✅ 输出 {result.w}×{result.h} · {fmtSize(result.size)}
              {file.size > 0 && result.size < file.size && <>（比原图小 {Math.round((1 - result.size / file.size) * 100)}%）</>}　
              <a href={result.url} download={`image.${ext}`} className="btn-ghost" style={{ textDecoration: 'none' }}>⬇ 下载</a>
            </div>
          )}
        </>
      )}
    </div>
  )
}
