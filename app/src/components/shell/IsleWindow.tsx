import { useEffect, useState } from 'react'
import { listen } from '@tauri-apps/api/event'
import { invoke } from '@tauri-apps/api/core'
import { syncThemeFromStore } from '../../engine/appearance'
import { refreshPrefsFile, writePref } from '../../engine/prefsFile'

/**
 * 胶囊岛本体横条窗（/isle 分流渲染）——双窗架构的本体：
 * 稳定驻留两种——自由驻留（拖到非贴边区松手，屏上只有胶囊岛本体，光标离开不收回）
 * 与临时展开（悬停/单击收纳锚点呼出，光标离开 1 秒收回）。窗体显隐由 Rust 状态机
 * 驱动（isle_restore / expand_body_at / 拖拽落点判定），前端只负责「拖拽结束→持久化
 * 站位」。条上无按钮（用户拍板）：原地点击 LOGO 区=问小 P、其余部位=打开 PWORK、
 * 按住拖动=换位置——分派在 Rust isle_body_drag_start（按下位置+位移判定）。
 * 状态词随任务变化（活动推送经 isle-activities 事件）。
 */

interface ActivityItem {
  id: string
  label: string
  route?: string
}

/** 活动结束瞬态（完成 ✓ / 失败 ✗）：展示数秒自动消失 */
interface ActivityNotice {
  ok: boolean
  label: string
}

const POS_KEY = 'pwork-isle-pos'

interface SavedPos {
  mode: 'top' | 'left' | 'right' | 'free'
  x?: number
  y?: number
}

function savePos(pos: SavedPos) {
  localStorage.setItem(POS_KEY, JSON.stringify(pos))
  writePref(POS_KEY, pos)
}

