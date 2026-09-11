import { useRef, useState, type Dispatch, type SetStateAction } from 'react'
import { NavLink, useNavigate, useParams } from 'react-router-dom'
import {
  addCaseFile,
  CASE_KIND_LABEL,
  softDeleteCaseFile,
  type CaseFileKind,
} from '../../db/caseFilesRepo'
import { toggleProfileDeliverable } from '../../db/profilesRepo'
import { useProfiles } from '../../store/profiles'
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
} from '../../engine/resumeTools'
import {
  buildInterviewPrompt,
  DELIVERABLE_CHECKLIST,
  exportSelfCheckPackDocx,
  exportTextDocx,
  INTERVIEW_SYSTEM_PROMPT,
  selfCheckPackMarkdown,
} from '../../engine/resumeWorkflow'
import { downloadFile } from '../../db/repo'
import { llmConfigured } from '../../modules/review/engine/coach'
import { todayLocal } from '../../engine/datetime'
import { ArticleEditor } from '../../components/writer/ArticleEditor'
import {
  ARTICLE_SYSTEM_PROMPT,
  ARTICLE_VIEWS,
  articleToMarkdown,
  buildArticleUserPrompt,
  exportArticleDocx,
  getArticleView,
  parseArticle,
  type ArticleDraft,
  type ArticleView,
} from '../../engine/articleWriter'
import { extractMaterial } from '../../engine/pptWriter'
import type { CaseStepContext } from './caseContext'

const KIND_ORDER: CaseFileKind[] = ['resume', 'jd', 'checklist', 'company', 'other']
const coachReady = llmConfigured

/** 手写过程文档的折叠填写区（解码表/追问清单/诊断表共用） */
function ManualDocDetails(props: { summary: string; label: string; placeholder: string; rows?: number; onSave: (text: string) => Promise<void> }) {
  const [text, setText] = useState('')
  return (
    <div className="set-row" style={{ alignItems: 'flex-start' }}>
      <details style={{ flex: 1 }}>
        <summary style={{ cursor: 'pointer', fontSize: 'var(--fs-xs)', color: 'var(--ink-faint)' }}>{props.summary}</summary>
        <textarea
          className="input"
          style={{ width: '100%', marginTop: 'var(--sp-2)' }}
          rows={props.rows ?? 6}
          placeholder={props.placeholder}
          value={text}
          aria-label={props.label}
          onChange={(e) => setText(e.target.value)}
        />
        <div className="set-row" style={{ marginTop: 'var(--sp-2)' }}>
          <button
            type="button"
            className="btn-ghost"
            disabled={!text.trim()}
            onClick={() => void props.onSave(text.trim()).then(() => setText(''))}
          >
            保存为过程文档
          </button>
        </div>
      </details>
    </div>
  )
}

function DocViewer(props: { summary: string; text: string }) {
  return (
    <div className="set-row" style={{ alignItems: 'flex-start' }}>
      <details style={{ flex: 1 }}>
        <summary style={{ cursor: 'pointer', fontSize: 'var(--fs-xs)', color: 'var(--ink-faint)' }}>{props.summary}</summary>
        <pre style={{ whiteSpace: 'pre-wrap', fontSize: 'var(--fs-xs)', margin: 'var(--sp-2) 0 0' }}>{props.text}</pre>
      </details>
    </div>
  )
}

const NoKeyHint = () => (
  <span className="val" style={{ fontSize: 'var(--fs-xs)', color: 'var(--ink-faint)' }}>
    AI 需要先在 <NavLink to="/settings">设置 → AI · BYOK</NavLink> 配置；或在下方手动填写。
  </span>
)

/* ------------------------------ ① 文件与材料（自检包 + 客户材料） ------------------------------ */

