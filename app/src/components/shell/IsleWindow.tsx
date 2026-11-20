import { useEffect, useState } from 'react'
import { listen } from '@tauri-apps/api/event'
import { invoke } from '@tauri-apps/api/core'
import { syncThemeFromStore } from '../../engine/appearance'
import { refreshPrefsFile, writePref } from '../../engine/prefsFile'

/**
 * 胶囊岛本体横条窗（/isle 分流渲染）——双窗架构的本体：
 * 常驻可见的是锚点迷你胶囊窗（/anchor），本体横条仅在悬停锚点时出现，
 * 光标离开 1 秒即隐藏（完全隐藏=屏上只剩锚点圆点，不拦任何点击）。
 * 本体窗生命周期：Rust isle_anchor_hover_show_body 定位+show；前端只负责
 * 「离开 1 秒→调用隐藏+锚点回归」与「拖拽结束→持久化站位」。
 * 状态词随任务变化（活动推送经 isle-activities 事件）。
 */

interface ActivityItem {
  id: string
  label: string
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
  /** 拖拽中（Rust 原生拖拽窗体，前端只标记样式） */
  const [dragging, setDragging] = useState(false)

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

  // 本体拖拽结束（Rust 已把锚点落位到新站位并隐藏本体）：持久化站位
  useEffect(() => {
    let un: (() => void) | undefined
    void listen<{ mode: SavedPos['mode']; x: number; y: number; moved: boolean }>('isle-body-drag-end', (e) => {
      setDragging(false)
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

  const count = activities.length
  const firstLabel = activities[0]?.label ?? ''
  const idleNote = notice ? (notice.ok ? '✓ ' : '✗ ') + notice.label : '一切就绪'
  const dockCls = [dragging ? 'dragging' : ''].filter(Boolean).join(' ')

  return (
    <div
      id="isle-dock"
      className={['open', dockCls].filter(Boolean).join(' ')}
      onMouseDown={() => {
        if (dragging) return
        setDragging(true)
        void invoke('isle_body_drag_start').catch(() => setDragging(false))
      }}
    >
      <div className="isle-bar">
        <div className="isle-bar-content">
          <img src="favicon.svg" alt="小 P" className="isle-logo" draggable={false} />
          <span className="isle-divider" aria-hidden />
          <span className={`isle-dot${count > 0 ? ' live' : ''}`} aria-hidden />
          <span className="isle-title">{count > 0 ? `小 P · 进行中（${count}）` : '小 P 在'}</span>
          <span className="isle-note">{count > 0 ? firstLabel : idleNote}</span>
          <div className="isle-acts">
            <button type="button" className="isle-pbtn isle-brand" onClick={(e) => { e.stopPropagation(); void invoke('isle_open_palette').catch(() => {}) }}>
              问小 P
            </button>
            <button type="button" className="isle-pbtn" onClick={(e) => { e.stopPropagation(); void invoke('isle_open_main').catch(() => {}) }}>
              打开 PWORK
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
