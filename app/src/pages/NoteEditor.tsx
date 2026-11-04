import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { marked } from 'marked'
import DOMPurify from 'dompurify'
import { getNote, noteToMarkdown, downloadFile, attachTaskToNote } from '../db/repo'
import { useTasks } from '../store/tasks'
import { useNotes } from '../store/notes'
import { fmtLocal } from '../engine/datetime'
import { toast } from '../engine/toast'
import { recordError } from '../engine/errorLog'
import {
  MAX_ATTACHMENTS_PER_NOTE,
  attachmentDataUrl,
  deleteAttachmentFile,
  imageFromPaste,
  saveImageAttachment,
} from '../engine/attachments'
import { isDesktopApp } from '../engine/platform'
import type { Note, NoteAttachment } from '../types/models'

const SAVE_DEBOUNCE_MS = 600

/**
 * 速记编辑器（PRD §4.3）：Markdown + frontmatter 折叠面板 + 自动保存（防丢，先落库原则）。
 * '/input/notes/new'：首次输入非空内容时才创建实体（避免空速记堆积）。
 */
export function NoteEditor() {
  const { id = '' } = useParams()
  const isNew = id === 'new'
  const navigate = useNavigate()
  const updateNote = useNotes((s) => s.update)
  const createNote = useNotes((s) => s.create)
  const softDelete = useNotes((s) => s.softDelete)
  const restore = useNotes((s) => s.restore)

  const [note, setNote] = useState<Note | null>(null)
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [tagsText, setTagsText] = useState('')
  const [savedAt, setSavedAt] = useState<string | null>(null)
  const [loading, setLoading] = useState(!isNew)
  const [notFound, setNotFound] = useState(false)
  const createTask = useTasks((s) => s.create)
  const [taskCreated, setTaskCreated] = useState(false)
  const [taskBusy, setTaskBusy] = useState(false)
  const [mode, setMode] = useState<'edit' | 'read'>('edit')
  const taRef = useRef<HTMLTextAreaElement>(null)
  // 附件粘贴（R2 桌面先行）：图片 Ctrl+V 即存盘挂到本条；busy 防连粘
  const [attBusy, setAttBusy] = useState(false)
  // 附件元数据以 store 为权威来源（update → reload 自动刷新，不经本地 note 状态——
  // 新建后跳转会与加载 effect 抢时序，本地状态被旧快照回写，e2e 实抓）
  const noteIdInStore = note?.id ?? ''
  const storeAttachments = useNotes((s) => s.notes.find((n) => n.id === noteIdInStore)?.attachments)

  // noteRef 供卸载时的 flush 使用（Hook 全部先于早退 return —— 开发复盘 1.1）
  // hydrated 记录"从库读回的值"：只有当前值 ≠ 读回值才算用户改动（只打开不改字不写库、不改 updatedAt）
  const stateRef = useRef({ noteId: '', title, body, tagsText, dirty: false, hydrated: '', note: null as Note | null })
  stateRef.current = { ...stateRef.current, noteId: note?.id ?? '', title, body, tagsText, note }

  useEffect(() => {
    if (isNew) {
      setNote(null)
      setTitle('')
      setBody('')
      setTagsText('')
      setSavedAt(null)
      setLoading(false)
      setNotFound(false)
      setTaskCreated(false)
      stateRef.current.hydrated = ''
      stateRef.current.dirty = false
      return
    }
    // 自己 navigate 过来的 id（粘贴附件时先建实体再跳转）：实体刚建、note 已在状态，
    // 重取反而拿到写入前的旧快照把附件元数据冲掉（e2e 实抓的竞态），跳过
    if (stateRef.current.noteId === id && stateRef.current.note) return
    let alive = true
    setLoading(true)
    setTaskCreated(false)
    void getNote(id)
      .then((n) => {
        if (!alive) return
        if (!n) {
          setNotFound(true)
        } else {
          setNote(n)
          setTitle(n.title)
          setBody(n.body)
          setTagsText(n.tags.join(' '))
          setSavedAt(n.updatedAt)
          // 读回值快照：字段变化后 flush 前比对，一致则视为未修改
          stateRef.current.hydrated = JSON.stringify([n.title, n.body, n.tags.join(' ')])
          stateRef.current.dirty = false
        }
        setLoading(false)
      })
      .catch(() => {
        if (!alive) return
        setLoading(false)
        setNotFound(true)
      })
    return () => {
      alive = false
    }
  }, [id, isNew])

  // 自动保存：防抖落库；卸载时 flush 未保存的修改
  useEffect(() => {
    if (!note) return
    const s = stateRef.current
    if (!s.dirty && s.hydrated !== '' && JSON.stringify([s.title, s.body, s.tagsText]) === s.hydrated) return
    s.dirty = true
    const t = window.setTimeout(() => void flush(), SAVE_DEBOUNCE_MS)
    return () => window.clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 任意字段变化都触发同一防抖
  }, [title, body, tagsText, note?.id])

  async function flush() {
    const s = stateRef.current
    if (!s.noteId || !s.dirty) return
    s.dirty = false
    await updateNote(s.noteId, {
      title: s.title,
      body: s.body,
      tags: s.tagsText
        .split(/[\s,，#]+/)
        .map((t) => t.trim())
        .filter(Boolean),
    })
    setSavedAt(new Date().toISOString())
  }

  // 卸载 flush（切换路由/组件卸载时兜底保存）
  useEffect(
    () => () => {
      const s = stateRef.current
      if (s.noteId && s.dirty) {
        s.dirty = false
        void updateNote(s.noteId, {
          title: s.title,
          body: s.body,
          tags: s.tagsText.split(/[\s,，#]+/).map((t) => t.trim()).filter(Boolean),
        })
      }
    },
    [updateNote],
  )

  // 阅读态渲染（放在早退 return 之前：Hook 不得条件调用）
  const html = useMemo(
    () => (mode === 'read' ? DOMPurify.sanitize(marked.parse(body, { async: false })) : ''),
    [mode, body],
  )

  /** 新速记：内容非空时首次创建，随后 replace 到真实 id 路由。
   *  note.id 兜底：路由切换会让壳层 ErrorBoundary 按 pathname 重挂组件（key 设计如此），
   *  stateRef 归零而 note 已由加载 effect 从库取回——接着原实体写，不再另起新条。 */
  async function ensureCreated(): Promise<string | null> {
    if (stateRef.current.noteId) return stateRef.current.noteId
    if (note?.id) {
      stateRef.current.noteId = note.id
      return note.id
    }
    if (!title.trim() && !body.trim()) return null
    const created = await createNote({ title, body, tags: parseTags(tagsText), source: 'manual' })
    stateRef.current.noteId = created.id
    stateRef.current.dirty = false
    stateRef.current.hydrated = JSON.stringify([title, body, tagsText])
    setNote(created)
    setSavedAt(created.updatedAt)
    navigate(`/input/notes/${created.id}`, { replace: true })
    return created.id
  }

  /** 粘贴图片落库前的实体保障：正文/标题都空的新速记也允许只存图片（正文给占位首行） */
  async function ensureCreatedForAttachment(): Promise<string> {
    const existing = await ensureCreated()
    if (existing) return existing
    const created = await createNote({ title: '图片', body: '（图片）', tags: parseTags(tagsText), source: 'manual' })
    stateRef.current.noteId = created.id
    stateRef.current.dirty = false
    stateRef.current.hydrated = JSON.stringify([created.title, created.body, tagsText])
    setNote(created)
    setBody(created.body)
    setTitle(created.title)
    setSavedAt(created.updatedAt)
    navigate(`/input/notes/${created.id}`, { replace: true })
    return created.id
  }

  /** 粘贴图片 → 存盘 + 挂到本条（上限拦截，失败提示且不丢图——图还在剪贴板）。
   *  元数据一律以数据库读回为准：新速记粘贴会触发路由切换与加载 effect，本地乐观状态
   *  会被旧快照回写冲掉（e2e 实抓），update 后重取才可靠。 */
  const onPasteImage = async (e: React.ClipboardEvent) => {
    if (!isDesktopApp()) return
    const img = imageFromPaste(e)
    if (!img) return // 文字粘贴走浏览器默认
    e.preventDefault()
    if ((storeAttachments?.length ?? 0) >= MAX_ATTACHMENTS_PER_NOTE) {
      toast('error', `一条速记最多 ${MAX_ATTACHMENTS_PER_NOTE} 个附件`)
      return
    }
    if (attBusy) return
    setAttBusy(true)
    try {
      const noteId = await ensureCreatedForAttachment()
      const meta = await saveImageAttachment(img.blob, img.name)
      const fresh = await getNote(noteId)
      const next: NoteAttachment[] = [...(fresh?.attachments ?? []), meta]
      await updateNote(noteId, { attachments: next })
      toast('ok', '图片已存为附件')
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      toast('error', `图片存附件失败：${msg}`)
      void recordError({ where: '速记附件粘贴', kind: 'app', message: msg }, { silent: true })
    } finally {
      setAttBusy(false)
    }
  }

  /** 摘除附件：删文件 + 元数据移除（正文不留引用语法，v1 附件与正文分列呈现） */
  const removeAttachment = async (att: NoteAttachment, id: string) => {
    if (!id || !window.confirm(`摘除附件「${att.name}」？文件会从附件目录删除。`)) return
    try {
      await deleteAttachmentFile(att.file)
    } catch (err) {
      // 文件删除失败不拦元数据移除（孤儿文件可由用户手动清理）；如实留痕
      void recordError({ where: '速记附件删除', kind: 'app', message: err instanceof Error ? err.message : String(err) }, { silent: true })
    }
    const fresh = await getNote(id)
    const next = (fresh?.attachments ?? []).filter((a) => a.id !== att.id)
    await updateNote(id, { attachments: next })
  }

  // 编辑新速记时也走防抖创建（输入停顿 600ms 且非空 → 落库）
  useEffect(() => {
    if (!isNew) return
    if (!title.trim() && !body.trim() && !tagsText.trim()) return
    const t = window.setTimeout(() => void ensureCreated(), SAVE_DEBOUNCE_MS + 400)
    return () => window.clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 创建只依赖输入内容
  }, [title, body, tagsText, isNew])

  if (loading) {
    return <div className="empty"><p>加载中…</p></div>
  }
  if (notFound) {
    return (
      <div className="empty">
        <div className="e-ico" aria-hidden>∅</div>
        <p>这条速记不存在（可能已被清理）。</p>
        <button type="button" className="btn-ghost" onClick={() => navigate('/input/notes')}>返回列表</button>
      </div>
    )
  }

  const deleted = note?.deletedAt != null
  const charCount = body.replace(/\s/g, '').length
  const lineCount = body ? body.split('\n').length : 0
  const attachments = storeAttachments ?? note?.attachments ?? []

  return (
    <div className="editor" data-testid="note-editor">
      <div className="editor-head">
        <span>Markdown · 自动保存</span>
        <span className="saved" data-testid="note-stats">
          {charCount} 字 · {lineCount} 行
          {savedAt ? ` · 已保存 ${fmtLocal(savedAt)}` : ' · 未保存'}
        </span>
      </div>
      <input
        className="e-title"
        value={title}
        placeholder="标题（可选，默认取首行）"
        onChange={(e) => setTitle(e.target.value)}
        aria-label="速记标题"
      />
      <div className="e-toolbar" aria-label="格式工具栏">
        <button type="button" onClick={() => wrapSelection('**', '**')}><b>B</b></button>
        <button type="button" onClick={() => wrapSelection('*', '*')}><b>I</b></button>
        <button type="button" onClick={() => insertLine('- ')}>• 列表</button>
        <button type="button" onClick={() => insertLine('> ')}>❝ 引用</button>
        <button type="button" onClick={() => wrapSelection('`', '`')}>⟨⟩ 代码</button>
        <span style={{ flex: 1 }} />
        <button
          type="button"
          onClick={() => setMode(mode === 'edit' ? 'read' : 'edit')}
          title={mode === 'edit' ? '渲染 Markdown 阅读态' : '回到编辑'}
          data-testid="preview-toggle"
        >
          {mode === 'edit' ? '预览' : '编辑'}
        </button>
      </div>
      {mode === 'edit' ? (
        <textarea
          ref={taRef}
          className="e-body"
          value={body}
          placeholder={isDesktopApp() ? '想到什么写什么……（Markdown；截图可直接 Ctrl+V 存为附件）' : '想到什么写什么……（Markdown）'}
          onChange={(e) => setBody(e.target.value)}
          onBlur={() => void flush()}
          onPaste={(e) => void onPasteImage(e)}
          aria-label="速记正文"
        />
      ) : (
        <div className="e-body md-body" data-testid="note-preview" aria-label="渲染后的正文">
          {body.trim() ? (
            <div dangerouslySetInnerHTML={{ __html: html }} />
          ) : (
            <p className="coach-say" style={{ margin: 0 }}>（空）</p>
          )}
        </div>
      )}
      {/* 附件行（编辑态）：chips 可摘除；阅读态走下方画廊。元数据以 store 为权威来源 */}
      {mode === 'edit' && attachments.length > 0 && (
        <div className="att-row" data-testid="att-row">
          {attachments.map((a) => (
            <span className="att-chip" key={a.id}>
              📎 {a.name} · {Math.max(1, Math.round(a.size / 1024))} KB
              <button
                type="button"
                className="att-x"
                aria-label={`摘除附件 ${a.name}`}
                title="摘除（文件从附件目录删除）"
                onClick={() => void removeAttachment(a, noteIdInStore)}
              >
                ✕
              </button>
            </span>
          ))}
        </div>
      )}
      {/* 附件画廊（阅读态）：缩略图直出（字节从 attachments 目录读，不进库） */}
      {mode === 'read' && attachments.length > 0 && (
        <div className="att-gallery" data-testid="att-gallery">
          {attachments.map((a) => (
            <AttachmentThumb key={a.id} att={a} />
          ))}
        </div>
      )}
      <details className="fm">
        <summary>frontmatter 与元信息</summary>
        <div className="fm-row">
          <span>标签（空格或逗号分隔）：</span>
          <input
            className="input"
            value={tagsText}
            placeholder="#想法 #复盘"
            onChange={(e) => setTagsText(e.target.value)}
            aria-label="标签"
          />
        </div>
        <div style={{ paddingTop: 'var(--sp-2)' }}>
          <code>id: {note?.id ?? '（保存后生成）'}</code>
          {note && (
            <>
              <br /><code>created: {note.createdAt}</code>
              <br /><code>source: {note.source}</code>
              <br /><code>links: items {note.links.itemIds.length} · reviews {note.links.reviewIds.length} · tasks {note.links.taskIds.length}（转待办/挂到复盘自动维护）</code>
            </>
          )}
        </div>
      </details>
      <div className="editor-foot">
        <button
          type="button"
          className="btn-ghost"
          disabled={!note || taskCreated || taskBusy}
          title={taskCreated ? '已在待办库创建，可去 待办 页查看（来源:速记 可溯源）' : '以这条速记为源创建一条待办'}
          onClick={() => {
            if (!note || taskCreated || taskBusy) return
            setTaskBusy(true)
            const title = note.title || note.body.split('\n')[0].trim().slice(0, 60)
            void createTask({ title, origin: { kind: 'note', refId: note.id } })
              .then(async (t) => {
                await attachTaskToNote(note.id, t.id)
                setTaskCreated(true)
              })
              .catch(() => setTaskBusy(false))
          }}
        >
          {taskCreated ? '✅ 已入待办' : '转待办'}
        </button>
        <button
          type="button"
          className="btn-ghost"
          disabled={!note}
          title="带着这条速记做一次复盘：选场景后它会作为挂载素材出现在向导里"
          onClick={() => note && navigate(`/review/new?note=${encodeURIComponent(note.id)}`)}
        >
          挂到复盘
        </button>
        <button
          type="button"
          className="btn-ghost"
          disabled={!note}
          onClick={() => note && downloadFile(`${note.title || note.id}.md`, noteToMarkdown(note), 'text/markdown')}
        >
          导出 md
        </button>
        <span style={{ flex: 1 }} />
        {deleted ? (
          <>
            <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--danger)' }}>已删除（软删除，可恢复）</span>
            <button type="button" className="btn-ghost" onClick={() => void restore(note.id)}>恢复</button>
          </>
        ) : (
          note && (
            <button
              type="button"
              className="btn-ghost"
              onClick={() => {
                void flush().then(() => {
                  void softDelete(note.id)
                  navigate('/input/notes')
                })
              }}
            >
              删除
            </button>
          )
        )}
      </div>

      {deleted && (
        <div className="notice" style={{ margin: '0 var(--sp-5) var(--sp-4)' }}>
          这条速记在回收站中——数据仍在库里，没有真删，可在列表页「回收站」恢复。
        </div>
      )}
    </div>
  )

  function parseTags(text: string): string[] {
    return text.split(/[\s,，#]+/).map((t) => t.trim()).filter(Boolean)
  }
  /** 包裹选区（无选区时在光标处插入成对标记，光标落在中间）；作用于真实选区而非全文首尾 */
  function wrapSelection(before: string, after: string) {
    const ta = taRef.current
    const s = ta?.selectionStart ?? body.length
    const e = ta?.selectionEnd ?? s
    const selected = body.slice(s, e)
    setBody(body.slice(0, s) + before + selected + after + body.slice(e))
    requestAnimationFrame(() => {
      ta?.focus()
      ta?.setSelectionRange(s + before.length, s + before.length + selected.length)
    })
  }

  /** 在光标所在行行首插入前缀（列表/引用），不再追加到全文末尾 */
  function insertLine(prefix: string) {
    const ta = taRef.current
    const pos = ta?.selectionStart ?? body.length
    const lineStart = body.lastIndexOf('\n', Math.max(0, pos - 1)) + 1
    setBody(body.slice(0, lineStart) + prefix + body.slice(lineStart))
    requestAnimationFrame(() => {
      ta?.focus()
      ta?.setSelectionRange(pos + prefix.length, pos + prefix.length)
    })
  }
}

/** 附件缩略图（阅读态画廊）：字节从 attachments 目录读（base64 → data: URL），失败显示占位 */
function AttachmentThumb({ att }: { att: NoteAttachment }) {
  const [src, setSrc] = useState<string | null>(null)
  useEffect(() => {
    let alive = true
    void attachmentDataUrl(att)
      .then((u) => {
        if (alive) setSrc(u)
      })
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [att])
  return (
    <figure className="att-thumb">
      {src ? <img src={src} alt={att.name} loading="lazy" /> : <div className="att-miss" aria-hidden>🖼</div>}
      <figcaption>{att.name}</figcaption>
    </figure>
  )
}
