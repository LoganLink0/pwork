import { useEffect, useRef, useState, type ReactNode } from 'react'

/**
 * 圆圈问号说明符（R 批用户拍板的说明承载形式）：卡片标题或字段标签右侧的
 * 圆圈「?」按钮，点击展开说明气泡，点外部/再点关闭。替代页面流中的大段 notice。
 * 深浅主题自适应；气泡宽 340px，出界自动右对齐。
 */
export function InfoTip({ text, label }: { text: ReactNode; label?: string }) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLSpanElement | null>(null)

  useEffect(() => {
    if (!open) return
    const onDocClick = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDocClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <span className="info-tip" ref={wrapRef}>
      <button
        type="button"
        className="info-tip-btn"
        aria-label={label ?? '说明'}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        ?
      </button>
      {open && (
        <span className="info-tip-pop" role="note">
          {text}
        </span>
      )}
    </span>
  )
}
