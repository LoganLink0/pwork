import { useEffect, useState } from 'react'
import { listen } from '@tauri-apps/api/event'
import { invoke } from '@tauri-apps/api/core'
import { loadWheelSlots, type WheelSlot } from '../../content/wheel'
import { Icon } from '../shell/icons'

const AUTO_HIDE_MS = 12_000
let hideTimer: number | undefined

/**
 * 轮盘独立窗（系统工具形态，反馈后拍板的重构）：本视图只渲染在 label=wheel 的
 * 透明小窗里（main.tsx 按 hash 分流挂载，不进 App 的路由与壳）。全程无焦点——
 * 纯鼠标操作：点格位执行、点环外空白关闭、热键再按一次关闭、12 秒无操作自动隐藏。
 * 系统动作（置顶/网址）就地执行；应用动作（速记/抓取/页面）经 wheel_dispatch_action
 * 唤醒主窗后发 wheel-action 事件由主窗执行。
 */
export function WheelWindow() {
  const [slots, setSlots] = useState<WheelSlot[]>(() => loadWheelSlots())

  // 每次显示重读格位（与设置页保存即生效同一纪律）+ 重置自动隐藏计时
  useEffect(() => {
    const un = listen('wheel-show', () => {
      setSlots(loadWheelSlots())
      window.clearTimeout(hideTimer)
      hideTimer = window.setTimeout(() => void invoke('wheel_hide').catch(() => {}), AUTO_HIDE_MS)
    })
    return () => {
      void un.then((f) => f())
      window.clearTimeout(hideTimer)
    }
  }, [])

  const close = () => {
    window.clearTimeout(hideTimer)
    void invoke('wheel_hide').catch(() => {})
  }

  const run = (slot: WheelSlot) => {
    close()
    void invoke('wheel_dispatch_action', { kind: slot.kind, target: slot.target ?? '' }).catch(() => {})
  }

  return (
    <div className="wheel-window" onClick={(e) => e.target === e.currentTarget && close()}>
      <div className="wheel-ring wheel-ring-window">
        {slots.map((s, i) => (
          <button key={s.id} type="button" className="wheel-slot" style={{ '--i': i, '--n': slots.length } as React.CSSProperties} onClick={() => run(s)} aria-label={s.label}>
            <Icon name={s.icon} size={22} />
            <span>{s.label}</span>
          </button>
        ))}
        <div className="wheel-center">
          <span className="t">工具轮盘</span>
          <span className="k">点击格位执行 · 点空白处关闭</span>
        </div>
      </div>
    </div>
  )
}