function MaterialsPane({ ctx }: { ctx: CaseStepContext }) {
  const [pasteKind, setPasteKind] = useState<CaseFileKind>('jd')
  const [pasteName, setPasteName] = useState('')
  const [pasteText, setPasteText] = useState('')
  const [extracting, setExtracting] = useState(false)
  const [extractErr, setExtractErr] = useState('')
  const [packMsg, setPackMsg] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  const addPaste = async () => {
    if (!pasteText.trim() || !ctx.profile) return
    await addCaseFile({ caseId: ctx.profile.id, name: pasteName.trim() || `${CASE_KIND_LABEL[pasteKind]} ${new Date().toLocaleDateString('zh-CN')}`, kind: pasteKind, text: pasteText.trim() })
    setPasteName('')
    setPasteText('')
    await ctx.refresh()
  }

  const onFiles = async (fl: FileList) => {
    if (!ctx.profile) return
    setExtractErr('')
    setExtracting(true)
    try {
      for (const f of Array.from(fl)) {
        let kind: CaseFileKind = 'other'
        const n = f.name.toLowerCase()
        if (n.includes('自检包')) kind = 'checklist'
        else if (n.includes('简历稿') || n.includes('终稿')) kind = 'resumeDraft'
        else if (n.includes('简历') || n.includes('resume')) kind = 'resume'
        else if (n.includes('jd') || n.includes('岗位')) kind = 'jd'
        else if (n.includes('工商') || n.includes('公司') || n.includes('调研')) kind = 'company'
        const text = await extractMaterial(f)
        await addCaseFile({ caseId: ctx.profile.id, name: f.name.replace(/\.[^.]+$/, ''), kind, text })
      }
      await ctx.refresh()
    } catch (e) {
      setExtractErr(e instanceof Error ? e.message : String(e))
    } finally {
      setExtracting(false)
    }
  }

  const genPackMd = () => {
    const md = selfCheckPackMarkdown({ caseName: ctx.profile?.name, clientName: ctx.profile?.clientName, targetRole: ctx.profile?.targetRole })
    downloadFile(`自检包-${ctx.profile?.clientName || ctx.profile?.name || '客户'}.md`, md, 'text/markdown')
    setPackMsg('已下载 Markdown——发给客户填写，填完整份粘贴或上传回来（类型选"自检包"）。')
  }
  const genPackDocx = async () => {
    try {
      const name = await exportSelfCheckPackDocx({ caseName: ctx.profile?.name, clientName: ctx.profile?.clientName, targetRole: ctx.profile?.targetRole })
      setPackMsg(`已生成 ${name}——发给客户填写，填完整份粘贴或上传回来（类型选"自检包"）。`)
    } catch (e) {
      setPackMsg(`生成失败：${e instanceof Error ? e.message : String(e)}`)
    }
  }

  return (
    <div className="set-card">
      <h2>文件与材料</h2>
      <div className="desc">先「生成自检包」发给客户（SOP①）；收回来的自检包、客户简历、JD、公司资料粘贴或上传到这里。上传 Word/PDF/MD/TXT 自动提取文字。</div>
      <div className="set-body">
        <div className="set-row" style={{ flexWrap: 'wrap' }}>
          <button type="button" className="btn-ghost" onClick={genPackMd} data-testid="pack-md">⬇ 生成自检包（Markdown）</button>
          <button type="button" className="btn-ghost" onClick={() => void genPackDocx()} data-testid="pack-docx">⬇ 生成自检包（Word）</button>
          {packMsg && <span className="val" style={{ fontSize: 'var(--fs-xs)', color: 'var(--ink-faint)' }}>{packMsg}</span>}
        </div>
        <div className="set-row" style={{ flexWrap: 'wrap', paddingTop: 0 }}>
          {KIND_ORDER.map((k) => (
            <button key={k} type="button" className={`chip${pasteKind === k ? ' on' : ''}`} onClick={() => setPasteKind(k)}>
              {CASE_KIND_LABEL[k]}
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
          <input className="input" style={{ maxWidth: 200 }} placeholder="材料名称（可选）" value={pasteName} aria-label="材料名称" onChange={(e) => setPasteName(e.target.value)} />
          <button type="button" className="btn-ghost" disabled={!pasteText.trim()} onClick={() => void addPaste()}>＋ 添加</button>
          <button type="button" className="btn-ghost" disabled={extracting} onClick={() => fileRef.current?.click()}>{extracting ? '⟳ 提取中…' : '⬆ 上传文件'}</button>
          <input ref={fileRef} type="file" multiple accept=".md,.txt,.docx,.pdf,.markdown" style={{ display: 'none' }} aria-label="选择材料文件"
            onChange={(e) => { if (e.target.files?.length) void onFiles(e.target.files); e.target.value = '' }} />
        </div>
        {extractErr && (
          <div className="set-row"><span className="val" style={{ fontSize: 'var(--fs-xs)', color: 'var(--danger)' }}>{extractErr}</span></div>
        )}
        <div className="set-row" style={{ alignItems: 'flex-start' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            {ctx.files.length === 0 && <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--ink-faint)' }}>（还没有材料）</div>}
            {ctx.files.map((f) => (
              <div key={f.id} style={{ display: 'flex', gap: 'var(--sp-2)', alignItems: 'baseline', padding: '3px 0' }}>
                <span style={{ fontSize: 'var(--fs-sm)' }}>{f.name}</span>
                <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--ink-faint)' }}>{CASE_KIND_LABEL[f.kind]} · {f.text.length} 字 · {new Date(f.createdAt).toLocaleDateString('zh-CN')}</span>
                <button
                  type="button"
                  className="mini-btn"
                  onClick={() => {
                    if (window.confirm(`删除「${f.name}」？（软删除）`)) void softDeleteCaseFile(f.id).then(ctx.refresh)
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
  )
}

/* ------------------------------ ② 岗位解码 ------------------------------ */

function DecodePane({ ctx }: { ctx: CaseStepContext }) {
  const [jdPaste, setJdPaste] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const run = async (jd: string) => {
    setBusy(true)
    setErr('')
    try {
      const d: JobDecode = parseDecode(await ctx.callAI(DECODE_SYSTEM_PROMPT, buildDecodePrompt(jd), 3000))
      await ctx.saveDoc(`岗位解码表 · ${todayLocal()}`, decodeToText(d))
      setJdPaste('')
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="set-card">
      <h2>岗位解码（JD → P0/P1/P2 + 隐性能力词）</h2>
      <div className="desc">解码结果存为本案例的过程文档，后续追问、诊断和改写都以它为准。没有 AI 也能用：把自己整理好的解码表手动填进去。</div>
      <div className="set-body">
        {ctx.jdFiles.length > 0 && (
          <div className="set-row">
            <label>用案例内的 JD 文件</label>
            <select
              className="lane-select"
              value=""
              aria-label="选择案例内的 JD 文件填入"
              onChange={(e) => {
                const f = ctx.jdFiles.find((x) => x.id === e.target.value)
                if (f) setJdPaste(f.text)
              }}
            >
              <option value="">选一份填入下方…</option>
              {ctx.jdFiles.map((f) => (
                <option key={f.id} value={f.id}>{f.name}</option>
              ))}
            </select>
          </div>
        )}
        <div className="set-row" style={{ alignItems: 'flex-start' }}>
          <textarea className="input" style={{ flex: 1 }} rows={4} placeholder="粘贴 JD 全文……" value={jdPaste} aria-label="粘贴 JD 全文" onChange={(e) => setJdPaste(e.target.value)} />
        </div>
        <div className="set-row">
          <button type="button" className="btn-primary" disabled={!jdPaste.trim() || busy || !coachReady()} onClick={() => void run(jdPaste)}>
            {busy ? '⟳ 解码中…' : '🤖 AI 解码此 JD'}
          </button>
          {!coachReady() && <NoKeyHint />}
          {err && <span className="val" style={{ fontSize: 'var(--fs-xs)', color: 'var(--danger)' }}>{err}</span>}
        </div>
        <ManualDocDetails
          summary="不用 AI：手动填写解码表"
          label="手动填写岗位解码表"
          placeholder={'照手册的解码表格式写，例如：\nP0 必须证明：\n- 3 年以上 B 端销售经验\nP1 潜力项：\n- 金融行业客户资源\nP2 加分项：\n- 有团队管理经验\n隐性能力词：抗压、跨部门协调'}
          onSave={(t) => ctx.saveDoc(`岗位解码表 · ${todayLocal()}`, t)}
        />
        {ctx.decodeDoc && <DocViewer summary="查看当前解码表" text={ctx.decodeDoc.text} />}
      </div>
    </div>
  )
}

/* ------------------------------ ③ 访谈追问 ------------------------------ */

function InterviewPane({ ctx }: { ctx: CaseStepContext }) {
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const run = async () => {
    if (!ctx.decodeDoc || busy) return
    setBusy(true)
    setErr('')
    try {
      const text = await ctx.callAI(
        INTERVIEW_SYSTEM_PROMPT,
        buildInterviewPrompt(ctx.decodeDoc.text, ctx.clientMaterials.map((f) => ({ name: f.name, text: f.text }))),
        3000,
      )
      await ctx.saveDoc(`访谈追问清单 · ${todayLocal()}`, text.trim())
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="set-card">
      <h2>访谈追问清单</h2>
      <div className="desc">按解码表逐项列问题，找出材料里没证据的经历——访谈时照着问，把数字、场景、结果问出来。需要先有解码表。</div>
      <div className="set-body">
        <div className="set-row">
          <button type="button" className="btn-primary" disabled={!ctx.decodeDoc || busy || !coachReady()} onClick={() => void run()} data-testid="interview-btn">
            {busy ? '⟳ 生成中…' : '🤖 AI 生成追问清单'}
          </button>
          {!ctx.decodeDoc && <span className="val" style={{ fontSize: 'var(--fs-xs)', color: 'var(--ink-faint)' }}>需要先在「岗位解码」完成解码。</span>}
          {ctx.decodeDoc && !coachReady() && <NoKeyHint />}
          {err && <span className="val" style={{ fontSize: 'var(--fs-xs)', color: 'var(--danger)' }}>{err}</span>}
        </div>
        <ManualDocDetails
          summary="不用 AI：手动整理追问清单"
          label="手动整理访谈追问清单"
          placeholder={'例：\n必须问清：\n- 210 万业绩里你个人贡献多少？团队几个人分？\n- POC 方案是谁写的？客户提了哪些反对意见？'}
          onSave={(t) => ctx.saveDoc(`访谈追问清单 · ${todayLocal()}`, t)}
        />
        {ctx.ivDoc && <DocViewer summary="查看当前追问清单" text={ctx.ivDoc.text} />}
      </div>
    </div>
  )
}

/* ------------------------------ ④ 匹配诊断 ------------------------------ */

function DiagnosePane({ ctx }: { ctx: CaseStepContext }) {
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const run = async () => {
    setBusy(true)
    setErr('')
    try {
      const text = await ctx.callAI(
        DIAGNOSE_SYSTEM_PROMPT,
        buildDiagnosePrompt(
          ctx.decodeDoc?.text ?? '',
          ctx.clientMaterials.map((f) => ({ title: f.name, body: f.text })),
        ),
        5000,
      )
      const d: MatchDiagnosis = parseDiagnosis(text)
      await ctx.saveDoc(`匹配度诊断 · ${todayLocal()}`, diagnosisToText(d))
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="set-card">
      <h2>匹配度诊断（逐条对照打分）</h2>
      <div className="desc">把案例内全部客户材料与解码表逐条对照：每条要求找证据、打 0-5 分、指出缺口。素材缺什么会如实标注，不编造。访谈补料后建议重跑一次。</div>
      <div className="set-body">
        <div className="set-row">
          <button type="button" className="btn-primary" disabled={busy || ctx.clientMaterials.length === 0 || !coachReady()} onClick={() => void run()}>
            {busy ? '⟳ 诊断中…' : '🤖 AI 匹配度诊断'}
          </button>
          {ctx.clientMaterials.length === 0 && (
            <span className="val" style={{ fontSize: 'var(--fs-xs)', color: 'var(--ink-faint)' }}>先在「文件与材料」添加客户材料（自检包 / 简历）。</span>
          )}
          {ctx.clientMaterials.length > 0 && !coachReady() && <NoKeyHint />}
          {err && <span className="val" style={{ fontSize: 'var(--fs-xs)', color: 'var(--danger)' }}>{err}</span>}
        </div>
        <ManualDocDetails
          summary="不用 AI：手动填写诊断表"
          label="手动填写匹配度诊断表"
          placeholder={'一条要求一行，例如：\n3 年以上 B 端销售经验 | 4 分 | 证据：某某项目 2021-2024 | 缺口：无\n金融行业客户资源 | 1 分 | 证据：无 | 缺口：需补充行业接触经历'}
          onSave={(t) => ctx.saveDoc(`匹配度诊断 · ${todayLocal()}`, t)}
        />
        {ctx.diagDoc && <DocViewer summary="查看当前诊断表" text={ctx.diagDoc.text} />}
      </div>
    </div>
  )
}

/* ------------------------------ ⑤ 条目改写 ------------------------------ */

function RewritePane({ ctx, setResumeText }: { ctx: CaseStepContext; setResumeText: Dispatch<SetStateAction<string>> }) {
  const [rwRaw, setRwRaw] = useState('')
  const [rwOut, setRwOut] = useState('')
  const [busy, setBusy] = useState(false)
  const navigate = useNavigate()
  const { id = '' } = useParams()

  const run = async () => {
    if (!rwRaw.trim() || busy) return
    setBusy(true)
    try {
      setRwOut(await ctx.callAI(REWRITE_SYSTEM_PROMPT, buildRewritePrompt(rwRaw.trim(), ctx.decodeDoc?.text ?? null), 1500))
    } catch (e) {
      setRwOut(`改写失败：${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setBusy(false)
    }
  }

  const collect = () => {
    if (!rwOut.trim()) return
    setResumeText((t) => (t.trim() ? `${t.trimEnd()}\n${rwOut.trim()}\n` : `${rwOut.trim()}\n`))
    navigate(`/cases/${id}/draft`)
  }

  return (
    <div className="set-card">
      <h2>条目改写（STAR / 量化）</h2>
      <div className="desc">原始经历描述 → "问题-行动-结果"简历条目。没数字的地方用（数字待补）占位，不编造。改好的条目一键收进简历稿。</div>
      <div className="set-body">
        <div className="set-row" style={{ alignItems: 'flex-start' }}>
          <textarea className="input" style={{ flex: 1 }} rows={2} placeholder="粘贴原始经历描述，如：负责组织公司年会" value={rwRaw} aria-label="原始经历描述" onChange={(e) => setRwRaw(e.target.value)} />
        </div>
        <div className="set-row">
          <button type="button" className="btn-ghost" disabled={!rwRaw.trim() || busy || !coachReady()} onClick={() => void run()}>
            {busy ? '⟳ 改写中…' : '✍ AI 改写条目'}
          </button>
          {!coachReady() && (
            <span className="val" style={{ fontSize: 'var(--fs-xs)', color: 'var(--ink-faint)' }}>
              AI 需要先在 <NavLink to="/settings">设置 → AI · BYOK</NavLink> 配置；不用 AI 时照"问题-行动-结果"三段自己写，直接写进简历稿。
            </span>
          )}
        </div>
        {rwOut && (
          <div className="set-row" style={{ alignItems: 'flex-start' }}>
            <textarea className="input" rows={3} value={rwOut} readOnly aria-label="改写结果" />
            <button type="button" className="btn-ghost" onClick={collect} data-testid="collect-rewrite">＋ 收进简历稿</button>
          </div>
        )}
      </div>
    </div>
  )
}

/* ------------------------------ ⑥ 简历稿 ------------------------------ */

function DraftPane({ ctx, resumeText, setResumeText }: { ctx: CaseStepContext; resumeText: string; setResumeText: Dispatch<SetStateAction<string>> }) {
  const [msg, setMsg] = useState('')

  const saveVersion = async (asFinal = false) => {
    if (!resumeText.trim() || !ctx.profile) return
    const name = asFinal ? `简历终稿 · ${todayLocal()}` : `简历稿 · ${new Date().toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}`
    await ctx.saveDoc(name, resumeText.trim(), 'resumeDraft')
    setMsg(asFinal ? '终稿已存为本案例文件；交付前别忘了「交付核对」清单。' : '已保存为新版本——客户反馈后在当前文本上改，再存下一版。')
  }

  const exportResume = async (kind: 'md' | 'docx') => {
    if (!resumeText.trim()) return
    if (kind === 'md') {
      downloadFile(`简历稿-${ctx.profile?.clientName || ctx.profile?.name || '客户'}.md`, resumeText, 'text/markdown')
      setMsg('已下载 Markdown。')
    } else {
      const name = await exportTextDocx(`简历稿 · ${ctx.profile?.clientName || ctx.profile?.name || '客户'}`, resumeText)
      setMsg(`已生成 ${name}（PDF 可在 Word 中另存）。`)
    }
  }

  return (
    <div className="set-card">
      <h2>简历稿（条目在这里攒成稿，客户反馈后存新版本）</h2>
      <div className="desc">改写条目收进来、直接写、整份粘贴都行；每存一次就是一个版本，全案例可回看。终稿导出 Word 后另存 PDF。</div>
      <div className="set-body">
        {ctx.resumeDrafts.length > 0 && (
          <div className="set-row" style={{ alignItems: 'flex-start' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--ink-faint)', marginBottom: 'var(--sp-1)' }}>已有版本（{ctx.resumeDrafts.length}）</div>
              {ctx.resumeDrafts.map((f) => (
                <div key={f.id} style={{ display: 'flex', gap: 'var(--sp-2)', alignItems: 'baseline', padding: '2px 0' }}>
                  <span style={{ fontSize: 'var(--fs-sm)' }}>{f.name}</span>
                  <details style={{ flex: 1 }}>
                    <summary style={{ cursor: 'pointer', fontSize: 'var(--fs-xs)', color: 'var(--ink-faint)', display: 'inline' }}>查看</summary>
                    <pre style={{ whiteSpace: 'pre-wrap', fontSize: 'var(--fs-xs)', margin: 'var(--sp-1) 0 0' }}>{f.text}</pre>
                  </details>
                  <button
                    type="button"
                    className="mini-btn"
                    onClick={() => {
                      if (window.confirm(`删除版本「${f.name}」？（软删除）`)) void softDeleteCaseFile(f.id).then(ctx.refresh)
                    }}
                  >
                    删除
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
        <div className="set-row" style={{ alignItems: 'flex-start' }}>
          <textarea
            className="input"
            style={{ flex: 1, fontFamily: 'var(--font-mono, monospace)' }}
            rows={12}
            placeholder={'简历稿内容。可以从条目改写"收进"开始，也可以直接粘贴现有简历来改。建议结构：\n# 姓名 · 目标岗位\n## 核心业绩\n…\n## 工作经历\n…'}
            value={resumeText}
            aria-label="简历稿内容"
            onChange={(e) => setResumeText(e.target.value)}
          />
        </div>
        <div className="set-row" style={{ flexWrap: 'wrap' }}>
          <button type="button" className="btn-primary" disabled={!resumeText.trim()} onClick={() => void saveVersion(false)} data-testid="resume-save">💾 保存为新版本</button>
          <button type="button" className="btn-ghost" disabled={!resumeText.trim()} onClick={() => void saveVersion(true)}>🏁 存为终稿</button>
          <button type="button" className="btn-ghost" disabled={!resumeText.trim()} onClick={() => void exportResume('docx')}>⬇ Word（.docx）</button>
          <button type="button" className="btn-ghost" disabled={!resumeText.trim()} onClick={() => void exportResume('md')}>⬇ Markdown</button>
          {msg && <span className="val" style={{ fontSize: 'var(--fs-xs)', color: 'var(--ok)' }}>{msg}</span>}
        </div>
      </div>
    </div>
  )
}

/* ------------------------------ 辅助：分析草稿 ------------------------------ */

function AnalysisPane({ ctx }: { ctx: CaseStepContext }) {
  const [view, setView] = useState<ArticleView>(ARTICLE_VIEWS.find((v) => v.id === 'resume-tailoring') ?? ARTICLE_VIEWS[0]!)
  const [audience, setAudience] = useState<'internal' | 'external'>('external')
  const [draft, setDraft] = useState<ArticleDraft | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [exportMsg, setExportMsg] = useState('')

  const run = async () => {
    const materials = ctx.clientMaterials.map((f) => ({ id: f.id, kind: 'note' as const, title: f.name, body: f.text, createdAt: f.createdAt, sourceLabel: '案例材料' }))
    setBusy(true)
    setErr('')
    try {
      const text = await ctx.callAI(ARTICLE_SYSTEM_PROMPT, buildArticleUserPrompt({ materials, view, scopeLabel: ctx.profile?.name }), 8000)
      setDraft(parseArticle(text))
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const doExport = (kind: 'md' | 'docx') => {
    if (!draft) return
    if (kind === 'md') {
      downloadFile(`${draft.title}.md`, articleToMarkdown(draft), 'text/markdown')
    } else {
      void exportArticleDocx(draft).then((name) => setExportMsg(`已生成 ${name}`))
    }
  }

  return (
    <>
      <div className="set-card">
        <h2>分析草稿（调研 / 建议类文档）</h2>
        <div className="desc">选视角和受众，把案例材料整理成文档（简历定制建议 / 企业调研速览 / 自由整理），逐节修改后导出。</div>
        <div className="set-body">
          <div className="set-row">
            <label>视角</label>
            <div className="radio">
              {ARTICLE_VIEWS.map((v) => (
                <button key={v.id} type="button" className={view.id === v.id ? 'on' : ''} onClick={() => setView(v)}>{v.name}</button>
              ))}
            </div>
          </div>
          <div className="set-row">
            <label>用途</label>
            <div className="radio">
              <button type="button" className={audience === 'external' ? 'on' : ''} onClick={() => setAudience('external')}>给客户</button>
              <button type="button" className={audience === 'internal' ? 'on' : ''} onClick={() => setAudience('internal')}>自己用</button>
            </div>
          </div>
          {draft === null ? (
            <div className="set-row" style={{ flexWrap: 'wrap' }}>
              <button type="button" className="btn-primary" disabled={!ctx.clientMaterials.length || busy || !coachReady()} onClick={() => void run()}>
                {busy ? '⟳ AI 整理中…' : '🤖 AI 整理成分析草稿'}
              </button>
              <button type="button" className="btn-ghost" onClick={() => setDraft(getArticleView(view.id).skeleton())}>用手动骨架（不需要 AI）</button>
              {!coachReady() && (
                <span className="val" style={{ fontSize: 'var(--fs-xs)', color: 'var(--ink-faint)' }}>
                  AI 需要先在 <NavLink to="/settings">设置 → AI · BYOK</NavLink> 配置。
                </span>
              )}
              {err && <span className="val" style={{ fontSize: 'var(--fs-xs)', color: 'var(--danger)' }}>{err}</span>}
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
              <span className="val" style={{ fontSize: 'var(--fs-xs)', color: 'var(--ink-faint)' }}>PDF 可在 Word 中另存</span>
              {exportMsg && <span className="val" style={{ fontSize: 'var(--fs-xs)', color: 'var(--ok)' }}>{exportMsg}</span>}
              <button type="button" className="mini-btn" onClick={() => setDraft(null)}>丢弃草稿</button>
            </div>
            <ArticleEditor draft={draft} onChange={setDraft} />
          </div>
        </div>
      )}
    </>
  )
}

/* ------------------------------ ⑦⑧ 交付核对 ------------------------------ */

function DeliveryPane({ ctx }: { ctx: CaseStepContext }) {
  const toggle = async (did: string) => {
    if (!ctx.profile) return
    await toggleProfileDeliverable(ctx.profile.id, did)
    void useProfiles.getState().load()
  }

  return (
    <div className="set-card">
      <h2>交付包核对清单</h2>
      <div className="desc">简历修改服务共 7 件交付物（08 手册 §四）。模板在项目「交付物模板」目录；诊断报告在「匹配诊断」生成后可从材料导出。全部勾完，去案例库把状态切到「已交付」。</div>
      <div className="set-body">
        {DELIVERABLE_CHECKLIST.map((d) => (
          <div className="set-row" key={d.id}>
            <label style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--sp-2)', cursor: 'pointer', flex: 1, minWidth: 0 }}>
              <input
                type="checkbox"
                checked={ctx.checked.includes(d.id)}
                onChange={() => void toggle(d.id)}
                aria-label={`交付物：${d.label}`}
                data-testid={`deliverable-${d.id}`}
              />
              <span style={{ fontSize: 'var(--fs-sm)', fontWeight: 600 }}>{d.label}</span>
              <span className="val" style={{ fontSize: 'var(--fs-xs)', color: 'var(--ink-faint)' }}>{d.hint}</span>
            </label>
          </div>
        ))}
        <div className="set-row">
          <span className="val" style={{ fontSize: 'var(--fs-xs)', color: 'var(--ink-faint)' }}>
            面试衔接（可选，SOP⑧）：需要时把话术卡粘贴/上传进「文件与材料」，左侧第八步会自动亮起。
          </span>
        </div>
      </div>
    </div>
  )
}

/* ------------------------------ 路由宿主：全部挂载、按步显示 ------------------------------ */

export function CaseStepHost(props: { step: string; ctx: CaseStepContext }) {
  const [resumeText, setResumeText] = useState('')
  const { step, ctx } = props
  const show = (s: string) => ({ hidden: step !== s })
  return (
    <>
      <div {...show('materials')}><MaterialsPane ctx={ctx} /></div>
      <div {...show('decode')}><DecodePane ctx={ctx} /></div>
      <div {...show('interview')}><InterviewPane ctx={ctx} /></div>
      <div {...show('diagnose')}><DiagnosePane ctx={ctx} /></div>
      <div {...show('rewrite')}><RewritePane ctx={ctx} setResumeText={setResumeText} /></div>
      <div {...show('draft')}><DraftPane ctx={ctx} resumeText={resumeText} setResumeText={setResumeText} /></div>
      <div {...show('analysis')}><AnalysisPane ctx={ctx} /></div>
      <div {...show('delivery')}><DeliveryPane ctx={ctx} /></div>
    </>
  )
}
