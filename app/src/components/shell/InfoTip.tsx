import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'

/**
 * 圆圈问号说明符（R 批用户拍板的说明承载形式）：卡片标题或字段标签右侧的
 * 圆圈「?」按钮，说明气泡贴按钮右侧展开，右缘出界自动翻到按钮左侧，任意容器
 * 裁剪都不影响（fixed 脱离文档裁剪上下文）。深浅主题自适应；气泡宽 340px。
 * 2026-11-12 用户拍板改版：鼠标悬浮即展示（不再要求手动点击）——桌面 hover、
 * 键盘 focus、触屏点击三种触发并存；移开/失焦即收起，内容自然换行。
 */
const POP_WIDTH = 340

export function InfoTip({ text, label }: { text: ReactNode; label?: string }) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null)
  const wrapRef = useRef<HTMLSpanElement | null>(null)
  const btnRef = useRef<HTMLButtonElement | null>(null)
  const popRef = useRef<HTMLSpanElement | null>(null)

  useLayoutEffect(() => {
    if (!open || !btnRef.current) return
    const r = btnRef.current.getBoundingClientRect()
    const popH = popRef.current?.getBoundingClientRect().height ?? 120
    let left = r.right + 8
    let top = r.top - 4
    // 右缘放不下：翻到按钮左侧
    if (left + POP_WIDTH > window.innerWidth - 8) left = r.left - POP_WIDTH - 8
    if (left < 8) left = 8
    // 底缘放不下：向上移
    if (top + popH > window.innerHeight - 8) top = Math.max(8, window.innerHeight - popH - 8)
    setPos({ left, top })
  }, [open])

  useEffect(() => {
    if (!open) return
    // 触屏没有 hover：点击按钮外部时收起；Escape 随时收起
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
        ref={btnRef}
        className="info-tip-btn"
        aria-label={label ?? '说明'}
        aria-expanded={open}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onClick={() => setOpen((v) => !v)}
      >
        ?
      </button>
      {open && (
        <span
          className="info-tip-pop"
          role="note"
          ref={popRef}
          style={pos ? { position: 'fixed', left: pos.left, top: pos.top, width: POP_WIDTH } : { visibility: 'hidden', position: 'fixed' }}
        >
          {text}
        </span>
      )}
    </span>
  )
}
