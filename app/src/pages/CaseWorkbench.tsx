import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useProfiles } from '../store/profiles'
import {
  addCaseFile,
  listCaseFiles,
  softDeleteCaseFile,
  type CaseFileKind,
} from '../db/caseFilesRepo'
import {
  buildDecodePrompt,
  buildDiagnosePrompt,
  buildRewritePrompt,
  DECODE_SYSTEM_PROMPT,
  DIAGNOSE_SYSTEM_PROMPT,
  REWRITE_SYSTEM_PROMPT,
  decodeToText,
  diagnosisToText,
  parseDecode,
  parseDiagnosis,
  type JobDecode,
  type MatchDiagnosis,
} from '../engine/resumeTools'
import { downloadFile } from '../db/repo'
import { chatCompletion } from '../modules/review/engine/llm'
import { loadCoachConfig, llmConfigFrom } from '../modules/review/engine/coach'
import { todayLocal } from '../engine/datetime'
import { ArticleEditor } from '../components/writer/ArticleEditor'
import { ARTICLE_VIEWS, ARTICLE_SYSTEM_PROMPT, buildArticleUserPrompt, getArticleView, parseArticle, articleToMarkdown, exportArticleDocx, type ArticleDraft, type ArticleView } from '../engine/articleWriter'
import type { CaseFile, Profile } from '../types/models'
import { extractMaterial } from '../engine/pptWriter'

const coachReady = () => Boolean(loadCoachConfig().apiKey)

const KIND_LABEL: Record<CaseFileKind, string> = {
  resume: '客户简历',
  jd: '岗位 JD',
  company: '公司资料',
  doc: '过程文档',
  other: '其他',
}

