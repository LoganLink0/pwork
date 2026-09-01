import { useState } from 'react'
import { getCoach, type CoachContext } from '../../engine/coach'

interface CoachAskButtonProps {
  ctx: CoachContext
  /** 点选某个追问后的去处：把问题追加到深挖链 */
  onPick: (question: string) => void
}

/**
 * AI 深挖追问按钮（仅当用户配置了 LLM 教练时渲染）。
 * 点击 → 拉取最多 3 个追问 → 以胶囊列出；点选某个问题追加进原因卡的深挖链。
 * 规则引擎模式下不渲染（离线引导已内建于表单文案）。
 */
export function CoachAskButton({ ctx, onPick }: CoachAskButtonProps) {
  const coach = getCoach()
  const [state, setState] = useState<'idle' | 'loading' | 'done' | 'error'>('idle')
  const [questions, setQuestions] = useState<string[]>([])

  if (coach.id !== 'llm') return null

  async function ask() {
    setState('loading')
    try {
      const qs = await coach.askDeepQuestions(ctx)
      if (qs.length === 0) {
        setState('error')
        return
      }
      setQuestions(qs)
      setState('done')
    } catch {
      setState('error')
    }
  }

  return (
    <div className="coach-ask">
      {state === 'idle' && (
        <button className="btn-small coach-ask-btn" onClick={ask}>
          🤖 AI 追问
        </button>
      )}
      {state === 'loading' && <span className="coach-say">AI 正在组织问题……</span>}
      {state === 'error' && (
        <span className="coach-say">AI 暂时没连上——先用规则提示继续，稍后再试。</span>
      )}
      {state === 'done' && (
        <div className="coach-ask-list">
          {questions.map((q) => (
            <button key={q} type="button" className="seg-item" onClick={() => onPick(q)}>
              {q}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
