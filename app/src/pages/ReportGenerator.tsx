import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { gatherReportData, type ReportData, type ReportMode } from '../engine/reportData'
import { reportToHtml, reportToMarkdown, reportTitle } from '../engine/reportRender'
import { downloadFile } from '../db/repo'
import { chatCompletion } from '../modules/review/engine/llm'
import { loadCoachConfig, llmConfigFrom } from '../modules/review/engine/coach'
import { todayLocal } from '../engine/datetime'

const coachReady = () => Boolean(loadCoachConfig().apiKey)

/** 报告生成器（输出 O1）：素材自动汇总 → Markdown/HTML 成稿 → 下载/朗读/AI 润色 */
export function ReportGenerator() {
  const [mode, setMode] = useState<ReportMode>('weekly')
  const [data, setData] = useState<ReportData | null>(null)
  const [format, setFormat] = useState<'md' | 'html'>('md')
  const [aiSummary, setAiSummary] = useState('')
  const [aiState, setAiState] = useState<'idle' | 'running' | 'error'>('idle')
  const [aiError, setAiError] = useState('')

  useEffect(() => {
    void gatherReportData(mode).then(setData)
  }, [mode])

  const md = useMemo(() => (data ? reportToMarkdown(data) : ''), [data])
  const html = useMemo(() => (data ? reportToHtml(data) : ''), [data])
  const title = data ? reportTitle(data) : '报告'
  const mdWithAi = aiSummary ? `${md}\n\n> 🤖 AI 摘要：${aiSummary}\n` : md

  const runAi = async () => {
    if (!data || aiState === 'running') return
    setAiState('running')
    setAiError('')
    try {
      const facts = [
        `闭环率 ${data.tasks.closureRate}%，闭环 ${data.tasks.closed.length} 项，逾期 ${data.tasks.overdueCount} 项`,
        `进行中目标 ${data.goals.active.length} 个`,
        `新洞察 ${data.insights.length} 条`,
        `高分条目 ${data.topItems.length} 条`,
      ].join('；')
      const text = await chatCompletion(
        llmConfigFrom(loadCoachConfig()),
        '你是个人周报助理。根据给定事实写 2-3 句持平的总结：一句肯定，一句指出风险或欠账，一句给出下周建议。不夸赞不煽情。',
        facts,
        { maxTokens: 200 },
      )
      setAiSummary(text.trim())
      setAiState('idle')
    } catch (e) {
      setAiError(e instanceof Error ? e.message : String(e))
      setAiState('error')
    }
  }

  const download = (kind: 'md' | 'html') => {
    const content = kind === 'md' ? mdWithAi : html
    downloadFile(`${title}.${kind}`, content, kind === 'md' ? 'text/markdown' : 'text/html')
  }

  return (
    <section className="settings" style={{ maxWidth: 'var(--content-w)' }}>
      <div className="page-head">
        <h1>报告生成器</h1>
        <span className="sub">素材自动汇总（任务/目标/洞察/外部环境）→ 一键成稿</span>
        <div className="right">
          <Link to="/output" className="btn-ghost">← 输出工具箱</Link>
        </div>
      </div>

      <div className="set-card">
        <div className="set-body">
          <div className="set-row">
            <label>周期</label>
            <div className="radio">
              <button type="button" className={mode === 'weekly' ? 'on' : ''} onClick={() => setMode('weekly')}>周报（近 7 天）</button>
              <button type="button" className={mode === 'monthly' ? 'on' : ''} onClick={() => setMode('monthly')}>月报（近 30 天）</button>
            </div>
            <span className="val" style={{ color: 'var(--ink-faint)', fontSize: 'var(--fs-xs)' }}>
              数据截至 {todayLocal()} · 只读引用，零拷贝
            </span>
          </div>

          {data && (
            <div className="stats" style={{ display: 'flex', gap: 16, flexWrap: 'wrap', paddingTop: 'var(--sp-2)' }}>
              {[
                [data.tasks.closureRate + '%', '闭环率'],
                [String(data.tasks.closed.length), '本期闭环'],
                [String(data.goals.active.length), '进行中目标'],
                [String(data.insights.length), '新增洞察'],
              ].map(([v, l]) => (
                <div key={l} style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 'var(--r-md)', padding: '10px 18px', minWidth: 110 }}>
                  <div style={{ fontSize: 'var(--fs-num)', fontWeight: 700 }}>{v}</div>
                  <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--ink-faint)' }}>{l}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="set-card">
        <h2>AI 润色（可选）</h2>
        <div className="desc">让 AI 基于本期事实写一段持平的总结——不配 Key 可跳过，报告照常成稿</div>
        <div className="set-body">
          {coachReady() ? (
            <div className="set-row">
              <button type="button" className="btn-ghost" disabled={aiState === 'running'} onClick={() => void runAi()} data-testid="ai-summary-btn">
                {aiState === 'running' ? '生成中…' : '🤖 AI 写总结段'}
              </button>
              {aiSummary && <span className="val" style={{ fontSize: 'var(--fs-xs)', color: 'var(--ok)' }}>已生成，见报告末尾</span>}
              {aiState === 'error' && <span className="val" style={{ fontSize: 'var(--fs-xs)', color: 'var(--danger)' }}>{aiError}</span>}
            </div>
          ) : (
            <div className="notice">
              BYOK 未配置——跳过即可；需要时到 <Link to="/settings">设置 → AI · BYOK</Link> 配置。
            </div>
          )}
        </div>
      </div>

      <div className="set-card">
        <h2>成稿预览与交付</h2>
        <div className="desc">Markdown 存 vault / HTML 直接发送</div>
        <div className="set-body">
          <div className="set-row">
            <div className="radio">
              <button type="button" className={format === 'md' ? 'on' : ''} onClick={() => setFormat('md')}>Markdown</button>
              <button type="button" className={format === 'html' ? 'on' : ''} onClick={() => setFormat('html')}>HTML</button>
            </div>
            <button type="button" className="btn-ghost" onClick={() => download('md')} disabled={!data}>⬇ 下载 .md</button>
            <button type="button" className="btn-ghost" onClick={() => download('html')} disabled={!data}>⬇ 下载 .html</button>
            <Link to="/output/read" className="btn-ghost">🎧 朗读版 →</Link>
          </div>
          <pre
            style={{
              background: 'var(--surface-2)',
              border: '1px solid var(--line)',
              borderRadius: 'var(--r-md)',
              padding: 'var(--sp-4)',
              fontSize: 'var(--fs-xs)',
              lineHeight: 1.8,
              whiteSpace: 'pre-wrap',
              maxHeight: 360,
              overflow: 'auto',
            }}
            data-testid="report-preview"
          >
            {format === 'md' ? mdWithAi : 'HTML 版请下载后用浏览器打开（自包含单文件，v3 配色）。'}
          </pre>
        </div>
      </div>
    </section>
  )
}
