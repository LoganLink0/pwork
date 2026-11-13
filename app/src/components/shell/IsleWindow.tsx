import { useEffect, useRef, useState } from 'react'
import { listen } from '@tauri-apps/api/event'
import { invoke } from '@tauri-apps/api/core'

/**
 * 胶囊岛窗（/isle 分流渲染）：桌面右下角常驻伙伴形态——
 * 收缩态呼吸点 / 活动态胶囊（带队列计数）/ 展开面板（活动清单+入口）。
 * 交互（2026-11-14 用户拍板动态岛式）：悬浮 1 秒自动展开面板，移开 1.5 秒自动收回，
 * 点击立即开合——不需要点击小圆点也不需要找关闭按钮。
 * 窗体尺寸随内容自适应（ResizeObserver 上报 isle_resize，Rust 侧右下锚定）。
 * 本窗 focus:false 不夺焦点；点击「打开 PWORK」聚焦主窗。
 */

interface ActivityItem {
  id: string
  label: string
}

type IsleMode = 'idle' | 'live' | 'open'

const HOVER_EXPAND_MS = 1000
const HOVER_COLLAPSE_MS = 1500

export function IsleWindow() {
  const [activities, setActivities] = useState<ActivityItem[]>([])
  const [mode, setMode] = useState<IsleMode>('idle')
  const [ready, setReady] = useState(false)
  const contentRef = useRef<HTMLDivElement | null>(null)
  const hoverTimer = useRef<number | null>(null)
  const closeTimer = useRef<number | null>(null)
  const modeRef = useRef<IsleMode>('idle')
  const activitiesRef = useRef<ActivityItem[]>([])
  modeRef.current = mode
  activitiesRef.current = activities

  const clearTimers = () => {
    if (hoverTimer.current) { clearTimeout(hoverTimer.current); hoverTimer.current = null }
    if (closeTimer.current) { clearTimeout(closeTimer.current); closeTimer.current = null }
  }

  const setModeSafe = (m: IsleMode) => {
    clearTimers()
    setMode(m)
  }

  // 首帧：上报显示（Rust 右下锚定后 show）
  useEffect(() => {
    void invoke('isle_show').catch(() => {})
    setReady(true)
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

  // 主窗「打开 PWORK」后收回面板
  useEffect(() => {
    let un: (() => void) | undefined
    void listen('isle-close', () => {
      clearTimers()
      setMode('idle')
    }).then((unlisten) => {
      un = unlisten
    })
    return () => un?.()
  }, [])

  // 活动列表变化：idle 且有活动 → 自动亮起活动胶囊；展开态不动
  useEffect(() => {
    if (modeRef.current === 'open') return
    setMode(activities.length > 0 ? 'live' : 'idle')
  }, [activities])

  // 窗体尺寸随内容自适应（展开面板高度随活动数变化）
  useEffect(() => {
    if (!ready || !contentRef.current) return
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const r = entry.contentRect
        void invoke('isle_resize', { width: Math.ceil(r.width), height: Math.ceil(r.height) }).catch(() => {})
      }
    })
    ro.observe(contentRef.current)
    return () => ro.disconnect()
  }, [ready, mode])

  // 悬浮 1 秒自动展开；移开 1.5 秒自动收回（动态岛式）
  const onEnter = () => {
    clearTimers()
    if (modeRef.current !== 'open') {
      hoverTimer.current = window.setTimeout(() => setMode('open'), HOVER_EXPAND_MS)
    }
  }
  const onLeave = () => {
    clearTimers()
    if (modeRef.current === 'open') {
      closeTimer.current = window.setTimeout(
        () => setMode(activitiesRef.current.length > 0 ? 'live' : 'idle'),
        HOVER_COLLAPSE_MS,
      )
    }
  }

  const open = mode === 'open'
  const live = mode === 'live'
  const count = activities.length

  return (
    <div
      className={`isle isle-${mode}`}
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
      onClick={() => setModeSafe(open ? (activities.length > 0 ? 'live' : 'idle') : 'open')}
      role={open ? 'dialog' : 'button'}
      aria-label={open ? '小 P 面板' : '问小 P：AI 全库问答与进行中活动'}
    >
      <div ref={contentRef} className="isle-content">
        {open ? (
          <>
            <div className="isle-head">
              <span className="isle-dot isle-dot-live" />
              小 P · 进行中
            </div>
            {activities.map((a) => (
              <div className="isle-item" key={a.id}>
                {a.label}
              </div>
            ))}
            {activities.length === 0 && <div className="isle-item">当前没有进行中的活动</div>}
            <div className="isle-acts">
              <button
                type="button"
                className="isle-pbtn"
                onClick={(e) => {
                  e.stopPropagation()
                  void invoke('isle_open_main').catch(() => {})
                }}
              >
                打开 PWORK
              </button>
              <button
                type="button"
                className="isle-pbtn"
                onClick={(e) => {
                  e.stopPropagation()
                  setModeSafe('idle')
                }}
              >
                收起
              </button>
            </div>
          </>
        ) : live ? (
          <>
            <span className="isle-dot isle-dot-live" />
            <span className="isle-txt">{activities[0]?.label ?? '小 P 思考中'}</span>
            {count > 1 && <span className="isle-count">{count}</span>}
          </>
        ) : (
          <>
            <span className="tip">小 P 在 · 悬浮查看</span>
            <span className="isle-dot" />
          </>
        )}
      </div>
    </div>
  )
}
