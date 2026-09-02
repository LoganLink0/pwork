import { useEffect, useRef, useState } from 'react'
import { useNotes } from '../../store/notes'
import { useTasks } from '../../store/tasks'
import { useUi } from '../../store/ui'

const DRAFT_KEY = 'pwork-quicknote-draft'

interface Draft {
  body: string
  tags: string
}

function loadDraft(): Draft {
  try {
    const v = localStorage.getItem(DRAFT_KEY)
    if (!v) return { body: '', tags: '' }
    const parsed = JSON.parse(v) as Partial<Draft>
    return { body: parsed.body ?? '', tags: parsed.tags ?? '' }
  } catch {
    return { body: '', tags: '' }
  }
}

/**
 * 全局速记浮层（PRD §3.4 F1）：捕获 ≤3 次交互（N → 输入 → Esc）。
 * 关闭卸载、打开重挂；草稿在关闭时写 localStorage，重开恢复。
 * 「转待办」：先落速记再以速记为源建任务（origin.note 溯源）。
 */
export function QuickNote() {
  const open = useUi((s) => s.quickOpen)
  if (!open) return null
  return <QuickNoteDialog />
}

function QuickNoteDialog() {
  const close = useUi((s) => s.closeQuick)
  const createNote = useNotes((s) => s.create)
  const createTask = useTasks((s) => s.create)
  // 初始态来自草稿（useState 初始化器，不在 effect 里 setState）
  const [draft0] = useState(loadDraft)
  const [body, setBody] = useState(draft0.body)
  const [tags, setTags] = useState(draft0.tags)
  const [saving, setSaving] = useState(false)
  const taRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    requestAnimationFrame(() => taRef.current?.focus())
  }, [])

  const saveDraft = () => {
    if (body.trim()) localStorage.setItem(DRAFT_KEY, JSON.stringify({ body, tags } satisfies Draft))
    else localStorage.removeItem(DRAFT_KEY)
  }

  const save = async () => {
    if (!body.trim() || saving) return
    setSaving(true)
    try {
      await createNote({
        body,
        tags: tags
          .split(/[\s,，#]+/)
          .map((t) => t.trim())
          .filter(Boolean),
        source: 'quick',
      })
      setBody('')
      setTags('')
      localStorage.removeItem(DRAFT_KEY)
      close()
    } finally {
      setSaving(false)
    }
  }

  /** 转待办：先落速记，再以速记为源建任务（origin.note 溯源） */
  const saveAsTask = async () => {
    if (!body.trim() || saving) return
    setSaving(true)
    try {
      const note = await createNote({
        body,
        tags: tags
          .split(/[\s,，#]+/)
          .map((t) => t.trim())
          .filter(Boolean),
        source: 'quick',
      })
      await createTask({ title: note.title || body, origin: { kind: 'note', refId: note.id } })
      setBody('')
      setTags('')
      localStorage.removeItem(DRAFT_KEY)
      close()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="overlay" onClick={(e) => e.target === e.currentTarget && close()}>
      <div className="qn-modal" role="dialog" aria-label="速记">
        <textarea
          ref={taRef}
          value={body}
          placeholder="想到什么写什么……（Markdown）"
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.preventDefault()
              saveDraft()
              close()
            }
            // Ctrl/Cmd + Enter 快速保存
            if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
              e.preventDefault()
              void save()
            }
          }}
          aria-label="速记内容"
        />
        <div className="qn-foot">
          <input
            className="input tag-in"
            placeholder="#标签（可选）"
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            aria-label="标签"
          />
          <span className="hint">Esc 存草稿 · Ctrl↵ 保存</span>
          <button type="button" className="btn-ghost" disabled={!body.trim() || saving} onClick={() => void saveAsTask()}>
            转待办
          </button>
          <button type="button" className="btn-primary" onClick={() => void save()} disabled={!body.trim()}>
            保存
          </button>
        </div>
      </div>
    </div>
  )
}