export function IsleWindow() {
  const [activities, setActivities] = useState<ActivityItem[]>([])
  const [notice, setNotice] = useState<ActivityNotice | null>(null)
  /** 悬停操作提示（用户增补 2026-11-22）：LOGO 区=点我问一问，其余=打开PWORK。
   *  提示在状态词位置原地切换——画布不增高（多余窗体矩形会拦截下层点击） */
  const [hoverHint, setHoverHint] = useState<'ask' | 'open' | null>(null)
  /** 呼出/收回动效（0.1.25）：Rust 状态机 show/hide 前广播，页面播滑入/滑出 */
  const [anim, setAnim] = useState<'in' | 'out' | null>(null)
  const [animKey, setAnimKey] = useState(0)

  // 主题跟随主窗；偏好变化实时跟随（伴生窗独立进程视图，Tauri 事件是唯一跨窗通道）
  useEffect(() => {
    syncThemeFromStore()
    void import('../../engine/prefsFile').then((m) => m.readPrefsFile())
    let unlisten: (() => void) | undefined
    let disposed = false
    void listen<{ keys?: string[] }>('pwork-prefs-changed', (e) => {
      const keys = e.payload?.keys
      if (!keys || keys.includes('pwork-theme')) {
        void refreshPrefsFile().then(() => syncThemeFromStore())
      }
    }).then((fn) => {
      if (disposed) fn()
      else unlisten = fn
    })
    return () => {
      disposed = true
      unlisten?.()
    }
  }, [])

  // 活动列表 + 结果瞬态（完成 ✓ / 失败 ✗，数秒自动消失）
  useEffect(() => {
    let un: (() => void) | undefined
    void listen<{ activities: ActivityItem[]; notice: ActivityNotice | null }>('isle-activities', (e) => {
      setActivities(e.payload.activities)
      setNotice(e.payload.notice)
    }).then((fn) => {
      un = fn
    })
    return () => {
      un?.()
    }
  }, [])

  // 呼出/收回动效（0.1.25）：Rust show/hide 前广播——in 期间重挂横条重播滑入，
  // out 播滑出（Rust 已延迟 160ms 后才真隐藏）
  useEffect(() => {
    let un: (() => void) | undefined
    void listen<{ phase: 'in' | 'out' }>('isle-anim', (e) => {
      setAnim(e.payload.phase)
      if (e.payload.phase === 'in') setAnimKey((k) => k + 1)
    }).then((fn) => {
      un = fn
    })
    return () => un?.()
  }, [])

  // 本体拖拽结束（落点定形态：贴边带→收纳态本体已隐藏；非贴边→自由驻留本体保持显示）
  useEffect(() => {
    let un: (() => void) | undefined
    void listen<{ mode: SavedPos['mode']; x: number; y: number; moved: boolean }>('isle-body-drag-end', (e) => {
      const { mode: m, x, y } = e.payload
      if (m === 'right') savePos({ mode: 'right', y })
      else if (m === 'left') savePos({ mode: 'left', y })
      else if (m === 'top') savePos({ mode: 'top' })
      else savePos({ mode: 'free', x, y })
    }).then((fn) => {
      un = fn
    })
    return () => un?.()
  }, [])

  // 锚点拖拽落位的兜底持久化（锚点窗隐藏时它的事件不可靠，本体窗显示中必达）：
  // free=本体自由驻留位；贴边位同样双写（幂等，与锚点页互备）
  useEffect(() => {
    let un: (() => void) | undefined
    void listen<{ mode?: SavedPos['mode']; x?: number; y?: number; moved: boolean }>('isle-anchor-drag-end', (e) => {
      if (!e.payload.moved) return
      const { mode: m, x, y } = e.payload
      if (m === 'free' && typeof x === 'number' && typeof y === 'number') savePos({ mode: 'free', x, y })
      else if (m === 'top') savePos({ mode: 'top' })
      else if (m === 'right' && typeof y === 'number') savePos({ mode: 'right', y })
      else if (m === 'left' && typeof y === 'number') savePos({ mode: 'left', y })
    }).then((fn) => {
      un = fn
    })
    return () => un?.()
  }, [])

  const count = activities.length
  const firstLabel = activities[0]?.label ?? ''
  // 条上无按钮（用户拍板）：文字区按状态切换——空闲=「小 P 在」；忙碌=任务名；
  // 瞬态（完成 ✓ / 失败 ✗）短提示覆盖显示；悬停时切换为操作提示（点击分派语义一致）
  const hintText = hoverHint === 'ask' ? '点我问一问' : hoverHint === 'open' ? '打开PWORK' : null
  const statusText = hintText
    ?? (notice
      ? (notice.ok ? '✓ ' : '✗ ') + notice.label
      : count > 0
        ? `进行中（${count}）${firstLabel}`
        : '小 P 在')

  return (
    <div
      id="isle-dock"
      className="open"
      onMouseDown={() => {
        void invoke('isle_body_drag_start').catch(() => {})
      }}
      onMouseEnter={() => setHoverHint('open')}
      onMouseLeave={() => setHoverHint(null)}
    >
      <div
        key={anim === 'in' ? animKey : 'bar'}
        className={['isle-bar', anim === 'in' ? 'isle-anim-in' : anim === 'out' ? 'isle-anim-out' : '']
          .filter(Boolean)
          .join(' ')}
      >
        <div className="isle-bar-content">
          <img
            src="favicon.svg"
            alt="小 P"
            className="isle-logo"
            draggable={false}
            onMouseEnter={() => setHoverHint('ask')}
            onMouseLeave={() => setHoverHint('open')}
          />
          <span className="isle-divider" aria-hidden />
          <span className={`isle-dot${count > 0 ? ' live' : ''}`} aria-hidden />
          <span
            className="isle-note"
            style={count > 0 && activities[0]?.route ? { cursor: 'pointer' } : undefined}
            onMouseDown={(e) => {
              // 任务名可点击（0.1.25）：有活动且带路由时点击跳对应页面——
              // stopPropagation 阻断横条的拖拽/分派 mousedown，路由独占本次点击
              if (count > 0 && activities[0]?.route) {
                e.stopPropagation()
                void invoke('isle_note_goto', { path: activities[0].route }).catch(() => {})
              }
            }}
          >
            {statusText}
          </span>
        </div>
      </div>
    </div>
  )
}
