import { useRef, useState } from 'react'
import { useNotes } from '../../store/notes'

type Stage = 'idle' | 'loading' | 'recognizing' | 'done' | 'error'

/** 图片识别文字：tesseract.js 本地 OCR（中英文），首次使用懒加载引擎与中文语言包 */
export function OcrTool() {
  const createNote = useNotes((s) => s.create)
  const [stage, setStage] = useState<Stage>('idle')
  const [progress, setProgress] = useState(0)
  const [statusText, setStatusText] = useState('')
  const [text, setText] = useState('')
  const [errorMsg, setErrorMsg] = useState('')
  const [preview, setPreview] = useState<string | null>(null)
  const fileRef = useRef<File | null>(null)
  const [savedMsg, setSavedMsg] = useState('')

  const onFile = (f: File | undefined) => {
    if (!f) return
    fileRef.current = f
    setPreview(URL.createObjectURL(f))
    setText('')
    setStage('idle')
    setErrorMsg('')
    setSavedMsg('')
  }

  const recognize = async () => {
    const file = fileRef.current
    if (!file || stage === 'loading' || stage === 'recognizing') return
    setStage('loading')
    setProgress(0)
    setErrorMsg('')
    try {
      setStatusText('加载识别引擎（首次约 15MB，一次即可）…')
      const { createWorker } = await import('tesseract.js')
      const worker = await createWorker('chi_sim+eng', 1, {
        logger: (m: { status: string; progress: number }) => {
          if (m.status.includes('loading')) {
            setStage('loading')
            setStatusText('加载语言包…')
            setProgress(m.progress)
          } else {
            setStage('recognizing')
            setStatusText('识别中…')
            setProgress(m.progress)
          }
        },
      })
      const { data } = await worker.recognize(file)
      await worker.terminate()
      setText((data.text ?? '').trim())
      setStage('done')
      setProgress(1)
    } catch (e) {
      setStage('error')
      setErrorMsg(e instanceof Error ? e.message : String(e))
    }
  }

  const saveAsNote = async () => {
    if (!text.trim()) return
    await createNote({ body: text, tags: ['OCR'], source: 'quick' })
    setSavedMsg('已存为速记')
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-3)' }}>
      <div className="set-row">
        <label>选择图片</label>
        <input type="file" accept="image/*" onChange={(e) => onFile(e.target.files?.[0])} aria-label="选择图片" />
      </div>
      {preview && <img src={preview} alt="预览" style={{ maxWidth: '100%', maxHeight: 280, borderRadius: 'var(--r-md)', border: '1px solid var(--line)' }} />}
      <div className="set-row">
        <button type="button" className="btn-primary" disabled={!fileRef.current || stage === 'loading' || stage === 'recognizing'} onClick={() => void recognize()}>
          {stage === 'loading' || stage === 'recognizing' ? '识别中…' : '开始识别'}
        </button>
        {stage === 'loading' || stage === 'recognizing' ? (
          <span className="val" style={{ flex: 1 }}>
            {statusText} <progress value={progress} max={1} style={{ width: 140, verticalAlign: 'middle' }} />
          </span>
        ) : null}
      </div>
      {stage === 'error' && (
        <div className="notice" style={{ borderLeftColor: 'var(--danger)' }} role="alert">
          识别失败：{errorMsg}（首次使用需联网加载引擎；检查网络后重试）
        </div>
      )}
      {stage === 'done' && (
        <>
          <textarea
            className="input"
            style={{ minHeight: 140, resize: 'vertical', lineHeight: 1.8 }}
            value={text}
            onChange={(e) => setText(e.target.value)}
            aria-label="识别结果"
          />
          <div className="set-row">
            <button type="button" className="btn-ghost" disabled={!text.trim()} onClick={() => void saveAsNote()}>存为速记</button>
            <button type="button" className="btn-ghost" disabled={!text.trim()} onClick={() => void navigator.clipboard.writeText(text).then(() => setSavedMsg('已复制'))}>复制</button>
            {savedMsg && <span className="val" style={{ color: 'var(--ok)', fontSize: 'var(--fs-xs)' }}>{savedMsg}</span>}
          </div>
        </>
      )}
    </div>
  )
}
