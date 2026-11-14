import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react'
import { listen } from '@tauri-apps/api/event'
import { invoke } from '@tauri-apps/api/core'

/**
 * 胶囊岛窗（/isle 分流渲染）——三种驻留模式 + 停靠自动半隐藏：
 * 固定 520×140 透明画布。收起态=logo 本体（64px 品牌胶囊）；展开态=毛玻璃横条
 * （logo 滑至条内左侧 + 状态单行 + 问小 P / 打开 PWORK）。
 * 模式（拖拽落点由 Rust 判定并落位，前端持久化）：
 *   top  灵动岛：横条零间距贴屏幕上缘居中；鼠标离开后 logo 上滑半探入边缘，靠近滑出；
 *   right 右缘停靠：画布右缘贴屏幕右缘，logo 停画布右侧；同样半隐藏贴边；
 *   free 自由驻留：拖到哪驻留到哪（全向钳回屏内），不做半隐藏。
 * 单击=展开/收回；按住=原生拖拽。位置/模式持久化在本窗 localStorage（pwork-isle-pos）；
 * 启用开关在主窗设置页（经 pwork-isle-settings 的 storage 事件实时响应显隐）。
 */

interface ActivityItem {
  id: string
  label: string
}

const POS_KEY = 'pwork-isle-pos'
const SETTINGS_KEY = 'pwork-isle-settings'

interface SavedPos {
  mode: 'top' | 'right' | 'free'
  x?: number
  y?: number
}

function readPos(): SavedPos {
  try {
    const raw = localStorage.getItem(POS_KEY)
    if (!raw) return { mode: 'top' }
    const p = JSON.parse(raw) as SavedPos
    if (p.mode === 'right' && typeof p.y === 'number') return { mode: 'right', y: p.y }
    if (p.mode === 'free' && typeof p.x === 'number' && typeof p.y === 'number') return { mode: 'free', x: p.x, y: p.y }
    return { mode: 'top' }
  } catch {
    return { mode: 'top' }
  }
}

function savePos(pos: SavedPos) {
  localStorage.setItem(POS_KEY, JSON.stringify(pos))
}

function readEnabled(): boolean {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY)
    if (!raw) return true
    const p = JSON.parse(raw) as { enabled?: boolean }
    return p.enabled !== false
  } catch {
    return true
  }
}

/** 停靠模式下的容器类名（free 为空）；peek=半隐藏探边态（展开态永不叠加） */
function dockClass(mode: SavedPos['mode'], peek: boolean, open: boolean): string {
  const base = mode === 'top' ? 'dock-top' : mode === 'right' ? 'dock-right' : ''
  return [base, peek && base && !open ? 'peek' : ''].filter(Boolean).join(' ')
}

export function IsleWindow() {
  const [activities, setActivities] = useState<ActivityItem[]>([])
  const [open, setOpen] = useState(false)
  const [dragging, setDragging] = useState(false)
  /** 驻留模式：Rust 拖拽判定/挂载恢复共同维护 */
  const [mode, setMode] = useState<SavedPos['mode']>('top')
  /** 停靠模式下的半隐藏态（logo 探入屏幕边缘，靠近滑出） */
  const [peek, setPeek] = useState(true)
  /** 按下时的展开态占位（保留给拖拽结束后的状态复位用） */
  const openTimer = useRef<number | null>(null)
  const closeTimer = useRef<number | null>(null)

  const clearTimers = () => {
    if (openTimer.current) { clearTimeout(openTimer.current); openTimer.current = null }
    if (closeTimer.current) { clearTimeout(closeTimer.current); closeTimer.current = null }
  }

  // 首帧：按持久化模式恢复窗位（越界由 Rust 钳回屏内）→ 按启用开关决定显示。
  // 停靠模式以半隐藏态出场（靠近即滑出）。
  useEffect(() => {
    const pos = readPos()
    setMode(pos.mode)
    if (pos.mode === 'free' && pos.x !== undefined && pos.y !== undefined) {
      void invoke('isle_place', { x: pos.x, y: pos.y }).catch(() => {})
    } else if (pos.mode === 'right') {
      void invoke('isle_dock_right', { y: pos.y ?? 0 }).catch(() => {})
    } else {
      void invoke('isle_snap_top').catch(() => {})
    }
    if (readEnabled()) {
      void invoke('isle_show').catch(() => {})
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 挂载一次
  }, [])

  // 设置页启用开关实时生效（storage 事件在另一窗口触发；两窗同源共享 localStorage）
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== SETTINGS_KEY) return
      if (readEnabled()) {
        void invoke('isle_show').catch(() => {})
      } else {
        clearTimers()
        setOpen(false)
        void invoke('isle_hide').catch(() => {})
      }
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 挂载一次
  }, [])

  // 按下=启动原生拖拽（Rust 立即返回，拖拽结束经 isle-drag-end 事件异步通知）。
  // 抓着什么拖什么：按下不收起，横条保持展开跟随拖动，松手后才按模式收起/探边。
  // 按钮豁免（点击语义优先于拖拽）。
  const startDrag = (e: ReactMouseEvent) => {
    if (e.button !== 0) return
    if ((e.target as HTMLElement).closest('button')) return
    e.stopPropagation()
    setDragging(true)
    clearTimers()
    void invoke('isle_start_drag').catch(() => setDragging(false))
  }

  // 拖拽真正结束（Rust 轮询到左键松开+位置稳定）：Rust 已按判定模式落位，
  // 前端持久化模式；横条此时才收起，停靠模式回到半隐藏探边态
  useEffect(() => {
    let un: (() => void) | undefined
    void listen<{ mode: SavedPos['mode']; x: number; y: number; moved: boolean }>('isle-drag-end', (e) => {
      const { mode: m, x, y, moved } = e.payload
      setOpen(false)
      if (moved) {
        setMode(m)
        setPeek(m !== 'free')
        if (m === 'top') savePos({ mode: 'top' })
        else if (m === 'right') savePos({ mode: 'right', y })
        else savePos({ mode: 'free', x, y })
      }
      setDragging(false)
    }).then((fn) => {
      un = fn
    })
    return () => un?.()
  }, [])

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

  // 靠近 0.6 秒直接展开（半隐藏态不解锁——先滑回再展开会让 logo 从静止的光标
  // 底下移走，立刻触发 mouseleave 收回，形成"碰了没反应"的振荡）；移开 1 秒收回，
  // 收回后停靠模式重新进入半隐藏（拖拽中不触发）
  const onEnter = () => {
    if (dragging) return
    clearTimers()
    openTimer.current = window.setTimeout(() => {
      setOpen(true)
      setPeek(false)
    }, 600)
  }
  const onLeave = () => {
    if (dragging) return
    clearTimers()
    closeTimer.current = window.setTimeout(() => {
      setOpen(false)
      if (mode !== 'free') setPeek(true)
    }, 1000)
  }
  useEffect(() => () => clearTimers(), [])

  const count = activities.length
  const firstLabel = activities[0]?.label ?? ''
  const dockCls = dockClass(mode, peek, open)

  return (
    <div
      id="isle-dock"
      className={[open ? 'open' : '', dockCls].filter(Boolean).join(' ')}
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
      onMouseDown={startDrag}
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
          放进 .isle-bar 内会被收起态的 opacity:0 连带压成全透明（opacity 压平后代）。
          拖拽在画布层统一处理（整条可拖），logo 无独立监听、无 title（悬停驱动的
          UI 里原生提示框是噪音，出现在横条正下方被误认为渲染缺陷） */}
      <img
        src="favicon.svg"
        alt="小 P"
        className="isle-logo"
        draggable={false}
      />
    </div>
  )
}
