import { useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  defaultTemplate,
  extractMaterial,
  exportWriterPptx,
  buildOutlineUserPrompt,
  OUTLINE_SYSTEM_PROMPT,
  parseOutline,
  type WriterMaterial,
  type WriterOutline,
  type WriterSlide,
} from '../engine/pptWriter'
import { downloadFile } from '../db/repo'
import { chatCompletion } from '../modules/review/engine/llm'
import { loadCoachConfig, llmConfigFrom } from '../modules/review/engine/coach'

const coachReady = () => Boolean(loadCoachConfig().apiKey)

/** PPT 撰写（输出）：从零起草一份 PPT——主题 + 材料 → AI 大纲（逐页审核修改）→ 可编辑 .pptx。
 *  调研对象材料的分析在 输入 → 外部数据 的对象工作台里做（分工：那里管材料与分析，这里管从零成稿）。 */
export function PptWriter() {
  const [materials, setMaterials] = useState<WriterMaterial[]>([])
  const [pasteName, setPasteName] = useState('')
  const [pasteText, setPasteText] = useState('')
  const [extracting, setExtracting] = useState(false)
  const [extractErr, setExtractErr] = useState('')

  const [topic, setTopic] = useState('')
  const [audience, setAudience] = useState<'internal' | 'external'>('internal')
  const [pageTarget, setPageTarget] = useState(12)

  const [outline, setOutline] = useState<WriterOutline | null>(null)
  const [aiBusy, setAiBusy] = useState(false)
  const [aiError, setAiError] = useState('')
  const [exportBusy, setExportBusy] = useState(false)
  const [exportMsg, setExportMsg] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  const totalChars = materials.reduce((n, m) => n + m.text.length, 0)

  const addFiles = async (files: FileList) => {
    setExtractErr('')
    setExtracting(true)
    try {
      const added: WriterMaterial[] = []
      for (const f of Array.from(files)) {
        try {
          const text = await extractMaterial(f)
          if (text.trim()) added.push({ name: f.name, text })
          else setExtractErr((prev) => `${prev}${prev ? '\n' : ''}${f.name}：没有提取到文字内容`)
        } catch (e) {
          setExtractErr((prev) => `${prev}${prev ? '\n' : ''}${f.name}：${e instanceof Error ? e.message : '提取失败'}`)
        }
      }
      if (added.length) setMaterials((ms) => [...ms, ...added])
    } finally {
      setExtracting(false)
    }
  }

  const addPaste = () => {
    if (!pasteText.trim()) return
    setMaterials((ms) => [...ms, { name: pasteName.trim() || `粘贴材料 ${ms.length + 1}`, text: pasteText.trim() }])
    setPasteName('')
    setPasteText('')
  }

  const generateOutline = async () => {
    if (aiBusy || !topic.trim() || materials.length === 0) return
    setAiBusy(true)
    setAiError('')
    try {
      const text = await chatCompletion(
        llmConfigFrom(loadCoachConfig()),
        OUTLINE_SYSTEM_PROMPT,
        buildOutlineUserPrompt({ topic: topic.trim(), audience, pageTarget }, materials),
        { maxTokens: 8000, timeoutMs: 90000 },
      )
      setOutline(parseOutline(text))
    } catch (e) {
      setAiError(e instanceof Error ? e.message : String(e))
    } finally {
      setAiBusy(false)
    }
  }

  const updateSlide = (i: number, patch: Partial<WriterSlide>) => {
    if (!outline) return
    setOutline({ ...outline, slides: outline.slides.map((sl, idx) => (idx === i ? { ...sl, ...patch } : sl)) })
  }
  const moveSlide = (i: number, dir: -1 | 1) => {
    if (!outline) return
    const j = i + dir
    if (j < 0 || j >= outline.slides.length) return
    const slides = [...outline.slides]
    ;[slides[i], slides[j]] = [slides[j]!, slides[i]!]
    setOutline({ ...outline, slides })
  }
  const removeSlide = (i: number) => {
    if (!outline) return
    setOutline({ ...outline, slides: outline.slides.filter((_, idx) => idx !== i) })
  }
  const addSlide = () => {
    if (!outline) return
    setOutline({ ...outline, slides: [...outline.slides, { layout: 'bullets', title: '新页面', bullets: ['（待填）'] }] })
  }

  const doExport = async () => {
    if (!outline || exportBusy) return
    setExportBusy(true)
    setExportMsg('')
    try {
      const name = await exportWriterPptx(outline)
      setExportMsg(`✅ 已生成 ${name}（全部为原生文本框与表格，可直接编辑）`)
    } catch (e) {
      setExportMsg(`生成失败：${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setExportBusy(false)
    }
  }

  const materialsReady = materials.length > 0

  return (
    <section className="settings" style={{ maxWidth: 'var(--content-w)' }}>
      <div className="page-head">
        <h1>PPT 撰写</h1>
        <span className="sub">从零起草：主题 + 材料 → AI 大纲（你逐页审核修改）→ 可编辑 PPT</span>
        <div className="right">
          <Link to="/output" className="btn-ghost">← 输出工具箱</Link>
        </div>
      </div>

      <div className="set-card">
        <h2>一、材料</h2>
        <div className="desc">直接粘贴文字；上传 .md / .txt；上传 Word（.docx）与 PDF（自动提取文字）。</div>
        <div className="set-body">
          <div className="set-row" style={{ alignItems: 'flex-start' }}>
            <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 'var(--sp-2)' }}>
              <input
                className="input"
                placeholder="粘贴材料名称（可选）"
                value={pasteName}
                aria-label="粘贴材料名称"
                onChange={(e) => setPasteName(e.target.value)}
              />
              <textarea
                className="input"
                rows={4}
                placeholder="把文字材料粘到这里……"
                value={pasteText}
                aria-label="粘贴材料内容"
                onChange={(e) => setPasteText(e.target.value)}
              />
              <div style={{ display: 'flex', gap: 'var(--sp-2)' }}>
                <button type="button" className="btn-ghost" disabled={!pasteText.trim()} onClick={addPaste}>
                  ＋ 添加文字材料
                </button>
                <button type="button" className="btn-ghost" disabled={extracting} onClick={() => fileRef.current?.click()} data-testid="writer-add-files">
                  {extracting ? '⟳ 提取中…' : '⬆ 上传文件（Word / PDF / MD / TXT）'}
                </button>
                <input
                  ref={fileRef}
                  type="file"
                  multiple
                  accept=".md,.txt,.docx,.pdf,.markdown"
                  style={{ display: 'none' }}
                  aria-label="选择材料文件"
                  onChange={(e) => {
                    if (e.target.files?.length) void addFiles(e.target.files)
                    e.target.value = ''
                  }}
                />
              </div>
            </div>
          </div>
          {extractErr && (
            <div className="set-row">
              <span className="val" style={{ fontSize: 'var(--fs-xs)', color: 'var(--danger)', whiteSpace: 'pre-wrap' }}>{extractErr}</span>
            </div>
          )}
          {materials.map((m, i) => (
            <div className="set-row" key={`${m.name}-${i}`} style={{ alignItems: 'flex-start' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 'var(--fs-sm)', fontWeight: 600 }}>{m.name}</div>
                <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--ink-faint)' }}>{m.text.length} 字 · 前 60 字：{m.text.slice(0, 60)}</div>
              </div>
              <button type="button" className="mini-btn" onClick={() => setMaterials((ms) => ms.filter((_, idx) => idx !== i))}>
                移除
              </button>
            </div>
          ))}
          {materialsReady && (
            <div className="set-row">
              <span className="val" style={{ fontSize: 'var(--fs-xs)', color: 'var(--ink-faint)' }}>
                共 {materials.length} 份材料 · {totalChars} 字
              </span>
            </div>
          )}
        </div>
      </div>

      <div className="set-card">
        <h2>二、主题与受众</h2>
        <div className="set-body">
          <div className="set-row">
            <label>报告主题</label>
            <input
              className="input"
              style={{ flex: 1 }}
              placeholder="如：XX 公司业务分析、XX 行业进入评估"
              value={topic}
              aria-label="报告主题"
              onChange={(e) => setTopic(e.target.value)}
            />
          </div>
          <div className="set-row">
            <label>受众</label>
            <div className="radio">
              <button type="button" className={audience === 'internal' ? 'on' : ''} onClick={() => setAudience('internal')}>内部（同事 / 领导）</button>
              <button type="button" className={audience === 'external' ? 'on' : ''} onClick={() => setAudience('external')}>外部（客户 / 合作方）</button>
            </div>
            <span className="val" style={{ color: 'var(--ink-faint)', fontSize: 'var(--fs-xs)' }}>
              内部可直写问题与风险；外部结论先行、措辞正式
            </span>
          </div>
          <div className="set-row">
            <label>目标页数</label>
            <input
              className="input"
              type="number"
              min={6}
              max={30}
              style={{ maxWidth: 90 }}
              value={pageTarget}
              aria-label="目标页数"
              onChange={(e) => setPageTarget(Math.max(6, Math.min(30, Number(e.target.value) || 12)))}
            />
          </div>
        </div>
      </div>

      <div className="set-card">
        <h2>三、大纲（生成后请逐页审核修改）</h2>
        <div className="desc">AI 只负责起草结构，你看到的大纲每一页都能改：改标题、改要点、删页、加页、调顺序。AI 可能写错或编造——数字务必回材料核对。</div>
        <div className="set-body">
          {outline === null ? (
            <div className="set-row" style={{ flexWrap: 'wrap' }}>
              <button
                type="button"
                className="btn-primary"
                disabled={!materialsReady || !topic.trim() || aiBusy || !coachReady()}
                onClick={() => void generateOutline()}
                data-testid="writer-generate"
              >
                {aiBusy ? '⟳ AI 起草中…' : '🤖 AI 起草大纲'}
              </button>
              <button
                type="button"
                className="btn-ghost"
                onClick={() => setOutline(defaultTemplate(topic.trim() || '业务分析', audience))}
              >
                用内置模板手填（不需要 AI）
              </button>
              {!coachReady() && (
                <span className="val" style={{ fontSize: 'var(--fs-xs)', color: 'var(--ink-faint)' }}>
                  AI 需要先在 <Link to="/settings">设置 → AI · BYOK</Link> 配置；不配置也能用模板手填。
                </span>
              )}
              {!materialsReady && (
                <span className="val" style={{ fontSize: 'var(--fs-xs)', color: 'var(--ink-faint)' }}>AI 起草需要至少一份材料。</span>
              )}
              {aiError && <span className="val" style={{ fontSize: 'var(--fs-xs)', color: 'var(--danger)' }}>{aiError}</span>}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-3)' }}>
              <div className="set-row">
                <label>报告标题</label>
                <input
                  className="input"
                  style={{ flex: 1 }}
                  value={outline.title}
                  aria-label="报告标题"
                  onChange={(e) => setOutline({ ...outline, title: e.target.value })}
                />
              </div>
              {outline.slides.map((sl, i) => (
                <div key={i} className="set-row" style={{ alignItems: 'flex-start', flexDirection: 'column', gap: 'var(--sp-2)', border: '1px solid var(--line)', borderRadius: 'var(--r-md)', padding: 'var(--sp-3)' }}>
                  <div style={{ display: 'flex', gap: 'var(--sp-2)', width: '100%', alignItems: 'center' }}>
                    <span className="val tnum" style={{ fontSize: 'var(--fs-xs)', color: 'var(--ink-faint)' }}>P{i + 1}</span>
                    <select
                      className="lane-select"
                      value={sl.layout}
                      aria-label={`第 ${i + 1} 页版式`}
                      onChange={(e) => updateSlide(i, { layout: e.target.value as WriterSlide['layout'] })}
                    >
                      {Object.entries(LAYOUT_LABEL).map(([k, label]) => (
                        <option key={k} value={k}>{label}</option>
                      ))}
                    </select>
                    <input
                      className="input"
                      style={{ flex: 1 }}
                      value={sl.title}
                      aria-label={`第 ${i + 1} 页标题`}
                      onChange={(e) => updateSlide(i, { title: e.target.value })}
                    />
                    <button type="button" className="mini-btn" title="上移" onClick={() => moveSlide(i, -1)}>↑</button>
                    <button type="button" className="mini-btn" title="下移" onClick={() => moveSlide(i, 1)}>↓</button>
                    <button type="button" className="mini-btn" onClick={() => removeSlide(i)}>删除</button>
                  </div>
                  {sl.layout === 'cover' && (
                    <input
                      className="input"
                      placeholder="封面副题（多个用换行）"
                      value={(sl.sub ?? []).join('\n')}
                      aria-label={`第 ${i + 1} 页副题`}
                      onChange={(e) => updateSlide(i, { sub: e.target.value.split('\n').filter(Boolean) })}
                    />
                  )}
                  {sl.layout === 'bullets' && (
                    <textarea
                      className="input"
                      rows={4}
                      placeholder="每行一条要点"
                      value={(sl.bullets ?? []).join('\n')}
                      aria-label={`第 ${i + 1} 页要点`}
                      onChange={(e) => updateSlide(i, { bullets: e.target.value.split('\n') })}
                    />
                  )}
                  {sl.layout === 'table' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-1)', width: '100%' }}>
                      <input
                        className="input"
                        placeholder="表头，用 | 分隔，如：指标 | 数值 | 说明"
                        value={(sl.table?.headers ?? []).join(' | ')}
                        aria-label={`第 ${i + 1} 页表头`}
                        onChange={(e) =>
                          updateSlide(i, {
                            table: {
                              headers: e.target.value.split('|').map((x) => x.trim()),
                              rows: sl.table?.rows ?? [],
                            },
                          })
                        }
                      />
                      <textarea
                        className="input"
                        rows={3}
                        placeholder={'每行一条数据，单元格用 | 分隔，如：\n线索数 | 23 | CRM 导出'}
                        value={(sl.table?.rows ?? []).map((r) => r.join(' | ')).join('\n')}
                        aria-label={`第 ${i + 1} 页表格内容`}
                        onChange={(e) =>
                          updateSlide(i, {
                            table: {
                              headers: sl.table?.headers ?? [],
                              rows: e.target.value.split('\n').filter(Boolean).map((line) => line.split('|').map((x) => x.trim())),
                            },
                          })
                        }
                      />
                    </div>
                  )}
                </div>
              ))}
              <div className="set-row">
                <button type="button" className="btn-ghost" onClick={addSlide}>＋ 加一页</button>
                <button type="button" className="btn-ghost" onClick={() => setOutline(null)}>丢弃大纲</button>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="set-card">
        <h2>四、导出</h2>
        <div className="set-body">
          <div className="set-row">
            <button type="button" className="btn-primary" disabled={!outline || exportBusy} onClick={() => void doExport()} data-testid="writer-export">
              {exportBusy ? '⟳ 生成中…' : '⬇ 生成可编辑 PPT'}
            </button>
            {outline && (
              <button
                type="button"
                className="btn-ghost"
                onClick={() => downloadFile(`${outline.title}.md`, outlineToMarkdown(outline), 'text/markdown')}
              >
                ⬇ 大纲存 .md
              </button>
            )}
            {exportMsg && <span className="val" style={{ fontSize: 'var(--fs-xs)' }}>{exportMsg}</span>}
          </div>
        </div>
      </div>
    </section>
  )
}

const LAYOUT_LABEL: Record<WriterSlide['layout'], string> = {
  cover: '封面',
  section: '章节页',
  bullets: '要点页',
  table: '表格页',
}

/** 大纲的 Markdown 存档（便于留底与二次编辑） */
function outlineToMarkdown(outline: WriterOutline): string {
  const L: string[] = [`# ${outline.title}`, '']
  for (const sl of outline.slides) {
    L.push(`## ${LAYOUT_LABEL[sl.layout]}：${sl.title}`)
    for (const b of sl.bullets ?? []) L.push(`- ${b}`)
    if (sl.sub?.length) L.push(`> ${sl.sub.join(' / ')}`)
    if (sl.table) {
      L.push(`| ${sl.table.headers.join(' | ')} |`)
      L.push(`| ${sl.table.headers.map(() => '---').join(' | ')} |`)
      for (const r of sl.table.rows) L.push(`| ${r.join(' | ')} |`)
    }
    L.push('')
  }
  return L.join('\n')
}
