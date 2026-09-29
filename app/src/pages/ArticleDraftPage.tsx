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
import { chatCompletionCached } from '../engine/aiCached'
import { llmConfigured } from '../modules/review/engine/coach'
import { exportArticleDocx, ARTICLE_VIEWS, type ArticleView } from '../engine/articleWriter'
import { ArticleEditor } from '../components/writer/ArticleEditor'

const coachReady = llmConfigured

/** 文章草稿（输出 O4 实装）：速记与洞察按周期聚合 → AI 整理骨架（人逐节修改）→ 导出 Markdown */
export function ArticleDraftPage() {
  const [days, setDays] = useState(7)
  const [materials, setMaterials] = useState<ArticleMaterial[]>([])
  const [loaded, setLoaded] = useState(false)

  const [draft, setDraft] = useState<ArticleDraft | null>(null)
  const [aiBusy, setAiBusy] = useState(false)
  const [aiError, setAiError] = useState('')
  const [exportMsg, setExportMsg] = useState('')
  const [view, setView] = useState<ArticleView>(ARTICLE_VIEWS[0]!)
  const [docxMsg, setDocxMsg] = useState('')

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
      // 材料指纹进缓存键：周期/材料/视角没变的重复生成直接复用，不重复计费
      const inputKey = [days, view.id, ...materials.map((m) => `${m.id}:${m.body.length}`)].join('|')
      const { text } = await chatCompletionCached({
        purpose: 'article-draft',
        inputKey,
        system: ARTICLE_SYSTEM_PROMPT,
        user: buildArticleUserPrompt({ days, materials, view }),
        maxTokens: 8000,
      })
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
          {draft === null && materials.length > 0 && (
            <div className="set-row">
              <label>整理视角</label>
              <div className="radio">
                {ARTICLE_VIEWS.map((v) => (
                  <button key={v.id} type="button" className={view.id === v.id ? 'on' : ''} onClick={() => setView(v)}>
                    {v.name}
                  </button>
                ))}
              </div>
            </div>
          )}
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
            <ArticleEditor draft={draft} onChange={setDraft} />
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
            <button
              type="button"
              className="btn-ghost"
              disabled={!draft}
              onClick={async () => {
                if (!draft) return
                const name = await exportArticleDocx(draft)
                setDocxMsg(`✅ 已下载 ${name}`)
              }}
            >
              ⬇ 下载 Word（.docx）
            </button>
            {docxMsg && <span className="val" style={{ fontSize: 'var(--fs-xs)' }}>{docxMsg}</span>}
            {exportMsg && <span className="val" style={{ fontSize: 'var(--fs-xs)' }}>{exportMsg}</span>}
          </div>
        </div>
      </div>
    </section>
  )
}
