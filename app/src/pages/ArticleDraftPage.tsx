import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ARTICLE_SYSTEM_PROMPT,
  articleToMarkdown,
  buildArticleUserPrompt,
  defaultArticleSkeleton,
  gatherArticleMaterials,
  parseArticle,
  type ArticleDraft,
  type ArticleMaterial,
} from '../engine/articleWriter'
import { downloadFile } from '../db/repo'
import { chatCompletion } from '../modules/review/engine/llm'
import { loadCoachConfig, llmConfigFrom } from '../modules/review/engine/coach'

const coachReady = () => Boolean(loadCoachConfig().apiKey)

/** 文章草稿（输出 O4 实装）：速记与洞察按周期聚合 → AI 整理骨架（人逐节修改）→ 导出 Markdown */
export function ArticleDraftPage() {
  const [days, setDays] = useState(7)
  const [materials, setMaterials] = useState<ArticleMaterial[]>([])
  const [loaded, setLoaded] = useState(false)

  const [draft, setDraft] = useState<ArticleDraft | null>(null)
  const [aiBusy, setAiBusy] = useState(false)
  const [aiError, setAiError] = useState('')
  const [exportMsg, setExportMsg] = useState('')

  useEffect(() => {
    void gatherArticleMaterials(days).then((m) => {
      setMaterials(m)
      setLoaded(true)
    })
  }, [days])

  const noteCount = materials.filter((m) => m.kind === 'note').length
  const insightCount = materials.filter((m) => m.kind === 'insight').length
  const totalChars = materials.reduce((n, m) => n + m.body.length, 0)

  const generate = async () => {
    if (aiBusy || materials.length === 0) return
    setAiBusy(true)
    setAiError('')
    try {
      const text = await chatCompletion(
        llmConfigFrom(loadCoachConfig()),
        ARTICLE_SYSTEM_PROMPT,
        buildArticleUserPrompt(days, materials),
        { maxTokens: 4000 },
      )
      setDraft(parseArticle(text))
    } catch (e) {
      setAiError(e instanceof Error ? e.message : String(e))
    } finally {
      setAiBusy(false)
    }
  }

  const doExport = () => {
    if (!draft) return
    downloadFile(`${draft.title}.md`, articleToMarkdown(draft), 'text/markdown')
    setExportMsg(`✅ 已下载 ${draft.title}.md`)
  }

  const updateSection = (i: number, patch: Partial<{ heading: string; body: string }>) => {
    if (!draft) return
    setDraft({ ...draft, sections: draft.sections.map((s, idx) => (idx === i ? { ...s, ...patch } : s)) })
  }
  const moveSection = (i: number, dir: -1 | 1) => {
    if (!draft) return
    const j = i + dir
    if (j < 0 || j >= draft.sections.length) return
    const sections = [...draft.sections]
    ;[sections[i], sections[j]] = [sections[j]!, sections[i]!]
    setDraft({ ...draft, sections })
  }

  return (
    <section className="settings" style={{ maxWidth: 'var(--content-w)' }}>
      <div className="page-head">
        <h1>文章草稿</h1>
        <span className="sub">速记与洞察按周期聚合成素材 → AI 整理骨架（你逐节修改）→ 导出 Markdown</span>
        <div className="right">
          <Link to="/output" className="btn-ghost">← 输出工具箱</Link>
        </div>
      </div>

      <div className="set-card">
        <h2>一、素材范围</h2>
        <div className="desc">文章的原料来自这段时间的速记与复盘产出的洞察卡。</div>
        <div className="set-body">
          <div className="set-row">
            <label>周期</label>
            <div className="radio">
              <button type="button" className={days === 7 ? 'on' : ''} onClick={() => setDays(7)}>近 7 天</button>
              <button type="button" className={days === 30 ? 'on' : ''} onClick={() => setDays(30)}>近 30 天</button>
            </div>
            {loaded && (
              <span className="val" style={{ color: 'var(--ink-faint)', fontSize: 'var(--fs-xs)' }}>
                速记 {noteCount} 条 · 洞察 {insightCount} 条 · 共 {totalChars} 字
              </span>
            )}
          </div>
          {loaded && materials.length > 0 && (
            <div className="set-row" style={{ alignItems: 'flex-start' }}>
              <div style={{ flex: 1, minWidth: 0, fontSize: 'var(--fs-xs)', color: 'var(--ink-faint)', lineHeight: 1.9 }}>
                {materials.slice(0, 12).map((m) => (
                  <div key={m.id}>
                    {m.kind === 'note' ? '✎' : '💡'} {m.title}（{m.body.length} 字）
                  </div>
                ))}
                {materials.length > 12 && <div>…其余 {materials.length - 12} 条</div>}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="set-card">
        <h2>二、AI 整理骨架（可选）</h2>
        <div className="desc">AI 把素材组织成有标题、有开头、分了节的草稿。事实与数字只来自素材，缺的地方会标注（此处待补充）。</div>
        <div className="set-body">
          {draft === null ? (
            <div className="set-row" style={{ flexWrap: 'wrap' }}>
              <button
                type="button"
                className="btn-primary"
                disabled={!materials.length || aiBusy || !coachReady()}
                onClick={() => void generate()}
                data-testid="article-generate"
              >
                {aiBusy ? '⟳ AI 整理中…' : '🤖 AI 整理成文章骨架'}
              </button>
              <button type="button" className="btn-ghost" onClick={() => setDraft(defaultArticleSkeleton())}>
                用手动骨架（不需要 AI）
              </button>
              {!coachReady() && (
                <span className="val" style={{ fontSize: 'var(--fs-xs)', color: 'var(--ink-faint)' }}>
                  AI 需要先在 <Link to="/settings">设置 → AI · BYOK</Link> 配置。
                </span>
              )}
              {!materials.length && (
                <span className="val" style={{ fontSize: 'var(--fs-xs)', color: 'var(--ink-faint)' }}>这段时间还没有速记或洞察。</span>
              )}
              {aiError && <span className="val" style={{ fontSize: 'var(--fs-xs)', color: 'var(--danger)' }}>{aiError}</span>}
            </div>
          ) : (
            <div className="set-row">
              <span className="val" style={{ fontSize: 'var(--fs-xs)', color: 'var(--ok)' }}>骨架已生成，在下方逐节修改。</span>
            </div>
          )}
        </div>
      </div>

      {draft && (
        <div className="set-card">
          <h2>三、文章草稿（可编辑）</h2>
          <div className="set-body">
            <div className="set-row">
              <label>标题</label>
              <input
                className="input"
                style={{ flex: 1 }}
                value={draft.title}
                aria-label="文章标题"
                onChange={(e) => setDraft({ ...draft, title: e.target.value })}
              />
            </div>
            <div className="set-row" style={{ alignItems: 'flex-start' }}>
              <label>开头</label>
              <textarea
                className="input"
                rows={3}
                value={draft.intro}
                aria-label="文章开头"
                onChange={(e) => setDraft({ ...draft, intro: e.target.value })}
              />
            </div>
            {draft.sections.map((s, i) => (
              <div
                key={i}
                className="set-row"
                style={{ flexDirection: 'column', alignItems: 'stretch', gap: 'var(--sp-2)', border: '1px solid var(--line)', borderRadius: 'var(--r-md)', padding: 'var(--sp-3)' }}
              >
                <div style={{ display: 'flex', gap: 'var(--sp-2)', alignItems: 'center' }}>
                  <span className="val tnum" style={{ fontSize: 'var(--fs-xs)', color: 'var(--ink-faint)' }}>{i + 1}</span>
                  <input
                    className="input"
                    style={{ flex: 1 }}
                    value={s.heading}
                    aria-label={`第 ${i + 1} 节标题`}
                    onChange={(e) => updateSection(i, { heading: e.target.value })}
                  />
                  <button type="button" className="mini-btn" title="上移" onClick={() => moveSection(i, -1)}>↑</button>
                  <button type="button" className="mini-btn" title="下移" onClick={() => moveSection(i, 1)}>↓</button>
                  <button
                    type="button"
                    className="mini-btn"
                    onClick={() => setDraft({ ...draft, sections: draft.sections.filter((_, idx) => idx !== i) })}
                  >
                    删除
                  </button>
                </div>
                <textarea
                  className="input"
                  rows={4}
                  value={s.body}
                  aria-label={`第 ${i + 1} 节内容`}
                  onChange={(e) => updateSection(i, { body: e.target.value })}
                />
              </div>
            ))}
            <div className="set-row">
              <button
                type="button"
                className="btn-ghost"
                onClick={() => setDraft({ ...draft, sections: [...draft.sections, { heading: '新的一节', body: '（待填）' }] })}
              >
                ＋ 加一节
              </button>
              <button type="button" className="btn-ghost" onClick={() => setDraft(null)}>丢弃草稿</button>
            </div>
          </div>
        </div>
      )}

      <div className="set-card">
        <h2>四、导出</h2>
        <div className="set-body">
          <div className="set-row">
            <button type="button" className="btn-primary" disabled={!draft} onClick={doExport} data-testid="article-export">
              ⬇ 下载 Markdown
            </button>
            {exportMsg && <span className="val" style={{ fontSize: 'var(--fs-xs)' }}>{exportMsg}</span>}
          </div>
        </div>
      </div>
    </section>
  )
}
