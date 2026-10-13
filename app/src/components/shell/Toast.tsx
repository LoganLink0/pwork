import { useEffect } from 'react'
import { TOAST_TTL, useToast, type ToastEntry } from '../../engine/toast'

/** 右上角通知栈（挂在 App 壳，与 ErrorBar 同层）；store 见 engine/toast.ts */
function ToastCard({ entry }: { entry: ToastEntry }) {
  const dismiss = useToast((s) => s.dismiss)
  // TTL 兜底：kind 时长到点强退（store 的 setTimeout 与组件解耦，双保险防堆积）
  useEffect(() => {
    const t = setTimeout(() => dismiss(entry.id), TOAST_TTL[entry.kind])
    return () => clearTimeout(t)
  }, [entry.id, entry.kind, dismiss])
  return (
    <div className={`toast toast--${entry.kind}`} role={entry.kind === 'error' ? 'alert' : 'status'} data-testid={`toast-${entry.kind}`}>
      <span className="toast-text">{entry.text}</span>
      <button type="button" className="toast-x" aria-label="关闭通知" onClick={() => dismiss(entry.id)}>×</button>
    </div>
  )
}

export function Toaster() {
  const toasts = useToast((s) => s.toasts)
  if (toasts.length === 0) return null
  return (
    <div className="toaster" aria-label="通知">
      {toasts.map((t) => (
        <ToastCard key={t.id} entry={t} />
      ))}
    </div>
  )
}
