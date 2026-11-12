import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

/**
 * 圆圈问号说明符（R 批用户拍板的说明承载形式）：卡片标题或字段标签右侧的
 * 圆圈「?」按钮，说明气泡贴按钮右侧展开，右缘出界自动翻到按钮左侧，任意容器
 * 裁剪都不影响。深浅主题自适应；气泡宽 340px，内容自然换行。
 * 2026-11-12 用户拍板：悬浮即展示（桌面 hover / 键盘 focus / 触屏点击三触发并存），
 * 移开即收起（气泡本身可进入——里面有链接，离开按钮后有 120ms 缓冲再收）。
 * 弹层经 portal 挂到 body：任何祖先的 transform（如 h2 .info-tip 的上标位移）
 * 都会把 fixed 的定位基准从视口改成该祖先（坐标二次偏移——2026-11-12 位置漂移
 * 事故的根因），portal 后弹层永远相对视口定位。
 */
const POP_WIDTH = 340
const LEAVE_DELAY = 120

export function InfoTip({ text, label }: { text: ReactNode; label?: string }) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null)
  const wrapRef = useRef<HTMLSpanElement | null>(null)
  const btnRef = useRef<HTMLButtonElement | null>(null)
  const popRef = useRef<HTMLSpanElement | null>(null)
  const closeTimer = useRef<number | null>(null)

  const cancelClose = () => {
    if (closeTimer.current !== null) {
      window.clearTimeout(closeTimer.current)
      closeTimer.current = null
    }
  }
  const scheduleClose = () => {
    cancelClose()
    closeTimer.current = window.setTimeout(() => setOpen(false), LEAVE_DELAY)
  }

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
    // 触屏没有 hover：点击气泡与按钮之外时收起；Escape 随时收起
    const onDocClick = (e: MouseEvent) => {
      const t = e.target as Node
      if (!wrapRef.current?.contains(t) && !popRef.current?.contains(t)) setOpen(false)
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

  useEffect(() => cancelClose, [])

  return (
    <span className="info-tip" ref={wrapRef}>
      <button
        type="button"
        ref={btnRef}
        className="info-tip-btn"
        aria-label={label ?? '说明'}
        aria-expanded={open}
        onMouseEnter={() => { cancelClose(); setOpen(true) }}
        onMouseLeave={scheduleClose}
        onFocus={() => { cancelClose(); setOpen(true) }}
        onBlur={() => setOpen(false)}
        onClick={() => setOpen((v) => !v)}
      >
        ?
      </button>
      {open &&
        createPortal(
          <span
            className="info-tip-pop"
            role="note"
            ref={popRef}
            onMouseEnter={cancelClose}
            onMouseLeave={scheduleClose}
            style={pos ? { position: 'fixed', left: pos.left, top: pos.top, width: POP_WIDTH } : { visibility: 'hidden', position: 'fixed' }}
          >
            {text}
          </span>,
          document.body,
        )}
    </span>
  )
}
