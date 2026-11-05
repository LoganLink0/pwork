import { useNavigate } from 'react-router-dom'
import { useCornerNotify, type CornerEntry } from '../../engine/cornerNotify'

/** 右下角完成通知（挂在 App 壳，与右上角 Toaster 对角）：点击整卡跳回来源页 */
function CornerCard({ entry }: { entry: CornerEntry }) {
  const navigate = useNavigate()
  const dismiss = useCornerNotify((s) => s.dismiss)
  return (
    <button
      type="button"
      className="corner-card"
      role="status"
      onClick={() => {
        dismiss(entry.id)
        navigate(entry.to)
      }}
    >
      <span className="corner-title">
        <span aria-hidden>✓</span> {entry.title}
      </span>
      {entry.desc && <span className="corner-desc">{entry.desc}</span>}
      <span className="corner-action">{entry.actionLabel} →</span>
    </button>
  )
}

export function CornerToasts() {
  const entries = useCornerNotify((s) => s.entries)
  if (entries.length === 0) return null
  return (
    <div className="corner-toasts" aria-label="任务完成通知">
      {entries.map((e) => (
        <CornerCard key={e.id} entry={e} />
      ))}
    </div>
  )
}
