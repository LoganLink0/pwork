import { useEffect } from 'react'
import { useConfirmStore } from '../../engine/confirm'

/**
 * 应用内确认弹层宿主（2026-11-08 走查第三批）：挂 App 壳（与 Toaster 同层），
 * 调用入口是 engine/confirm.ts 的 confirmDialog()——Promise 返回是否确认。
 * 键盘：Esc 与遮罩点击 = 取消；Enter = 确认（焦点在确认键上）。
 */
export function ConfirmDialog() {
  const spec = useConfirmStore((s) => s.spec)
  const settle = useConfirmStore((s) => s.settle)

  useEffect(() => {
    if (!spec) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') settle(false)
      if (e.key === 'Enter') settle(true)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [spec, settle])

  if (!spec) return null
  return (
    <div className="confirm-mask" role="presentation" onClick={() => settle(false)}>
      <div className="confirm-card" role="alertdialog" aria-modal="true" aria-label={spec.title} onClick={(e) => e.stopPropagation()}>
        <b className="confirm-title">{spec.title}</b>
        {spec.body && <p className="confirm-body">{spec.body}</p>}
        <div className="confirm-actions">
          <button type="button" className="btn-ghost" data-testid="confirm-cancel" onClick={() => settle(false)}>{spec.cancelLabel ?? '取消'}</button>
          <button
            type="button"
            className="btn-primary"
            style={spec.danger ? { background: '#a03131' } : undefined}
            autoFocus
            data-testid="confirm-confirm"
            onClick={() => settle(true)}
          >
            {spec.confirmLabel ?? '确认'}
          </button>
        </div>
      </div>
    </div>
  )
}
