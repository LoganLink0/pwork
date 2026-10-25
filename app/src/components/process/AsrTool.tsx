import { useEffect, useRef, useState } from 'react'
import { useNotes } from '../../store/notes'

/** 浏览器语音识别的最小类型（Chrome/Edge 实现） */
interface SpeechRecognitionLike {
  lang: string
  continuous: boolean
  interimResults: boolean
  start(): void
  stop(): void
  onresult: ((e: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null
  onerror: ((e: { error?: string }) => void) | null
  onend: (() => void) | null
}

function getRecognition(): SpeechRecognitionLike | null {
  const w = window as unknown as { SpeechRecognition?: new () => SpeechRecognitionLike; webkitSpeechRecognition?: new () => SpeechRecognitionLike }
  const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition
  return Ctor ? new Ctor() : null
}

/** 录音转文字：浏览器实时识别（Chrome/Edge 支持最好），结果可一键存为速记 */
export function AsrTool() {
  const createNote = useNotes((s) => s.create)
  const [supported, setSupported] = useState(true)
  const [listening, setListening] = useState(false)
  const [finalText, setFinalText] = useState('')
  const [interim, setInterim] = useState('')
  const [errorMsg, setErrorMsg] = useState('')
  const [savedMsg, setSavedMsg] = useState('')
  const recRef = useRef<SpeechRecognitionLike | null>(null)

  useEffect(() => {
    setSupported(getRecognition() !== null)
    return () => recRef.current?.stop()
  }, [])

  if (!supported) {
    return (
      <div className="notice" role="alert">
        当前浏览器不支持语音识别（SpeechRecognition）。请使用 Chrome / Edge；Firefox 与 Safari 暂不支持。
      </div>
    )
  }

  const start = () => {
    const rec = getRecognition()
    if (!rec) return
    rec.lang = 'zh-CN'
    rec.continuous = true
    rec.interimResults = true
    rec.onresult = (e) => {
      let interimBuf = ''
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i]
        if (r.isFinal) setFinalText((prev) => (prev ? prev + r[0].transcript : r[0].transcript))
        else interimBuf += r[0].transcript
      }
      setInterim(interimBuf)
    }
    rec.onerror = (ev) => {
      setErrorMsg(
        ev.error === 'not-allowed'
          ? '麦克风权限被拒绝——请在浏览器地址栏允许麦克风后重试'
          : ev.error === 'no-speech'
            ? '没有听到说话'
            : `识别错误：${ev.error ?? '未知'}`,
      )
      setListening(false)
    }
    rec.onend = () => setListening(false)
    recRef.current = rec
    setErrorMsg('')
    setSavedMsg('')
    rec.start()
    setListening(true)
  }

  const stop = () => {
    recRef.current?.stop()
    setListening(false)
    setInterim('')
  }

  const saveAsNote = async () => {
    const text = (finalText + interim).trim()
    if (!text) return
    await createNote({ body: text, tags: ['语音'], source: 'quick' })
    setSavedMsg('已存为速记（输入 → 速记）')
  }

  const fullText = (finalText + interim).trim()

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-3)' }}>
      <div className="set-row">
        {!listening ? (
          <button type="button" className="btn-primary" onClick={start}>开始录音转写</button>
        ) : (
          <button type="button" className="btn-ghost" onClick={stop}>■ 停止</button>
        )}
        {listening && (
          <span className="val" style={{ color: 'var(--accent-text)', fontWeight: 600 }}>
            ● 正在聆听{interim ? `……${interim.slice(-20)}` : '……'}
          </span>
        )}
      </div>
      {errorMsg && <div className="notice" style={{ borderLeftColor: 'var(--danger)' }} role="alert">{errorMsg}</div>}
      <textarea
        className="input"
        style={{ minHeight: 140, resize: 'vertical', lineHeight: 1.8 }}
        placeholder="识别结果会出现在这里……"
        value={fullText}
        onChange={(e) => setFinalText(e.target.value)}
        aria-label="识别结果"
      />
      <div className="set-row">
        <button type="button" className="btn-ghost" disabled={!fullText} onClick={() => void saveAsNote()}>
          存为速记
        </button>
        <button
          type="button"
          className="btn-ghost"
          disabled={!fullText}
          onClick={() =>
            void navigator.clipboard
              .writeText(fullText)
              .then(() => setSavedMsg('已复制到剪贴板'))
              .catch(() => setSavedMsg('复制失败：浏览器未授权剪贴板'))
          }
        >
          复制
        </button>
        {savedMsg && <span className="val" style={{ color: 'var(--ok)', fontSize: 'var(--fs-xs)' }}>{savedMsg}</span>}
      </div>
      <p style={{ fontSize: 'var(--fs-xs)', color: 'var(--ink-faint)' }}>
        识别由浏览器引擎完成（免费，但 Chrome/Edge 会联网到其服务）；嘈杂环境与长音频建议后续用「高质量语音识别」（BYOK，待点亮）。
      </p>
    </div>
  )
}
