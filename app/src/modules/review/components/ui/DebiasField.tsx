import { useMemo, useState } from 'react'
import { scanDebias } from '../../engine/debias'
import { getCoach } from '../../engine/coach'
import { REFRAME } from '../../content/copy'
import { KnowledgeCapsule } from './KnowledgeCapsule'
import './ui.css'

interface DebiasFieldProps {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  label?: string
  /** 字段旁的知识胶囊 id */
  capsuleId?: string
  multiline?: boolean
  rows?: number
  disabled?: boolean
  ariaLabel?: string
}

/**
 * 带防偏差扫描的输入框（PRD 6.3 原则 3）。
 * 实时扫描 → 命中即在输入框下方展示引导师改写建议；只提示、不阻断。
 */
export function DebiasField({
  value,
  onChange,
  placeholder,
  label,
  capsuleId,
  multiline,
  rows = 3,
  disabled,
  ariaLabel,
}: DebiasFieldProps) {
  const hit = useMemo(() => scanDebias(value)[0] ?? null, [value])
  const coach = getCoach()
  const aiEnabled = coach.id === 'llm'
  const [aiText, setAiText] = useState('')
  const [aiLoading, setAiLoading] = useState(false)

  async function aiReframe() {
    if (!hit) return
    setAiLoading(true)
    try {
      const out = await coach.reframe(value, hit.kind)
      setAiText(out)
    } catch {
      setAiText('')
    } finally {
      setAiLoading(false)
    }
  }

  return (
    <div className="debias-field">
      {(label || capsuleId) && (
        <div className="field-label">
          {label && <span>{label}</span>}
          {capsuleId && <KnowledgeCapsule id={capsuleId} />}
        </div>
      )}
      {multiline ? (
        <textarea
          className="input"
          rows={rows}
          value={value}
          placeholder={placeholder}
          disabled={disabled}
          aria-label={ariaLabel ?? label ?? placeholder}
          onChange={(e) => onChange(e.target.value)}
        />
      ) : (
        <input
          className="input"
          type="text"
          value={value}
          placeholder={placeholder}
          disabled={disabled}
          aria-label={ariaLabel ?? label ?? placeholder}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
      {hit && (
        <div className="hint-warn" role="status" aria-live="polite">
          <span className="hint-warn-badge">引导师</span>
          {aiText || REFRAME[hit.kind]}
          {aiEnabled && !aiLoading && (
            <button className="btn-small" onClick={aiReframe} title="让 AI 换一种问法">
              AI 改写
            </button>
          )}
          {aiLoading && <span className="coach-say">AI 想法中…</span>}
        </div>
      )}
    </div>
  )
}