/** 案例工作台：一个案例（客户 × 目标岗位）的全部作业——文件、岗位解码、匹配诊断、分析、导出。 */
export function CaseWorkbench() {
  const { id = '' } = useParams()
  const profiles = useProfiles((s) => s.profiles)
  const profile: Profile | undefined = profiles.find((p) => p.id === id)

  const [files, setFiles] = useState<CaseFile[]>([])
  const [notFound, setNotFound] = useState(false)
  const [extracting, setExtracting] = useState(false)
  const [extractErr, setExtractErr] = useState('')
  const [exportMsg, setExportMsg] = useState('')
  const [pasteKind, setPasteKind] = useState<CaseFileKind>('jd')
  const [pasteName, setPasteName] = useState('')
  const [pasteText, setPasteText] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  const [decodeBusy, setDecodeBusy] = useState(false)
  const [decodeErr, setDecodeErr] = useState('')
  const [jdPaste, setJdPaste] = useState('')
  const [diagBusy, setDiagBusy] = useState(false)
  const [diagErr, setDiagErr] = useState('')
  const [rwRaw, setRwRaw] = useState('')
  const [rwOut, setRwOut] = useState('')
  const [rwBusy, setRwBusy] = useState(false)
  const [analysisView, setAnalysisView] = useState<ArticleView>(ARTICLE_VIEWS.find((v) => v.id === 'resume-tailoring') ?? ARTICLE_VIEWS[0]!)
  const [analysisAudience, setAnalysisAudience] = useState<'internal' | 'external'>('external')
  const [draft, setDraft] = useState<ArticleDraft | null>(null)
  const [draftBusy, setDraftBusy] = useState(false)
  const [draftErr, setDraftErr] = useState('')

  const refresh = async () => {
    if (!id) return
    setFiles(await listCaseFiles(id))
  }

  useEffect(() => {
    if (!id) {
      setNotFound(true)
      return
    }
    void refresh()
    void useProfiles.getState().load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  const callAI = async (system: string, user: string, maxTokens: number): Promise<string> =>
    chatCompletion(llmConfigFrom(loadCoachConfig()), system, user, { maxTokens, timeoutMs: 90000 })

  const addPaste = async () => {
    if (!pasteText.trim()) return
    await addCaseFile({ caseId: id, name: pasteName.trim() || `${KIND_LABEL[pasteKind]} ${new Date().toLocaleDateString('zh-CN')}`, kind: pasteKind, text: pasteText.trim() })
    setPasteName('')
    setPasteText('')
    await refresh()
  }

  const onFiles = async (fl: FileList) => {
    setExtractErr('')
    setExtracting(true)
    try {
      for (const f of Array.from(fl)) {
        let kind: CaseFileKind = 'other'
        const n = f.name.toLowerCase()
        if (n.includes('简历') || n.includes('resume')) kind = 'resume'
        else if (n.includes('jd') || n.includes('岗位')) kind = 'jd'
        else if (n.includes('工商') || n.includes('公司') || n.includes('调研')) kind = 'company'
        const text = await extractMaterial(f)
        await addCaseFile({ caseId: id, name: f.name.replace(/\.[^.]+$/, ''), kind, text })
      }
      await refresh()
    } catch (e) {
      setExtractErr(e instanceof Error ? e.message : String(e))
    } finally {
      setExtracting(false)
    }
  }

  const saveDoc = async (name: string, text: string, kind: CaseFileKind = 'doc') => {
    await addCaseFile({ caseId: id, name, kind, text })
    await refresh()
  }

  const runDecode = async (jd: string) => {
    setDecodeBusy(true)
    setDecodeErr('')
    try {
      const d: JobDecode = parseDecode(await callAI(DECODE_SYSTEM_PROMPT, buildDecodePrompt(jd), 3000))
      await saveDoc(`岗位解码表 · ${todayLocal()}`, decodeToText(d))
    } catch (e) {
      setDecodeErr(e instanceof Error ? e.message : String(e))
    } finally {
      setDecodeBusy(false)
    }
  }

  const runDiagnose = async () => {
    const decodeDoc = files.find((f) => f.kind === 'doc' && f.name.includes('岗位解码表'))
    setDiagBusy(true)
    setDiagErr('')
    try {
      const text = await callAI(
        DIAGNOSE_SYSTEM_PROMPT,
        buildDiagnosePrompt(
          decodeDoc?.text ?? '',
          files.filter((f) => f.kind !== 'doc').map((f) => ({ title: f.name, body: f.text })),
        ),
        5000,
      )
      const d: MatchDiagnosis = parseDiagnosis(text)
      await saveDoc(`匹配度诊断 · ${todayLocal()}`, diagnosisToText(d), 'doc')
    } catch (e) {
      setDiagErr(e instanceof Error ? e.message : String(e))
    } finally {
      setDiagBusy(false)
    }
  }

  const runRewrite = async () => {
    if (!rwRaw.trim() || rwBusy) return
    const decodeDoc = files.find((f) => f.kind === 'doc' && f.name.includes('岗位解码表'))
    setRwBusy(true)
    try {
      setRwOut(await callAI(REWRITE_SYSTEM_PROMPT, buildRewritePrompt(rwRaw.trim(), decodeDoc?.text ?? null), 1500))
    } catch (e) {
      setRwOut(`改写失败：${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setRwBusy(false)
    }
  }

  const runAnalysis = async () => {
    const materials = files
      .filter((f) => f.kind !== 'doc')
      .map((f) => ({ id: f.id, kind: 'note' as const, title: f.name, body: f.text, createdAt: f.createdAt, sourceLabel: '案例材料' }))
    setDraftBusy(true)
    setDraftErr('')
    try {
      const text = await callAI(
        ARTICLE_SYSTEM_PROMPT,
        buildArticleUserPrompt({ materials, view: analysisView, scopeLabel: profile?.name }),
        8000,
      )
      setDraft(parseArticle(text))
    } catch (e) {
      setDraftErr(e instanceof Error ? e.message : String(e))
    } finally {
      setDraftBusy(false)
    }
  }

  if (notFound) {
    return (
      <section className="settings" style={{ maxWidth: 'var(--content-w)' }}>
        <div className="page-head">
          <h1>案例工作台</h1>
        </div>
        <div className="empty">
          <div className="e-ico" aria-hidden>📋</div>
          <p>案例不存在，去 <Link to="/cases">案例库</Link> 查看。</p>
        </div>
      </section>
    )
  }

  const nonDocFiles = files.filter((f) => f.kind !== 'doc')
  const decodeDoc = files.find((f) => f.kind === 'doc' && f.name.includes('岗位解码表'))
  const diagDoc = files.find((f) => f.kind === 'doc' && f.name.includes('匹配度诊断'))

  const doExport = (kind: 'md' | 'docx') => {
    if (!draft) return
    if (kind === 'md') {
      downloadFile(`${draft.title}.md`, articleToMarkdown(draft), 'text/markdown')
    } else {
      void exportArticleDocx(draft).then((name) => setExportMsg(`已生成 ${name}`))
    }
  }

  return (
    <section className="settings" style={{ maxWidth: 'var(--content-w)' }}>
      <div className="page-head">
        <h1>{profile ? profile.name : '案例工作台'}</h1>
        <span className="sub">案例 · 文件保持原样，工具直接读文件，产出挂在本案例下</span>
        <div className="right">
          <Link to="/cases" className="btn-ghost">← 案例库</Link>
        </div>
      </div>

      {/* 一、文件与材料 */}
      <div className="set-card">
        <h2>一、文件与材料</h2>
        <div className="desc">上传 Word / PDF / MD / TXT（自动提取文字），或直接粘贴。按类型归档，保持文件形态不拆碎。</div>
        <div className="set-body">
          <div className="set-row" style={{ flexWrap: 'wrap' }}>
            {(['resume', 'jd', 'company', 'other'] as CaseFileKind[]).map((k) => (
              <button key={k} type="button" className={`chip${pasteKind === k ? ' on' : ''}`} onClick={() => setPasteKind(k)}>
                {k === 'resume' ? '客户简历' : k === 'jd' ? '岗位 JD' : k === 'company' ? '公司资料' : '其他'}
              </button>
            ))}
          </div>
          <div className="set-row" style={{ alignItems: 'flex-start' }}>
            <textarea
              className="input"
              style={{ flex: 1 }}
              rows={3}
              placeholder="粘贴文字内容……"
              value={pasteText}
              aria-label="粘贴内容"
              onChange={(e) => setPasteText(e.target.value)}
            />
          </div>
          <div className="set-row">
            <input
              className="input"
              style={{ maxWidth: 200 }}
              placeholder="材料名称（可选）"
              value={pasteName}
              aria-label="材料名称"
              onChange={(e) => setPasteName(e.target.value)}
            />
            <button type="button" className="btn-ghost" disabled={!pasteText.trim()} onClick={() => void addPaste()}>
              ＋ 添加
            </button>
            <button type="button" className="btn-ghost" disabled={extracting} onClick={() => fileRef.current?.click()}>
              {extracting ? '⟳ 提取中…' : '⬆ 上传文件'}
            </button>
            <input
              ref={fileRef}
              type="file"
              multiple
              accept=".md,.txt,.docx,.pdf,.markdown"
              style={{ display: 'none' }}
              aria-label="选择材料文件"
              onChange={(e) => {
                if (e.target.files?.length) void onFiles(e.target.files)
                e.target.value = ''
              }}
            />
          </div>
          {extractErr && (
            <div className="set-row">
              <span className="val" style={{ fontSize: 'var(--fs-xs)', color: 'var(--danger)' }}>{extractErr}</span>
            </div>
          )}
          <div className="set-row" style={{ alignItems: 'flex-start' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              {files.length === 0 && <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--ink-faint)' }}>（还没有材料）</div>}
              {files.map((f) => (
                <div key={f.id} style={{ display: 'flex', gap: 'var(--sp-2)', alignItems: 'baseline', padding: '3px 0' }}>
                  <span style={{ fontSize: 'var(--fs-sm)' }}>{f.name}</span>
                  <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--ink-faint)' }}>{f.text.length} 字 · {new Date(f.createdAt).toLocaleDateString('zh-CN')}</span>
                  <button
                    type="button"
                    className="mini-btn"
                    onClick={() => {
                      if (window.confirm(`删除「${f.name}」？（软删除）`)) void softDeleteCaseFile(f.id).then(refresh)
                    }}
                  >
                    删除
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* 二、岗位解码 */}
      <div className="set-card">
        <h2>二、岗位解码（JD → P0/P1/P2 + 隐性能力词）</h2>
        <div className="desc">解码结果存为本案例的过程文档，后续匹配诊断和条目改写都以它为准。</div>
        <div className="set-body">
          <div className="set-row" style={{ alignItems: 'flex-start' }}>
            <textarea
              className="input"
              style={{ flex: 1 }}
              rows={4}
              placeholder="粘贴 JD 全文……"
              value={jdPaste}
              aria-label="粘贴 JD 全文"
              onChange={(e) => setJdPaste(e.target.value)}
            />
          </div>
          <div className="set-row">
            <button type="button" className="btn-primary" disabled={!jdPaste.trim() || decodeBusy} onClick={() => void runDecode(jdPaste)}>
              {decodeBusy ? '⟳ 解码中…' : '🤖 AI 解码此 JD'}
            </button>
            {decodeErr && <span className="val" style={{ fontSize: 'var(--fs-xs)', color: 'var(--danger)' }}>{decodeErr}</span>}
          </div>
          {decodeDoc && (
            <div className="set-row" style={{ alignItems: 'flex-start' }}>
              <details style={{ flex: 1 }}>
                <summary style={{ cursor: 'pointer', fontSize: 'var(--fs-xs)', color: 'var(--ink-faint)' }}>查看当前解码表</summary>
                <pre style={{ whiteSpace: 'pre-wrap', fontSize: 'var(--fs-xs)', margin: 'var(--sp-2) 0 0' }}>{decodeDoc.text}</pre>
              </details>
            </div>
          )}
        </div>
      </div>

      {/* 三、匹配度诊断 */}
      <div className="set-card">
        <h2>三、匹配度诊断（逐条对照打分）</h2>
        <div className="desc">把案例内全部材料与解码表逐条对照：每条要求找证据、打 0-5 分、指出缺口。素材缺什么会如实标注，不编造。</div>
        <div className="set-body">
          <div className="set-row">
            <button type="button" className="btn-primary" disabled={diagBusy || nonDocFiles.length === 0} onClick={() => void runDiagnose()}>
              {diagBusy ? '⟳ 诊断中…' : '🤖 AI 匹配度诊断'}
            </button>
            {diagErr && <span className="val" style={{ fontSize: 'var(--fs-xs)', color: 'var(--danger)' }}>{diagErr}</span>}
          </div>
          {diagDoc && (
            <div className="set-row" style={{ alignItems: 'flex-start' }}>
              <details style={{ flex: 1 }}>
                <summary style={{ cursor: 'pointer', fontSize: 'var(--fs-xs)', color: 'var(--ink-faint)' }}>查看当前诊断表</summary>
                <pre style={{ whiteSpace: 'pre-wrap', fontSize: 'var(--fs-xs)', margin: 'var(--sp-2) 0 0' }}>{diagDoc.text}</pre>
              </details>
            </div>
          )}
        </div>
      </div>

      {/* 四、条目改写 */}
      <div className="set-card">
        <h2>四、条目改写（STAR / 量化）</h2>
        <div className="desc">原始经历描述 → "问题-行动-结果"简历条目。没数字的地方用（数字待补）占位，不编造。可对齐解码表。</div>
        <div className="set-body">
          <div className="set-row" style={{ alignItems: 'flex-start' }}>
            <textarea
              className="input"
              style={{ flex: 1 }}
              rows={2}
              placeholder="粘贴原始经历描述，如：负责组织公司年会"
              value={rwRaw}
              aria-label="原始经历描述"
              onChange={(e) => setRwRaw(e.target.value)}
            />
          </div>
          <div className="set-row">
            <button type="button" className="btn-ghost" disabled={!rwRaw.trim() || rwBusy} onClick={() => void runRewrite()}>
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

      {/* 五、分析草稿 */}
      <div className="set-card">
        <h2>五、分析草稿</h2>
        <div className="desc">选择整理视角和受众，AI 生成分析文档后逐节修改，导出 Markdown 或 Word。</div>
        <div className="set-body">
          <div className="set-row">
            <label>视角</label>
            <div className="radio">
              {ARTICLE_VIEWS.map((v) => (
                <button key={v.id} type="button" className={analysisView.id === v.id ? 'on' : ''} onClick={() => setAnalysisView(v)}>
                  {v.name}
                </button>
              ))}
            </div>
          </div>
          <div className="set-row">
            <label>用途</label>
            <div className="radio">
              <button type="button" className={analysisAudience === 'external' ? 'on' : ''} onClick={() => setAnalysisAudience('external')}>给客户</button>
              <button type="button" className={analysisAudience === 'internal' ? 'on' : ''} onClick={() => setAnalysisAudience('internal')}>自己用</button>
            </div>
          </div>
          {draft === null ? (
            <div className="set-row" style={{ flexWrap: 'wrap' }}>
              <button
                type="button"
                className="btn-primary"
                disabled={!files.filter((f) => f.kind !== 'doc').length || draftBusy || !coachReady()}
                onClick={() => void runAnalysis()}
                data-testid="workbench-analysis-btn"
              >
                {draftBusy ? '⟳ AI 整理中…' : '🤖 AI 整理成分析草稿'}
              </button>
              <button type="button" className="btn-ghost" onClick={() => setDraft(getArticleView(analysisView.id).skeleton())}>
                用手动骨架（不需要 AI）
              </button>
              {!coachReady() && (
                <span className="val" style={{ fontSize: 'var(--fs-xs)', color: 'var(--ink-faint)' }}>
                  AI 需要先在 <Link to="/settings">设置 → AI · BYOK</Link> 配置。
                </span>
              )}
              {draftErr && <span className="val" style={{ fontSize: 'var(--fs-xs)', color: 'var(--danger)' }}>{draftErr}</span>}
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
              {exportMsg && <span className="val" style={{ fontSize: 'var(--fs-xs)', color: 'var(--ok)' }}>{exportMsg}</span>}
              <button type="button" className="mini-btn" onClick={() => setDraft(null)}>丢弃草稿</button>
            </div>
            <ArticleEditor draft={draft} onChange={setDraft} />
          </div>
        </div>
      )}
    </section>
  )
}
