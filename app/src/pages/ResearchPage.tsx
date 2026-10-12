import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useBlocks } from '../store/blocks'
import { useProfiles } from '../store/profiles'
import { fileToBlockContent } from '../engine/fileImport'
import {
  ARTICLE_VIEWS,
  ARTICLE_SYSTEM_PROMPT,
  articleToMarkdown,
  buildArticleUserPrompt,
  exportArticleDocx,
  parseArticle,
  type ArticleDraft,
  type ArticleMaterial,
  type ArticleView,
} from '../engine/articleWriter'
import { downloadFile } from '../db/repo'
import { chatCompletionCached } from '../engine/aiCached'
import { llmConfigured } from '../modules/review/engine/coach'
import { ArticleEditor } from '../components/writer/ArticleEditor'

/**
 * 调研分析（输出模块，2026-10-12 中方案）：任务式三步——选对象 → 贴材料 → 出稿。
 * 数据与 输入 → 外部数据 同库同构：那边负责管理（对象/数据块的日常维护），这里只管把一份调研做完。
 * 用户不必先理解"数据块"概念——在这里粘贴的每段材料自动挂到当前对象名下。
 */
export function ResearchPage() {
  const { blocks, load: loadBlocks, save: saveBlock, remove: removeBlock } = useBlocks()
  const { profiles, load: loadProfiles, save: saveProfile } = useProfiles()
  const [profileId, setProfileId] = useState<string | null>(null)
  const [newName, setNewName] = useState('')
  const [newKind, setNewKind] = useState('')
  const [pasting, setPasting] = useState<{ title: string; content: string } | null>(null)
  const [msg, setMsg] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  // 出稿
  const [view, setView] = useState<ArticleView>(ARTICLE_VIEWS[0]!)
  const [audience, setAudience] = useState<'internal' | 'client'>('client')
  const [draft, setDraft] = useState<ArticleDraft | null>(null)
  const [aiBusy, setAiBusy] = useState(false)
  const [aiError, setAiError] = useState('')

  useEffect(() => {
    void loadBlocks()
    void loadProfiles()
  }, [loadBlocks, loadProfiles])

  // 老用户直接进流程：已有对象时默认选中第一个
  useEffect(() => {
    if (!profileId && profiles.length) setProfileId(profiles[0]!.id)
  }, [profileId, profiles])

  const profile = profiles.find((p) => p.id === profileId) ?? null
  const materials = blocks.filter((b) => b.profileId === profileId)
  const articleMaterials: ArticleMaterial[] = materials.map((b) => ({
    id: b.id,
    kind: 'note' as const,
    title: b.title,
    body: b.content,
    createdAt: b.updatedAt,
    sourceLabel: '调研材料',
  }))

  const createProfile = async () => {
    if (!newName.trim()) return
    const p = await saveProfile({ name: newName, kind: newKind })
    setNewName('')
    setNewKind('')
    setProfileId(p.id)
    setMsg('')
  }

  const savePasted = async () => {
    if (!pasting || !pasting.title.trim() || !pasting.content.trim() || !profileId) return
    await saveBlock({ title: pasting.title, content: pasting.content, profileId, usage: 'client' })
    setPasting(null)
    setMsg('')
  }

  const onFile = async (file: File) => {
    if (!profileId) return
    try {
      const text = await file.text()
      const r = fileToBlockContent(file.name, text)
      await saveBlock({ title: file.name.replace(/\.[^.]+$/, ''), content: r.content, profileId, usage: 'client' })
      setMsg(r.note)
    } catch (e) {
      setMsg(`导入失败：${e instanceof Error ? e.message : '文件解析出错'}`)
    }
  }

  const generateAnalysis = async () => {
    if (aiBusy || articleMaterials.length === 0) return
    setAiBusy(true)
    setAiError('')
    try {
      // 材料指纹进缓存键：材料/视角/对象没变的重复生成直接复用，不重复计费
      const inputKey = ['research', view.id, audience, profileId ?? 'all', ...articleMaterials.map((m) => `${m.id}:${m.body.length}`)].join('|')
      const { text } = await chatCompletionCached({
        purpose: 'article-analysis',
        inputKey,
        system: ARTICLE_SYSTEM_PROMPT,
        user: buildArticleUserPrompt({ materials: articleMaterials, view, scopeLabel: profile?.name }),
        maxTokens: 8000,
      })
      setDraft(parseArticle(text))
    } catch (e) {
      setAiError(e instanceof Error ? e.message : String(e))
    } finally {
      setAiBusy(false)
    }
  }

  const doExport = (kind: 'md' | 'docx') => {
    if (!draft) return
    if (kind === 'md') downloadFile(`${draft.title}.md`, articleToMarkdown(draft), 'text/markdown')
    else void exportArticleDocx(draft)
  }

  return (
    <section className="settings" style={{ maxWidth: 'var(--content-w)' }}>
      <div className="page-head">
        <h1>调研分析</h1>
        <span className="sub">三步出一份调研：选对象 → 贴材料 → 出稿（Markdown / Word）</span>
      </div>

      <div className="set-card">
        <h2>① 调研对象</h2>
        <div className="desc">一家公司、一个客户、一个目标岗位都行——材料按对象归组，互不混</div>
        <div className="set-body">
          {profiles.length > 0 ? (
            <div className="chips" style={{ marginBottom: 'var(--sp-2)' }}>
              {profiles.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className={`chip${profileId === p.id ? ' on' : ''}`}
                  onClick={() => {
                    setProfileId(p.id)
                    setDraft(null)
                    setMsg('')
                  }}
                >
                  {p.name}
                </button>
              ))}
            </div>
          ) : (
            <div className="notice" style={{ marginBottom: 'var(--sp-2)' }}>还没有调研对象——在下面一行建一个，比如「XX 公司售前调研」。</div>
          )}
          <div className="set-row">
            <input
              className="input"
              style={{ maxWidth: 260 }}
              placeholder="新对象名称（如：XX 公司售前调研）"
              value={newName}
              aria-label="新调研对象名称"
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && void createProfile()}
            />
            <input
              className="input"
              style={{ maxWidth: 140 }}
              placeholder="标签（可选）"
              value={newKind}
              aria-label="新调研对象标签"
              onChange={(e) => setNewKind(e.target.value)}
            />
            <button type="button" className="btn-ghost" disabled={!newName.trim()} onClick={() => void createProfile()}>
              ＋ 建对象
            </button>
          </div>
        </div>
      </div>

      <div className="set-card">
        <h2>② 材料</h2>
        <div className="desc">{profile ? `挂在「${profile.name}」名下的材料，出稿只用这些` : '先在上方选中一个对象'}</div>
        <div className="set-body">
          {profile && (
            <>
              {materials.length === 0 && (
                <div className="notice" style={{ marginBottom: 'var(--sp-2)' }}>这个对象还没有材料——粘贴一段文字或导入文件开始。</div>
              )}
              {materials.map((b) => (
                <div className="set-row" key={b.id} style={{ alignItems: 'flex-start' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 'var(--fs-sm)', fontWeight: 600 }}>
                      {b.title}
                      {b.usage === 'client' && (
                        <span className="val" style={{ marginLeft: 8, fontSize: 'var(--fs-xs)', color: 'var(--ok)' }}>给客户</span>
                      )}
                    </div>
                    <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--ink-faint)', whiteSpace: 'pre-wrap', maxHeight: 60, overflow: 'hidden' }}>{b.content}</div>
                  </div>
                  <button
                    type="button"
                    className="mini-btn"
                    onClick={() => {
                      if (window.confirm(`删除材料「${b.title}」？（软删除，备份中仍可找回）`)) void removeBlock(b.id)
                    }}
                  >
                    删除
                  </button>
                </div>
              ))}
              {pasting ? (
                <div className="set-row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 'var(--sp-2)' }}>
                  <input
                    className="input"
                    placeholder="材料名称（如：官网介绍）"
                    value={pasting.title}
                    aria-label="材料名称"
                    onChange={(e) => setPasting({ ...pasting, title: e.target.value })}
                  />
                  <textarea
                    className="input"
                    rows={6}
                    placeholder={'粘贴材料内容。支持"键: 值"形态，例如：\n成立年份: 2015\n融资轮次: B 轮\n也可以是大段文字'}
                    value={pasting.content}
                    aria-label="材料内容"
                    onChange={(e) => setPasting({ ...pasting, content: e.target.value })}
                  />
                  <div style={{ display: 'flex', gap: 'var(--sp-2)' }}>
                    <button type="button" className="btn-primary" disabled={!pasting.title.trim() || !pasting.content.trim()} onClick={() => void savePasted()}>
                      保存材料
                    </button>
                    <button type="button" className="btn-ghost" onClick={() => setPasting(null)}>取消</button>
                  </div>
                </div>
              ) : (
                <div className="set-row">
                  <button type="button" className="btn-ghost" onClick={() => setPasting({ title: '', content: '' })} data-testid="paste-material">
                    ＋ 粘贴一段材料
                  </button>
                  <button type="button" className="btn-ghost" onClick={() => fileRef.current?.click()} data-testid="import-material">
                    ⬆ 导入文件（CSV/JSON/文本）
                  </button>
                  <input
                    ref={fileRef}
                    type="file"
                    accept=".csv,.json,.txt,.tsv,.md"
                    style={{ display: 'none' }}
                    aria-label="选择要导入的材料文件"
                    onChange={(e) => {
                      const f = e.target.files?.[0]
                      if (f) void onFile(f)
                      e.target.value = ''
                    }}
                  />
                </div>
              )}
              {msg && (
                <div className="set-row" role="status">
                  <span className="val" style={{ fontSize: 'var(--fs-xs)', color: 'var(--ink-faint)' }}>{msg}</span>
                </div>
              )}
              <div className="notice" style={{ marginTop: 'var(--sp-2)' }}>
                要管理全部对象和材料（改名、归类、批量清理），去 <Link to="/input/blocks">输入 → 外部数据</Link>——这里只放当前调研要用的。
              </div>
            </>
          )}
        </div>
      </div>

      <div className="set-card">
        <h2>③ 出稿</h2>
        <div className="desc">AI 按所选视角整理材料成分析稿，逐节修改后导出；没有 AI 用手动骨架照样能写</div>
        <div className="set-body">
          <div className="set-row">
            <label>视角</label>
            <div className="radio">
              {ARTICLE_VIEWS.map((v) => (
                <button key={v.id} type="button" className={view.id === v.id ? 'on' : ''} onClick={() => setView(v)}>
                  {v.name}
                </button>
              ))}
            </div>
          </div>
          <div className="set-row">
            <label>用途</label>
            <div className="radio">
              <button type="button" className={audience === 'client' ? 'on' : ''} onClick={() => setAudience('client')}>给客户（措辞正式，可直接交付）</button>
              <button type="button" className={audience === 'internal' ? 'on' : ''} onClick={() => setAudience('internal')}>自己用（可直写问题与判断）</button>
            </div>
          </div>
          {draft === null ? (
            <div className="set-row" style={{ flexWrap: 'wrap' }}>
              <button
                type="button"
                className="btn-primary"
                disabled={!articleMaterials.length || aiBusy || !llmConfigured()}
                onClick={() => void generateAnalysis()}
                data-testid="research-generate"
              >
                {aiBusy ? '⟳ AI 整理中…' : '🤖 AI 整理成分析草稿'}
              </button>
              <button type="button" className="btn-ghost" disabled={!articleMaterials.length} onClick={() => setDraft(view.skeleton())}>
                用手动骨架（不需要 AI）
              </button>
              {!llmConfigured() && (
                <span className="val" style={{ fontSize: 'var(--fs-xs)', color: 'var(--ink-faint)' }}>
                  AI 需要先在 <Link to="/settings">设置 → AI · BYOK</Link> 配置。
                </span>
              )}
              {profile && !articleMaterials.length && (
                <span className="val" style={{ fontSize: 'var(--fs-xs)', color: 'var(--ink-faint)' }}>这个对象还没有材料。</span>
              )}
              {!profile && (
                <span className="val" style={{ fontSize: 'var(--fs-xs)', color: 'var(--ink-faint)' }}>先在上方选一个调研对象。</span>
              )}
              {aiError && <span className="val" style={{ fontSize: 'var(--fs-xs)', color: 'var(--danger)' }}>{aiError}</span>}
            </div>
          ) : (
            <div className="set-row">
              <span className="val" style={{ fontSize: 'var(--fs-xs)', color: 'var(--ok)' }}>草稿已生成，在下方逐节修改。</span>
            </div>
          )}
        </div>
      </div>

      {draft && (
        <div className="set-card">
          <h2>分析草稿（可编辑）</h2>
          <div className="set-body">
            <div className="set-row">
              <label>导出</label>
              <button type="button" className="btn-ghost" onClick={() => doExport('md')}>⬇ Markdown</button>
              <button type="button" className="btn-ghost" onClick={() => doExport('docx')}>⬇ Word（.docx）</button>
              <span className="val" style={{ fontSize: 'var(--fs-xs)', color: 'var(--ink-faint)' }}>Word 可另存 PDF</span>
            </div>
            <ArticleEditor draft={draft} onChange={setDraft} />
          </div>
        </div>
      )}
    </section>
  )
}
