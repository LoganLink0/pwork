import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react'
import { listen } from '@tauri-apps/api/event'
import { invoke } from '@tauri-apps/api/core'

/**
 * 胶囊岛窗（/isle 分流渲染）——自由拖拽 + 上缘吸附（用户拍板·可视即可得）：
 * 固定 520×140 画布。收起态=logo 本体（64px 品牌胶囊）居中画布；
 * 展开态=毛玻璃横条（logo 滑至条内左侧 + 状态单行 + 问小 P / 打开 PWORK）。
 * 按住 logo 原生拖拽（start_dragging 阻塞至松手），松手驻留并持久化位置；
 * 拖近屏幕上缘自动吸附为顶部居中（灵动岛站位）。
 * 位置/形态持久化在本窗 localStorage（pwork-isle-pos）；启用开关在主窗设置页
 * （经 pwork-isle-settings 的 storage 事件实时响应显示/隐藏）。
 */

interface ActivityItem {
  id: string
  label: string
}

const POS_KEY = 'pwork-isle-pos'
/** 上缘吸附判定：拖拽驻留点进入屏顶此物理距离内即吸附居中 */
const SNAP_TOP_PX = 120

interface SavedPos {
  mode: 'top' | 'free'
  x?: number
  y?: number
}

function readPos(): SavedPos {
  try {
    const raw = localStorage.getItem(POS_KEY)
    if (!raw) return { mode: 'top' }
    const p = JSON.parse(raw) as SavedPos
    if (p.mode === 'free' && typeof p.x === 'number' && typeof p.y === 'number') return { mode: 'free', x: p.x, y: p.y }
    return { mode: 'top' }
  } catch {
    return { mode: 'top' }
  }
}

function savePos(pos: SavedPos) {
  localStorage.setItem(POS_KEY, JSON.stringify(pos))
}

export function IsleWindow() {
  const [activities, setActivities] = useState<ActivityItem[]>([])
  const [open, setOpen] = useState(false)
  const [dragging, setDragging] = useState(false)
  const openTimer = useRef<number | null>(null)
  const closeTimer = useRef<number | null>(null)

  const clearTimers = () => {
    if (openTimer.current) { clearTimeout(openTimer.current); openTimer.current = null }
    if (closeTimer.current) { clearTimeout(closeTimer.current); closeTimer.current = null }
  }

  // 首帧：恢复持久化位置（top 吸附 / free 驻留点）→ 显示
  useEffect(() => {
    const pos = readPos()
    if (pos.mode === 'free' && pos.x !== undefined && pos.y !== undefined) {
      void invoke('isle_place', { x: pos.x, y: pos.y }).catch(() => {})
    } else {
      void invoke('isle_snap_top').catch(() => {})
    }
    void invoke('isle_show').catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 挂载一次
  }, [])

  // 原生拖拽结束（start_dragging 阻塞至松手）→ 读落点：近上缘吸附居中，否则驻留并持久化
  const persistAfterDrag = async () => {
    const pos = await invoke<{ x: number; y: number }>('isle_get_pos').catch(() => null)
    if (!pos) return
    if (pos.y <= SNAP_TOP_PX) {
      await invoke('isle_snap_top').catch(() => {})
      savePos({ mode: 'top' })
    } else {
      savePos({ mode: 'free', x: pos.x, y: pos.y })
    }
  }

  // 按住 logo 原生拖拽：start_dragging 阻塞至松手（Windows 进模态移动循环），期间悬停抑制
  const startDrag = (e: ReactMouseEvent) => {
    e.stopPropagation()
    setDragging(true)
    setOpen(false)
    clearTimers()
    void invoke('isle_start_drag')
      .then(() => persistAfterDrag())
      .finally(() => setDragging(false))
  }

  // 主窗推送活动列表
  useEffect(() => {
    let un: (() => void) | undefined
    void listen<ActivityItem[]>('isle-activities', (e) => {
      setActivities(e.payload)
    }).then((unlisten) => {
      un = unlisten
    })
    return () => un?.()
  }, [])

  // 悬停画布 0.6 秒展开；移开 1 秒收回（拖拽中不触发）
  const onEnter = () => {
    if (dragging) return
    clearTimers()
    openTimer.current = window.setTimeout(() => setOpen(true), 600)
  }
  const onLeave = () => {
    if (dragging) return
    clearTimers()
    closeTimer.current = window.setTimeout(() => setOpen(false), 1000)
  }
  useEffect(() => () => clearTimers(), [])

  const count = activities.length
  const firstLabel = activities[0]?.label ?? ''

  return (
    <div
      id="isle-dock"
      className={open ? 'open' : ''}
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
    >
      <div className="isle-bar">
        <div className="isle-bar-content">
          <span className="isle-divider" aria-hidden />
          <span className={`isle-dot${count > 0 ? ' live' : ''}`} aria-hidden />
          <span className="isle-title">{count > 0 ? `小 P · 进行中（${count}）` : '小 P 在'}</span>
          <span className="isle-note">{count > 0 ? firstLabel : '一切就绪'}</span>
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
      {/* logo 是收起态唯一可见物，必须是 #isle-dock 的直接子元素——
          放进 .isle-bar 内会被收起态的 opacity:0 连带压成全透明（opacity 压平后代） */}
      <img
        src="favicon.svg"
        alt="小 P"
        className="isle-logo"
        title="按住拖动 · 点击展开/收回"
        onMouseDown={startDrag}
        onClick={() => { if (!dragging) setOpen((v) => !v) }}
      />
    </div>
  )
}
