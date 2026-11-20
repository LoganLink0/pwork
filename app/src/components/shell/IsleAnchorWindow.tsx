import { useEffect, useState } from 'react'
import { listen } from '@tauri-apps/api/event'
import { invoke } from '@tauri-apps/api/core'
import { syncThemeFromStore } from '../../engine/appearance'
import { readPref, writePref } from '../../engine/prefsFile'

/**
 * 胶囊岛常驻锚点窗（/anchor 分流渲染）——双窗架构的「肉眼可见提示」：
 * 100×32 深色迷你胶囊（白 P + 状态词 + 橙色活动点），永远完全可见，
 * 拖到哪驻留到哪（任意位置，不限预设）。本体横条窗在悬停/单击时于锚点旁展开，
 * 其余时间完全隐藏（屏上只有本胶囊=「本体完全隐藏+常驻提示」双实体结构）。
 * 悬停/单击 → Rust isle_anchor_hover_show_body（本体定位显示+锚点隐藏）；
 * 按住拖动 → Rust isle_anchor_drag_start（原生拖拽+松手落位，位置回传持久化）。
 * 状态词随任务变化（活动推送经 isle-activities 事件）。
 */

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

function readPos(): SavedPos {
  try {
    const raw = readPref<unknown>(POS_KEY, undefined)
    if (raw == null) return { mode: 'top' }
    const p = (typeof raw === 'string' ? JSON.parse(raw) : raw) as SavedPos
    if (p.mode === 'right' && typeof p.y === 'number') return { mode: 'right', y: p.y }
    if (p.mode === 'left' && typeof p.y === 'number') return { mode: 'left', y: p.y }
    if (p.mode === 'free' && typeof p.x === 'number' && typeof p.y === 'number') return { mode: 'free', x: p.x, y: p.y }
    return { mode: 'top' }
  } catch {
    return { mode: 'top' }
  }
}

export function IsleAnchorWindow() {
  const [active, setActive] = useState(false)
  const [dragging, setDragging] = useState(false)
  /** 有任务进行时亮橙色活动点 */
  const [count, setCount] = useState(0)

  // 挂载：恢复持久化驻留位置（越界由 Rust 钳回屏内）+ 主题跟随
  useEffect(() => {
    syncThemeFromStore()
    void import('../../engine/prefsFile').then((m) => m.readPrefsFile()).then(() => {
      const p = readPos()
      void invoke('isle_anchor_place', { x: p.x ?? 0, y: p.y ?? 0 }).catch(() => {})
    })
  }, [])

  // 拖拽结束：moved=true=落位持久化；moved=false（原地松手=单击）=清拖拽态并展开本体
  useEffect(() => {
    let un: (() => void) | undefined
    void listen<{ moved: boolean; x?: number; y?: number }>('isle-anchor-drag-end', (e) => {
      setDragging(false)
      const p = readPos()
      savePos({ ...p, x: e.payload.x, y: e.payload.y })
      if (!e.payload.moved) expandBody()
    }).then((fn) => {
      un = fn
    })
    return () => un?.()
  }, [])

  // 活动推送 → 任务数（橙色活动点随任务亮起）
  useEffect(() => {
    let un: (() => void) | undefined
    void listen<{ activities: unknown[] }>('isle-activities', (e) => {
      setCount((e.payload?.activities ?? []).length)
    }).then((fn) => {
      un = fn
    })
    return () => un?.()
  }, [])

  // 悬停/单击锚点 → 本体在锚点旁展开（本体显示+锚点隐藏，位置由 Rust 锚定）
  const expandBody = () => {
    if (dragging) return
    setActive(true)
    void invoke('isle_anchor_hover_show_body').catch(() => setActive(false))
  }

  return (
    <div id="isle-anchor">
      <div
        className={['anchor-capsule', active ? 'active' : '', dragging ? 'dragging' : ''].filter(Boolean).join(' ')}
        onMouseEnter={expandBody}
        onMouseDown={() => {
          if (dragging) return
          setDragging(true)
          void invoke('isle_anchor_drag_start').catch(() => setDragging(false))
        }}
      >
        <img src="anchor-p-white.png" alt="小 P" className="anchor-p" draggable={false} />
        <span className="anchor-word">小 P 在</span>
        {count > 0 && <span className="anchor-dot" aria-hidden />}
      </div>
    </div>
  )
}
