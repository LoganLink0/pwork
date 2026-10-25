import { useEffect, useRef, useState } from 'react'
import { attachTaskToNote } from '../../db/repo'
import { useNotes } from '../../store/notes'
import { useTasks } from '../../store/tasks'
import { useUi } from '../../store/ui'
import { recordError } from '../../engine/errorLog'

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
 * 连续捕获（2026-10-24）：Ctrl+Enter 存了继续（清正文留标签，浮层不关）——连发场景每条省一次唤起；
 * 「保存」按钮与「转待办」存完关闭；Esc 任何时候收工。
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
  const [savedCount, setSavedCount] = useState(0)
  const taRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    requestAnimationFrame(() => taRef.current?.focus())
  }, [])

  const saveDraft = () => {
    if (body.trim()) localStorage.setItem(DRAFT_KEY, JSON.stringify({ body, tags } satisfies Draft))
    else localStorage.removeItem(DRAFT_KEY)
  }

  const tagsOf = () =>
    tags
      .split(/[\s,，#]+/)
      .map((t) => t.trim())
      .filter(Boolean)

  /** 存一条；continueMode=true 清正文留标签继续记（回执计数），否则收工关闭。失败不清输入（错误条已弹，用户内容不能丢） */
  const save = async (continueMode: boolean) => {
    if (!body.trim() || saving) return
    setSaving(true)
    try {
      await createNote({ body, tags: tagsOf(), source: 'quick' })
      if (continueMode) {
        setBody('')
        setSavedCount((n) => n + 1)
        // 已落库的内容不再是草稿；下一条输入中途 Esc 会按最新 body 重新存草稿
        localStorage.removeItem(DRAFT_KEY)
        requestAnimationFrame(() => taRef.current?.focus())
      } else {
        setBody('')
        setTags('')
        localStorage.removeItem(DRAFT_KEY)
        close()
      }
    } catch (e) {
      // 保留 body/tags 供重试或手动复制；失败要被看见（错误条弹出）
      recordError({ where: '速记浮层保存', kind: 'app', message: e instanceof Error ? e.message : String(e) })
    } finally {
      setSaving(false)
    }
  }

  /** 转待办：先落速记，再以速记为源建任务（origin.note 溯源）；单条决策，存完关闭。任一环失败保留输入 */
  const saveAsTask = async () => {
    if (!body.trim() || saving) return
    setSaving(true)
    try {
      const note = await createNote({
        body,
        tags: tagsOf(),
        source: 'quick',
      })
      await createTask({ title: note.title || body, origin: { kind: 'note', refId: note.id } }).then(async (t) => {
        // 双向挂接与编辑器一致：任务 id 写回 note.links.taskIds（溯源不悬空）
        await attachTaskToNote(note.id, t.id)
      })
      setBody('')
      setTags('')
      localStorage.removeItem(DRAFT_KEY)
      close()
    } catch (e) {
      // 同上：失败不清输入，错误入库并弹条
      recordError({ where: '速记转待办', kind: 'app', message: e instanceof Error ? e.message : String(e) })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="overlay qn-overlay" onClick={(e) => e.target === e.currentTarget && (saveDraft(), close())}>
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
            // Ctrl/Cmd + Enter：存了继续（连记场景每条省一次唤起）；Esc 任何时候收工
            if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
              e.preventDefault()
              void save(true)
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
          {savedCount > 0 && (
            <span className="qn-saved tnum" data-testid="qn-saved" role="status">
              已保存 {savedCount} 条
            </span>
          )}
          <span className="hint"><kbd>Ctrl</kbd>+<kbd>↵</kbd> 保存并继续 · <kbd>Esc</kbd> 关闭</span>
          <button type="button" className="btn-ghost" disabled={!body.trim() || saving} onClick={() => void saveAsTask()}>
            转待办
          </button>
          <button type="button" className="btn-primary" onClick={() => void save(false)} disabled={!body.trim()}>
            保存
          </button>
        </div>
      </div>
    </div>
  )
}
