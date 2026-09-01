import { useEffect, useState } from 'react'

/** 文字转语音：浏览器本地合成（speechSynthesis），离线可用 */
export function TtsTool() {
  const [text, setText] = useState('')
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([])
  const [voiceIdx, setVoiceIdx] = useState(0)
  const [rate, setRate] = useState(1)
  const [speaking, setSpeaking] = useState(false)
  const supported = typeof window !== 'undefined' && 'speechSynthesis' in window

  useEffect(() => {
    if (!supported) return
    const load = () => {
      const all = window.speechSynthesis.getVoices()
      const zh = all.filter((v) => v.lang.toLowerCase().startsWith('zh'))
      const list = zh.length > 0 ? [...zh, ...all.filter((v) => !zh.includes(v))] : all
      setVoices(list)
    }
    load()
    window.speechSynthesis.addEventListener('voiceschanged', load)
    return () => {
      window.speechSynthesis.removeEventListener('voiceschanged', load)
      window.speechSynthesis.cancel()
    }
  }, [supported])

  const speak = () => {
    if (!text.trim()) return
    window.speechSynthesis.cancel()
    const u = new SpeechSynthesisUtterance(text)
    if (voices[voiceIdx]) u.voice = voices[voiceIdx]!
    u.rate = rate
    u.lang = voices[voiceIdx]?.lang ?? 'zh-CN'
    u.onend = () => setSpeaking(false)
    u.onerror = () => setSpeaking(false)
    window.speechSynthesis.speak(u)
    setSpeaking(true)
  }

  const stop = () => {
    window.speechSynthesis.cancel()
    setSpeaking(false)
  }

  if (!supported) {
    return (
      <div className="notice" role="alert">
        当前浏览器不支持语音合成（speechSynthesis）。请使用 Chrome / Edge / Safari 等现代浏览器。
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-3)' }}>
      <textarea
        className="input"
        style={{ minHeight: 160, resize: 'vertical', lineHeight: 1.8 }}
        placeholder="粘贴要朗读的文字…"
        value={text}
        onChange={(e) => setText(e.target.value)}
        aria-label="要朗读的文字"
      />
      <div className="set-row">
        <label style={{ width: 60 }}>音色</label>
        <select className="input" style={{ flex: 1 }} value={voiceIdx} onChange={(e) => setVoiceIdx(Number(e.target.value))} aria-label="音色">
          {voices.length === 0 && <option>（系统默认）</option>}
          {voices.map((v, i) => (
            <option key={v.name + i} value={i}>{v.name}（{v.lang}）</option>
          ))}
        </select>
      </div>
      <div className="set-row">
        <label style={{ width: 60 }}>语速</label>
        <input type="range" min={0.5} max={2} step={0.1} value={rate} onChange={(e) => setRate(Number(e.target.value))} aria-label="语速" />
        <span className="val tnum">{rate.toFixed(1)}x</span>
      </div>
      <div className="set-row">
        {!speaking ? (
          <button type="button" className="btn-primary" disabled={!text.trim()} onClick={speak}>▶ 朗读</button>
        ) : (
          <button type="button" className="btn-ghost" onClick={stop}>■ 停止</button>
        )}
      </div>
    </div>
  )
}
