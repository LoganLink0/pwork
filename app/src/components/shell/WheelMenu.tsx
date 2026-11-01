import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { listen } from '@tauri-apps/api/event'
import { invoke } from '@tauri-apps/api/core'
import { useUi } from '../../store/ui'
import { useCollect } from '../../store/collect'
import { isDesktopApp } from '../../engine/platform'
import { recordError } from '../../engine/errorLog'
import { toast } from '../../engine/toast'
import { loadKeybinds, displayCombo } from '../../engine/keybinds'
import { loadWheelSlots, type WheelSlot } from '../../content/wheel'
import { Icon } from './icons'

/**
 * 工具轮盘（桌面版专属）：Rust 侧 Ctrl+Alt+Q 全局快捷键 → wheel-toggle 事件 → 本组件开关。
 * 环形格位，方向键/鼠标选择，Enter/点击执行，数字键 1-8 直达，Esc 关闭；格位在 设置 → 工具轮盘 编辑。
 * 网页版不挂载（Ctrl+K 命令面板承担同等入口）。
 */
export function WheelMenu() {
  const navigate = useNavigate()
  const open = useUi((s) => s.wheelOpen)
  const openWheel = useUi((s) => s.openWheel)
  const closeWheel = useUi((s) => s.closeWheel)
  const openQuick = useUi((s) => s.openQuick)
  // 每次呼出都重读格位配置（2026-10-28 修复：此前挂载时读一次，设置里保存后呼出仍是旧格）。
  // 放进微任务：open 变化引发的读取不参与首帧渲染（渲染期不写状态）
  const [slots, setSlots] = useState(loadWheelSlots)
  useEffect(() => {
    if (!open) return
    const t = window.setTimeout(() => setSlots(loadWheelSlots()), 0)
    return () => window.clearTimeout(t)
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
    else if (slot.kind === 'url' && slot.target) {
      // 统一走系统浏览器命令：编程式 window.open 不经 click 委托，ExternalLinks 接管不到，
      // WebView 里新窗口请求会被静默丢弃（与其他外链同一通道的收口）
      invoke('open_external_url', { url: slot.target }).catch((err: unknown) => {
        void recordError({ where: '工具轮盘.url格位', kind: 'app', message: `打开 ${slot.target} 失败：${err instanceof Error ? err.message : String(err)}` })
        toast('error', '网址打开失败——已记录，可复制地址到浏览器手动打开')
      })
    }
  }

  if (!open) return null
  return <WheelDial slots={slots} onRun={run} onClose={closeWheel} />
}

/** 轮盘本体：仅在打开时挂载（选中态天然从第 1 格开始），挂载后聚焦接管键盘 */
function WheelDial({ slots, onRun, onClose }: { slots: WheelSlot[]; onRun: (s: WheelSlot) => void; onClose: () => void }) {
  const [active, setActive] = useState(0)
  const wrapRef = useRef<HTMLDivElement>(null)
  // 速记浮层的应用内键（格位角标：轮盘顺带当快捷键学习卡）
  const quickKey = displayCombo(loadKeybinds().quickNote)

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
    } else if (/^[1-9]$/.test(e.key)) {
      // 数字键直达：格位序号从 1 起，越界忽略
      const idx = Number(e.key) - 1
      if (idx < n) {
        e.preventDefault()
        onRun(slots[idx]!)
      }
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
              aria-label={`${s.label}${s.kind === 'quick' ? `（快捷键 ${quickKey}）` : `（数字键 ${i + 1}）`}`}
            >
              <Icon name={s.icon} size={22} />
              <span>{s.label}</span>
              {s.kind === 'quick' && <i className="wheel-slot-key">{quickKey}</i>}
              {s.kind !== 'quick' && <i className="wheel-slot-key">{i + 1}</i>}
            </button>
          ))}
          <div className="wheel-center">
            <span className="t">工具轮盘</span>
            <span className="k"><kbd>1-9</kbd> 直达 · <kbd>←→</kbd> 选 · <kbd>↵</kbd> 执行 · <kbd>Esc</kbd> 关</span>
          </div>
        </div>
      </div>
    </div>
  )
}
