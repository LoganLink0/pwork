import { useEffect, useState } from 'react'
import { listen } from '@tauri-apps/api/event'
import { invoke } from '@tauri-apps/api/core'
import { syncThemeFromStore } from '../../engine/appearance'
import { readPref, writePref } from '../../engine/prefsFile'

/**
 * 胶囊岛锚点窗（/anchor 分流渲染）——收纳态专属形态（纯渲染视图）：
 * 锚点只存在于贴边带（近顶≤120px / 近左右缘≤80px），顶=横排胶囊(100×32)贴顶居中，
 * 左右缘=竖排(44×100)贴缘（贴缘侧直角）。非贴边区没有锚点（屏上只有本体横条）。
 * 交互全部由 Rust 锚点交互线程驱动（悬停 280ms 呼出/按住拖动/落点定形态）——
 * WebView2 对经历隐藏循环的窗不再派发 mousedown（实测），页面侧交互不可靠，
 * 本页只负责渲染与持久化落位事件。窗的可见性由 Rust show/hide 直接控制
 * （SetWindowRgn 已废弃：会让透明窗渲染退化）。
 */

const POS_KEY = 'pwork-isle-pos'

/** 持久化站位：top=无坐标；left/right=y=锚点 tl 物理 px；free=x,y=本体 tl（自由驻留） */
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
  const raw = readPref<unknown>(POS_KEY, undefined)
  if (raw == null) return { mode: 'top' }
  const p = (typeof raw === 'string' ? JSON.parse(raw) : raw) as SavedPos
  if (p.mode === 'right' && typeof p.y === 'number') return { mode: 'right', y: p.y }
  if (p.mode === 'left' && typeof p.y === 'number') return { mode: 'left', y: p.y }
  if (p.mode === 'free' && typeof p.x === 'number' && typeof p.y === 'number') return { mode: 'free', x: p.x, y: p.y }
  return { mode: 'top' }
}

export function IsleAnchorWindow() {
  /** 收纳站位形态（顶=横排；左右缘=竖排；free 时锚点隐藏，形态值不渲染） */
  const [mode, setMode] = useState<'top' | 'left' | 'right'>('top')
  /** 有任务进行时亮橙色活动点 */
  const [count, setCount] = useState(0)

  // 挂载：恢复持久化状态（Rust isle_restore 统一摆两窗：收纳态显示锚点 /
  // 自由驻留显示本体并隐藏本窗）+ 主题跟随
  useEffect(() => {
    syncThemeFromStore()
    void import('../../engine/prefsFile').then((m) => m.readPrefsFile()).then(() => {
      const p = readPos()
      if (p.mode !== 'free') setMode(p.mode)
      void invoke('isle_restore', { mode: p.mode, x: p.x ?? null, y: p.y ?? null }).catch(() => {})
    })
  }, [])

  // 形态自检兜底：窗体尺寸是 Rust set_size 落位的直接事实。isle-anchor-form 事件
  // 对隐藏窗派发不可靠，曾致窗已竖排而内容仍横排（被裁剪出「半截胶囊+大片底色」
  // 的错乱形态）。事件（主路）+ 250ms 轮询比对窗宽与渲染形态，不一致即切换；
  // 站位形态取本地持久化（同源 localStorage 即时）。
  useEffect(() => {
    const syncForm = () => {
      const vert = window.innerWidth <= 60
      setMode((cur) => {
        if (!vert) return cur === 'top' ? cur : 'top'
        const raw = localStorage.getItem(POS_KEY)
        let want: 'left' | 'right' = 'left'
        try {
          const p = raw ? (JSON.parse(raw) as SavedPos) : null
          if (p?.mode === 'right') want = 'right'
        } catch {
          // 坏值走默认左缘
        }
        return want === cur ? cur : want
      })
    }
    const timer = window.setInterval(syncForm, 250)
    return () => window.clearInterval(timer)
  }, [])

  // Rust 落位广播：切渲染形态（顶横排 / 缘竖排）
  useEffect(() => {
    let un: (() => void) | undefined
    void listen<{ mode: 'top' | 'left' | 'right' }>('isle-anchor-form', (e) => {
      setMode(e.payload.mode)
    }).then((fn) => {
      un = fn
    })
    return () => un?.()
  }, [])

  // 锚点拖拽结束：贴边位持久化（top/left/right）；free 的持久化由本体页兜底
  // （两页互备双写，savePos 幂等）；moved=false 的呼出由 Rust 直接完成
  useEffect(() => {
    let un: (() => void) | undefined
    void listen<{ mode?: 'top' | 'left' | 'right' | 'free'; x?: number; y?: number; moved: boolean }>('isle-anchor-drag-end', (e) => {
      const { mode: m, x, y } = e.payload
      if (m === 'free' && typeof x === 'number' && typeof y === 'number') savePos({ mode: 'free', x, y })
      else if (m === 'right' && typeof y === 'number') savePos({ mode: 'right', y })
      else if (m === 'left' && typeof y === 'number') savePos({ mode: 'left', y })
      else if (m === 'top') savePos({ mode: 'top' })
    }).then((fn) => {
      un = fn
    })
    return () => un?.()
  }, [])

  // 本体拖拽落位的兜底持久化（本体窗隐藏时它的事件不可靠，锚点窗可见必达）
  useEffect(() => {
    let un: (() => void) | undefined
    void listen<{ mode: 'top' | 'left' | 'right' | 'free'; x: number; y: number; moved: boolean }>('isle-body-drag-end', (e) => {
      const { mode: m, x, y } = e.payload
      if (m === 'top') savePos({ mode: 'top' })
      else if (m === 'right') savePos({ mode: 'right', y })
      else if (m === 'left') savePos({ mode: 'left', y })
      else if (m === 'free') savePos({ mode: 'free', x, y })
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

  const vert = mode !== 'top'
  return (
    <div id="isle-anchor" className={vert ? `vert anchor-${mode}` : undefined}>
      <div className="anchor-capsule">
        <img src="anchor-p-white.png" alt="小 P" className="anchor-p" draggable={false} />
        <span className="anchor-word">小 P 在</span>
        {count > 0 && <span className="anchor-dot" aria-hidden />}
      </div>
    </div>
  )
}
