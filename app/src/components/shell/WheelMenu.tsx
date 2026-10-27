import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { listen } from '@tauri-apps/api/event'
import { useUi } from '../../store/ui'
import { useCollect } from '../../store/collect'
import { isDesktopApp } from '../../engine/platform'
import { loadWheelSlots, type WheelSlot } from '../../content/wheel'
import { Icon } from './icons'

/**
 * 工具轮盘（桌面版专属）：Rust 侧 Ctrl+Alt+Q 全局快捷键 → wheel-toggle 事件 → 本组件开关。
 * 环形格位，方向键/鼠标选择，Enter/点击执行，Esc 关闭；格位在 设置 → 工具轮盘 编辑。
 * 网页版不挂载（Ctrl+K 命令面板承担同等入口）。
 */
export function WheelMenu() {
  const navigate = useNavigate()
  const open = useUi((s) => s.wheelOpen)
  const openWheel = useUi((s) => s.openWheel)
  const closeWheel = useUi((s) => s.closeWheel)
  const openQuick = useUi((s) => s.openQuick)
  // 每次呼出都重读格位配置（2026-10-28 修复：此前挂载时读一次，设置里保存后呼出仍是旧格）
  const [slots, setSlots] = useState(loadWheelSlots)
  useEffect(() => {
    if (open) setSlots(loadWheelSlots())
  }, [open])

  // 桌面版：全局快捷键事件驱动开关（jsdom/浏览器不挂，测试用 store 直驱）
  useEffect(() => {
    if (!isDesktopApp()) return
    const un = listen('wheel-toggle', () => {
      if (useUi.getState().wheelOpen) closeWheel()
      else openWheel()
    })
    return () => {
      void un.then((f) => f())
    }
  }, [openWheel, closeWheel])

  const run = (slot: WheelSlot) => {
    closeWheel()
    if (slot.kind === 'quick') openQuick()
    else if (slot.kind === 'fetch') {
      void useCollect.getState().runFetchAll()
      navigate('/input/digest')
    } else if (slot.kind === 'route' && slot.target) navigate(slot.target)
    else if (slot.kind === 'url' && slot.target) window.open(slot.target, '_blank', 'noreferrer noopener')
  }

  if (!open) return null
  return <WheelDial slots={slots} onRun={run} onClose={closeWheel} />
}

/** 轮盘本体：仅在打开时挂载（选中态天然从第 1 格开始），挂载后聚焦接管键盘 */
function WheelDial({ slots, onRun, onClose }: { slots: WheelSlot[]; onRun: (s: WheelSlot) => void; onClose: () => void }) {
  const [active, setActive] = useState(0)
  const wrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    wrapRef.current?.focus()
  }, [])

  const n = slots.length
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      onClose()
    } else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((i) => (i + 1) % n)
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((i) => (i - 1 + n) % n)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      onRun(slots[active]!)
    }
  }

  return (
    <div className="wheel-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div
        className="wheel-wrap"
        ref={wrapRef}
        tabIndex={-1}
        role="dialog"
        aria-label="工具轮盘"
        onKeyDown={onKey}
      >
        <div className="wheel-ring" style={{ '--n': n } as React.CSSProperties}>
          {slots.map((s, i) => (
            <button
              key={s.id}
              type="button"
              className={`wheel-slot${i === active ? ' on' : ''}`}
              style={{ '--i': i } as React.CSSProperties}
              onMouseEnter={() => setActive(i)}
              onClick={() => onRun(s)}
              aria-label={s.label}
            >
              <Icon name={s.icon} size={22} />
              <span>{s.label}</span>
            </button>
          ))}
          <div className="wheel-center">
            <span className="t">工具轮盘</span>
            <span className="k"><kbd>←→</kbd> 选 · <kbd>↵</kbd> 执行 · <kbd>Esc</kbd> 关</span>
          </div>
        </div>
      </div>
    </div>
  )
}
