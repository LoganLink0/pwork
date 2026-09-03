import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { gatherReportData, type ReportData, type ReportMode } from '../engine/reportData'

const MODE_LABEL = { weekly: '周报', monthly: '月报' } as const

/** 朗读版（输出 O2）：把报告正文交给浏览器 TTS——通勤场景"听你的周报" */
export function ReadOutLoud() {
  const [mode, setMode] = useState<ReportMode>('weekly')
  const [data, setData] = useState<ReportData | null>(null)
  const [speaking, setSpeaking] = useState(false)
  const supported = typeof window !== 'undefined' && 'speechSynthesis' in window

  useEffect(() => {
    void gatherReportData(mode).then(setData)
    return () => window.speechSynthesis?.cancel()
  }, [mode])

  const speakText = useMemo(() => {
    if (!data) return ''
    const parts: string[] = [
      `${MODE_LABEL[mode]}，覆盖${data.rangeLabel}。`,
      `任务：闭环${data.tasks.closed.length}项，闭环率${data.tasks.closureRate}%；未闭环${data.tasks.openCount}项，逾期${data.tasks.overdueCount}项。`,
      data.tasks.closed[0] ? `已完成：${data.tasks.closed[0].title}。` : '',
      data.goals.active[0] ? `进行中目标：${data.goals.active[0].title}。` : '',
      data.insights[0] ? `本周洞察：${data.insights[0].text}。` : '',
      data.topItems[0] ? `外部环境，值得关注：${data.topItems[0].title}。` : '',
      data.signals[0] ? `提醒：${data.signals[0].message}。` : '',
    ]
    return parts.filter(Boolean).join('')
  }, [data, mode])

  const speak = () => {
    if (!speakText) return
    window.speechSynthesis.cancel()
    const u = new SpeechSynthesisUtterance(speakText)
    u.lang = 'zh-CN'
    u.rate = 1
    u.onend = () => setSpeaking(false)
    window.speechSynthesis.speak(u)
    setSpeaking(true)
  }

  const stop = () => {
    window.speechSynthesis.cancel()
    setSpeaking(false)
  }

  return (
    <section className="settings" style={{ maxWidth: 'var(--content-w)' }}>
      <div className="page-head">
        <h1>周报导出为朗读音频</h1>
        <span className="sub">报告正文 → 浏览器本地语音（通勤场景"听你的周报"）</span>
        <div className="right">
          <Link to="/output" className="btn-ghost">← 输出工具箱</Link>
        </div>
      </div>

      {!supported ? (
        <div className="notice" role="alert">当前浏览器不支持语音合成，请使用 Chrome / Edge / Safari。</div>
      ) : (
        <div className="set-card">
          <div className="set-body">
            <div className="set-row">
              <label>周期</label>
              <div className="radio">
                <button type="button" className={mode === 'weekly' ? 'on' : ''} onClick={() => setMode('weekly')}>周报</button>
                <button type="button" className={mode === 'monthly' ? 'on' : ''} onClick={() => setMode('monthly')}>月报</button>
              </div>
              {!speaking ? (
                <button type="button" className="btn-primary" disabled={!speakText} onClick={speak}>▶ 开始朗读</button>
              ) : (
                <button type="button" className="btn-ghost" onClick={stop}>■ 停止</button>
              )}
            </div>
            <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--ink-soft)', lineHeight: 2, paddingTop: 'var(--sp-2)' }} data-testid="speak-text">
              {speakText || '正在汇总本周期素材…'}
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
