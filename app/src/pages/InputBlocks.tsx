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
import { chatCompletion } from '../modules/review/engine/llm'
import { loadCoachConfig, llmConfigFrom } from '../modules/review/engine/coach'
import { ArticleEditor } from '../components/writer/ArticleEditor'
import { parseDecodeBlock, parseDiagnosisBlock, renderDecodeReportHtml, renderDiagnosisReportHtml } from '../engine/deliverables'
import { todayLocal } from '../engine/datetime'
import {
  buildDecodePrompt,
  buildDiagnosePrompt,
  buildRewritePrompt,
  caseBlockTitle,
  decodeToText,
  diagnosisToText,
  parseDecode,
  parseDiagnosis,
  DECODE_SYSTEM_PROMPT,
  DIAGNOSE_SYSTEM_PROMPT,
  REWRITE_SYSTEM_PROMPT,
} from '../engine/resumeTools'

const coachReady = () => Boolean(loadCoachConfig().apiKey)

/**
 * 外部数据（输入第三通道）：速记 = 我想到的，信源 = 网上来的，外部数据 = 我从别的系统带来的。
 * 数据按「调研对象」归组；对象下可发起分析（选视角 + 用途），产出交付文档（Markdown / Word）。
 */
export function InputBlocks() {
  const { blocks, load: loadBlocks, save: saveBlock, remove: removeBlock } = useBlocks()
  const { profiles, load: loadProfiles, save: saveProfile, remove: removeProfile } = useProfiles()
  const [editing, setEditing] = useState<{ id?: string; title: string; content: string; profileId?: string; usage?: 'internal' | 'client' } | null>(null)
  const [importMsg, setImportMsg] = useState('')
  const [filter, setFilter] = useState<'all' | 'none' | string>('all')
  const [newProfileName, setNewProfileName] = useState('')
  const [newProfileKind, setNewProfileKind] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)
  const [reportPreview, setReportPreview] = useState<{ html: string } | null>(null)
  const reportFrame = useRef<HTMLIFrameElement>(null)

  // 分析
  const [view, setView] = useState<ArticleView>(ARTICLE_VIEWS[0]!)
  const [audience, setAudience] = useState<'internal' | 'client'>('client')
  const [draft, setDraft] = useState<ArticleDraft | null>(null)
  const [aiBusy, setAiBusy] = useState(false)
  const [aiError, setAiError] = useState('')
  // 岗位解码
  const [jdText, setJdText] = useState('')
  const [decodeBusy, setDecodeBusy] = useState(false)
  const [decodeErr, setDecodeErr] = useState('')
  // 匹配度诊断
  const [diagBusy, setDiagBusy] = useState(false)
  const [diagErr, setDiagErr] = useState('')
  // 条目改写
  const [rwRaw, setRwRaw] = useState('')
  const [rwOut, setRwOut] = useState('')
  const [rwBusy, setRwBusy] = useState(false)

  useEffect(() => {
    void loadBlocks()
    void loadProfiles()
  }, [loadBlocks, loadProfiles])

  const onFile = async (file: File) => {
    try {
      const text = await file.text()
      const r = fileToBlockContent(file.name, text)
      const profileId = filter !== 'all' && filter !== 'none' ? filter : undefined
      setEditing({ title: file.name.replace(/\.[^.]+$/, ''), content: r.content, profileId, usage: audience === 'client' ? 'client' : 'internal' })
      setImportMsg(`${r.note}——确认内容后点"保存"`)
    } catch (e) {
      setImportMsg(`导入失败：${e instanceof Error ? e.message : '文件解析出错'}`)
    }
  }

  const visible = blocks.filter((b) => {
    if (filter === 'all') return true
    if (filter === 'none') return !b.profileId
    return b.profileId === filter
  })
  const analysisScope = filter === 'all' || filter === 'none' ? null : (profiles.find((p) => p.id === filter) ?? null)
  const analysisMaterials: ArticleMaterial[] = (analysisScope ? blocks.filter((b) => b.profileId === analysisScope.id) : blocks).map((b) => ({
    id: b.id,
    kind: 'note' as const,
    title: b.title,
    body: b.content,
    createdAt: b.updatedAt,
    sourceLabel: '外部材料',
  }))

  const addProfile = async () => {
    if (!newProfileName.trim()) return
    const p = await saveProfile({ name: newProfileName, kind: newProfileKind })
    setNewProfileName('')
    setNewProfileKind('')
    setFilter(p.id)
  }

  const generateAnalysis = async () => {
    if (aiBusy || analysisMaterials.length === 0) return
    setAiBusy(true)
    setAiError('')
    try {
      const text = await chatCompletion(
        llmConfigFrom(loadCoachConfig()),
        ARTICLE_SYSTEM_PROMPT,
        buildArticleUserPrompt({ materials: analysisMaterials, view, scopeLabel: analysisScope?.name }),
        { maxTokens: 8000, timeoutMs: 90000 },
      )
      setDraft(parseArticle(text))
    } catch (e) {
      setAiError(e instanceof Error ? e.message : String(e))
    } finally {
      setAiBusy(false)
    }
  }

  const decodeJD = async () => {
    if (!jdText.trim() || decodeBusy) return
    setDecodeBusy(true)
    setDecodeErr('')
    try {
      const text = await chatCompletion(
        llmConfigFrom(loadCoachConfig()),
        DECODE_SYSTEM_PROMPT,
        buildDecodePrompt(jdText.trim()),
        { maxTokens: 2000, timeoutMs: 90000 },
      )
      const d = parseDecode(text)
      await saveBlock({
        title: caseBlockTitle('decode'),
        content: `JD 原文：
${jdText.trim().slice(0, 800)}

${decodeToText(d)}`,
        profileId: analysisScope?.id,
        usage: 'internal',
      })
      setJdText('')
    } catch (e) {
      setDecodeErr(e instanceof Error ? e.message : String(e))
    } finally {
      setDecodeBusy(false)
    }
  }

  const diagnose = async () => {
    const decodeBlock = [...blocks]
      .filter((b) => b.title.includes('岗位解码表') && (!analysisScope || b.profileId === analysisScope.id))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0]
    if (!decodeBlock || diagBusy) return
    setDiagBusy(true)
    setDiagErr('')
    try {
      const text = await chatCompletion(
        llmConfigFrom(loadCoachConfig()),
        DIAGNOSE_SYSTEM_PROMPT,
        buildDiagnosePrompt(
          decodeBlock.content,
          blocks.filter((b) => b.profileId === analysisScope?.id && b.id !== decodeBlock.id).map((b) => ({ title: b.title, body: b.content })),
        ),
        { maxTokens: 4000, timeoutMs: 90000 },
      )
      const d = parseDiagnosis(text)
      await saveBlock({
        title: caseBlockTitle('diagnosis'),
        content: diagnosisToText(d),
        profileId: analysisScope?.id,
        usage: audience === 'client' ? 'client' : 'internal',
      })
    } catch (e) {
      setDiagErr(e instanceof Error ? e.message : String(e))
    } finally {
      setDiagBusy(false)
    }
  }

  const rewriteEntry = async () => {
    if (!rwRaw.trim() || rwBusy) return
    setRwBusy(true)
    try {
      const decodeBlock = [...blocks]
        .filter((b) => b.title.includes('岗位解码表') && (!analysisScope || b.profileId === analysisScope.id))
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0]
      const text = await chatCompletion(
        llmConfigFrom(loadCoachConfig()),
        REWRITE_SYSTEM_PROMPT,
        buildRewritePrompt(rwRaw.trim(), decodeBlock?.content ?? null),
        { maxTokens: 1000, timeoutMs: 90000 },
      )
      setRwOut(text.trim())
    } catch (e) {
      setRwOut(`改写失败：${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setRwBusy(false)
    }
  }

  const exportBlockReport = (b: { title: string; content: string; profileId?: string }) => {
    const clientName = profiles.find((p) => p.id === b.profileId)?.name ?? '调研对象'
    const meta = { clientName, date: todayLocal() }
    if (b.title.includes('岗位解码表')) {
      const d = parseDecodeBlock(b.content)
      setReportPreview({ html: renderDecodeReportHtml({ ...meta, ...d }) })
    } else if (b.title.includes('匹配度诊断')) {
      const d = parseDiagnosisBlock(b.content)
      setReportPreview({ html: renderDiagnosisReportHtml({ ...meta, ...d }) })
    }
  }

  const doExport = (kind: 'md' | 'docx') => {
    if (!draft) return
    if (kind === 'md') {
      downloadFile(`${draft.title}.md`, articleToMarkdown(draft), 'text/markdown')
    } else {
      void exportArticleDocx(draft)
    }
  }

  return (
    <section className="settings" style={{ maxWidth: 'var(--content-w)' }}>
      <div className="page-head">
        <h1>外部数据</h1>
        <span className="sub">输入 · 第三通道——从别的系统带来的数据按调研对象归组，分析也从这里发起</span>
      </div>

      <div className="set-card">
        <h2>调研对象</h2>
        <div className="desc">一家公司、一个客户……材料挂在对象下面，分析按对象发起。标签随意填（客户 / 目标公司 / 供应商）。</div>
        <div className="set-body">
          <div className="set-row">
            <input
              className="input"
              style={{ maxWidth: 260 }}
              placeholder="对象名称（如：XX 银行 · 张三简历定制）"
              value={newProfileName}
              aria-label="新调研对象名称"
              onChange={(e) => setNewProfileName(e.target.value)}
            />
            <input
              className="input"
              style={{ maxWidth: 140 }}
              placeholder="标签（可选）"
              value={newProfileKind}
              aria-label="新调研对象标签"
              onChange={(e) => setNewProfileKind(e.target.value)}
            />
            <button type="button" className="btn-ghost" disabled={!newProfileName.trim()} onClick={() => void addProfile()}>
              ＋ 新建对象
            </button>
          </div>
          {profiles.map((p) => {
            const count = blocks.filter((b) => b.profileId === p.id).length
            return (
              <div className="set-row" key={p.id}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ fontSize: 'var(--fs-sm)', fontWeight: 600 }}>{p.name}</span>
                  {p.kind && <span className="val" style={{ marginLeft: 8, fontSize: 'var(--fs-xs)', color: 'var(--ink-faint)' }}>{p.kind}</span>}
                  <span className="val" style={{ marginLeft: 8, fontSize: 'var(--fs-xs)', color: 'var(--ink-faint)' }}>{count} 份材料</span>
                </div>
                <button
                  type="button"
                  className="mini-btn"
                  onClick={() => {
                    if (window.confirm(`删除对象「${p.name}」？它名下的材料会回到"未归类"，不会丢失。`)) void removeProfile(p.id)
                  }}
                >
                  删除
                </button>
              </div>
            )
          })}
        </div>
      </div>

      <div className="set-card">
        <h2>材料（数据块）</h2>
        <div className="desc">一行一条，"键: 值"形态渲染成指标行，其余为文字。用途标"给客户"后，可在交付文档整理时优先参考。</div>
        <div className="set-body">
          <div className="set-row" style={{ flexWrap: 'wrap' }}>
            <button type="button" className={`chip${filter === 'all' ? ' on' : ''}`} onClick={() => setFilter('all')}>
              全部 {blocks.length}
            </button>
            <button type="button" className={`chip${filter === 'none' ? ' on' : ''}`} onClick={() => setFilter('none')}>
              未归类 {blocks.filter((b) => !b.profileId).length}
            </button>
            {profiles.map((p) => (
              <button key={p.id} type="button" className={`chip${filter === p.id ? ' on' : ''}`} onClick={() => setFilter(p.id)}>
                {p.name} {blocks.filter((b) => b.profileId === p.id).length}
              </button>
            ))}
          </div>
          {editing === null && visible.length === 0 && (
            <div className="notice">没有符合条件的材料——在下方添加或导入文件。</div>
          )}
          {visible.map((b) => (
            <div className="set-row" key={b.id} style={{ alignItems: 'flex-start' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 'var(--fs-sm)', fontWeight: 600 }}>
                  {b.title}
                  {b.usage === 'client' && (
                    <span className="val" style={{ marginLeft: 8, fontSize: 'var(--fs-xs)', color: 'var(--ok)' }}>给客户</span>
                  )}
                </div>
                <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--ink-faint)', whiteSpace: 'pre-wrap' }}>{b.content}</div>
              </div>
              {(b.title.includes('岗位解码表') || b.title.includes('匹配度诊断')) && (
                <button
                  type="button"
                  className="mini-btn"
                  title="生成可交付的报告（打印或另存 PDF）"
                  onClick={() => exportBlockReport(b)}
                >
                  导出报告
                </button>
              )}
              <button type="button" className="mini-btn" onClick={() => setEditing({ id: b.id, title: b.title, content: b.content, profileId: b.profileId, usage: b.usage })}>
                编辑
              </button>
              <button
                type="button"
                className="mini-btn"
                onClick={() => {
                  if (window.confirm(`删除数据块「${b.title}」？（软删除，备份中仍可找回）`)) void removeBlock(b.id)
                }}
              >
                删除
              </button>
            </div>
          ))}
          {editing ? (
            <div className="set-row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 'var(--sp-2)' }}>
              <input
                className="input"
                placeholder="材料名称（如：销售周数据）"
                value={editing.title}
                aria-label="材料名称"
                onChange={(e) => setEditing({ ...editing, title: e.target.value })}
              />
              <select
                className="lane-select"
                value={editing.profileId ?? ''}
                aria-label="材料归属对象"
                onChange={(e) => setEditing({ ...editing, profileId: e.target.value || undefined })}
              >
                <option value="">未归类</option>
                {profiles.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
              <textarea
                className="input"
                rows={5}
                placeholder={'一行一条，支持"键: 值"形态，例如：\n新增线索: 23\n成交金额: 86万\n也可以写普通文字行'}
                value={editing.content}
                aria-label="材料内容"
                onChange={(e) => setEditing({ ...editing, content: e.target.value })}
              />
              <div className="set-row">
                <label>用途</label>
                <div className="radio">
                  <button type="button" className={(editing.usage ?? 'internal') === 'internal' ? 'on' : ''} onClick={() => setEditing({ ...editing, usage: 'internal' })}>自己用</button>
                  <button type="button" className={editing.usage === 'client' ? 'on' : ''} onClick={() => setEditing({ ...editing, usage: 'client' })}>给客户</button>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 'var(--sp-2)' }}>
                <button
                  type="button"
                  className="btn-ghost"
                  disabled={!editing.title.trim()}
                  onClick={() => {
                    void saveBlock(editing).then(() => {
                      setEditing(null)
                      setImportMsg('')
                      void loadBlocks()
                    })
                  }}
                >
                  保存
                </button>
                <button
                  type="button"
                  className="btn-ghost"
                  onClick={() => {
                    setEditing(null)
                    setImportMsg('')
                  }}
                >
                  取消
                </button>
              </div>
            </div>
          ) : (
            <div className="set-row">
              <button
                type="button"
                className="btn-ghost"
                onClick={() =>
                  setEditing({
                    title: '',
                    content: '',
                    profileId: filter !== 'all' && filter !== 'none' ? filter : undefined,
                    usage: audience === 'client' ? 'client' : 'internal',
                  })
                }
                data-testid="add-block"
              >
                ＋ 新数据块
              </button>
              <button type="button" className="btn-ghost" onClick={() => fileRef.current?.click()} data-testid="import-file">
                ⬆ 导入文件（CSV/JSON）
              </button>
              <input
                ref={fileRef}
                type="file"
                accept=".csv,.json,.txt,.tsv"
                style={{ display: 'none' }}
                aria-label="选择要导入的文件"
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (f) void onFile(f)
                  e.target.value = ''
                }}
              />
            </div>
          )}
          {importMsg && (
            <div className="set-row" role="status">
              <span className="val" style={{ fontSize: 'var(--fs-xs)', color: 'var(--ink-faint)' }}>{importMsg}</span>
            </div>
          )}
        </div>
      </div>

      {reportPreview && (
        <div className="set-card">
          <h2>报告预览（交付版）</h2>
          <div className="set-body">
            <div className="set-row">
              <button
                type="button"
                className="btn-ghost"
                onClick={() => reportFrame.current?.contentWindow?.print()}
              >
                🖨 打印 / 另存 PDF
              </button>
              <button type="button" className="mini-btn" onClick={() => setReportPreview(null)}>关闭预览</button>
            </div>
            <iframe
              ref={reportFrame}
              title="交付报告预览"
              srcDoc={reportPreview.html}
              style={{ width: '100%', height: 560, border: '1px solid var(--line)', borderRadius: 'var(--r-md)', background: '#fff' }}
            />
          </div>
        </div>
      )}

      <div className="set-card">
        <h2>从材料生成分析</h2>
        <div className="desc">
          范围：{analysisScope ? `调研对象「${analysisScope.name}」` : '当前筛选下的全部材料'} · 用途：{audience === 'client' ? '给客户（措辞正式，可直接交付）' : '自己用（可直写问题与判断）'}
        </div>
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
              <button type="button" className={audience === 'client' ? 'on' : ''} onClick={() => setAudience('client')}>给客户</button>
              <button type="button" className={audience === 'internal' ? 'on' : ''} onClick={() => setAudience('internal')}>自己用</button>
            </div>
          </div>
          {draft === null ? (
            <div className="set-row" style={{ flexWrap: 'wrap' }}>
              <button
                type="button"
                className="btn-primary"
                disabled={!analysisMaterials.length || aiBusy || !coachReady()}
                onClick={() => void generateAnalysis()}
                data-testid="article-generate"
              >
                {aiBusy ? '⟳ AI 整理中…' : '🤖 AI 整理成分析草稿'}
              </button>
              <button type="button" className="btn-ghost" onClick={() => setDraft(view.skeleton())}>
                用手动骨架（不需要 AI）
              </button>
              {!coachReady() && (
                <span className="val" style={{ fontSize: 'var(--fs-xs)', color: 'var(--ink-faint)' }}>
                  AI 需要先在 <Link to="/settings">设置 → AI · BYOK</Link> 配置。
                </span>
              )}
              {!analysisMaterials.length && (
                <span className="val" style={{ fontSize: 'var(--fs-xs)', color: 'var(--ink-faint)' }}>当前范围没有材料。</span>
              )}
              {aiError && <span className="val" style={{ fontSize: 'var(--fs-xs)', color: 'var(--danger)' }}>{aiError}</span>}
            </div>
          ) : (
            <div className="set-row">
              <span className="val" style={{ fontSize: 'var(--fs-xs)', color: 'var(--ok)' }}>草稿已生成，在下方"分析草稿（可编辑）"逐节修改。</span>
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
              <span className="val" style={{ fontSize: 'var(--fs-xs)', color: 'var(--ink-faint)' }}>PDF 可在 Word 中另存</span>
              <button type="button" className="mini-btn" onClick={() => setDraft(null)}>丢弃草稿</button>
            </div>
            <ArticleEditor draft={draft} onChange={setDraft} />
          </div>
        </div>
      )}
      {analysisScope && (
        <>
          <div className="set-card">
            <h2>岗位解码（JD → P0/P1/P2）</h2>
            <div className="desc">把招聘 JD 拆成"必须证明 / 潜力项 / 加分项"和隐性能力词，存为该对象的材料——后续匹配诊断和改写都以它为准。</div>
            <div className="set-body">
              <div className="set-row" style={{ alignItems: 'flex-start' }}>
                <textarea
                  className="input"
                  style={{ flex: 1 }}
                  rows={4}
                  placeholder="粘贴目标岗位的 JD 全文……"
                  value={jdText}
                  aria-label="JD 全文"
                  onChange={(e) => setJdText(e.target.value)}
                />
              </div>
              <div className="set-row">
                <button type="button" className="btn-primary" disabled={!jdText.trim() || decodeBusy} onClick={() => void decodeJD()} data-testid="decode-btn">
                  {decodeBusy ? '⟳ 解码中…' : '🤖 AI 解码岗位'}
                </button>
                {decodeErr && <span className="val" style={{ fontSize: 'var(--fs-xs)', color: 'var(--danger)' }}>{decodeErr}</span>}
              </div>
            </div>
          </div>

          <div className="set-card">
            <h2>匹配度诊断（逐条对照打分）</h2>
            <div className="desc">把该对象最新的岗位解码表与材料逐条对照：每条要求找证据、打分（0-5）、指出缺口。</div>
            <div className="set-body">
              <div className="set-row">
                <button type="button" className="btn-primary" disabled={diagBusy} onClick={() => void diagnose()} data-testid="diagnose-btn">
                  {diagBusy ? '⟳ 诊断中…' : '🤖 AI 匹配度诊断'}
                </button>
                <span className="val" style={{ fontSize: 'var(--fs-xs)', color: 'var(--ink-faint)' }}>
                  需要先有岗位解码表和该对象下的客户素材（如自检包）
                </span>
                {diagErr && <span className="val" style={{ fontSize: 'var(--fs-xs)', color: 'var(--danger)' }}>{diagErr}</span>}
              </div>
            </div>
          </div>

          <div className="set-card">
            <h2>条目改写（STAR / 量化）</h2>
            <div className="desc">把一段原始经历改写成"问题-行动-结果"结构的简历条目；没数字的地方用（数字待补）占位，不编造。</div>
            <div className="set-body">
              <div className="set-row" style={{ alignItems: 'flex-start' }}>
                <textarea
                  className="input"
                  style={{ flex: 1 }}
                  rows={3}
                  placeholder="粘贴原始经历描述，如：负责组织公司年会"
                  value={rwRaw}
                  aria-label="原始经历描述"
                  onChange={(e) => setRwRaw(e.target.value)}
                />
              </div>
              <div className="set-row">
                <button type="button" className="btn-ghost" disabled={!rwRaw.trim() || rwBusy} onClick={() => void rewriteEntry()}>
                  {rwBusy ? '⟳ 改写中…' : '✍ AI 改写条目'}
                </button>
              </div>
              {rwOut && (
                <div className="set-row" style={{ alignItems: 'flex-start' }}>
                  <textarea className="input" rows={3} value={rwOut} readOnly aria-label="改写结果" />
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </section>
  )
}
