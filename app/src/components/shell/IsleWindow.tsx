import { useEffect, useState } from 'react'
import { listen } from '@tauri-apps/api/event'
import { invoke } from '@tauri-apps/api/core'

/**
 * 胶囊岛窗（/isle 分流渲染）：桌面右下角常驻伙伴形态——
 * 收缩态呼吸点 / 活动态胶囊（带队列计数）/ 点击展开面板（活动清单+入口）。
 * 活动列表由主窗经 isle-activities 事件推送；窗体尺寸随状态经 isle_resize 上报 Rust 调整。
 * 本窗 focus:false 不夺焦点；点击「打开 PWORK」聚焦主窗。
 */

interface ActivityItem {
  id: string
  label: string
}

type IsleMode = 'idle' | 'live' | 'open'

/** 各状态对应的窗体逻辑尺寸（Rust set_size + 右下锚定） */
const SIZE_BY_MODE: Record<IsleMode, { width: number; height: number }> = {
  idle: { width: 44, height: 44 },
  live: { width: 300, height: 44 },
  open: { width: 360, height: 240 },
}

export function IsleWindow() {
  const [activities, setActivities] = useState<ActivityItem[]>([])
  const [mode, setMode] = useState<IsleMode>('idle')
  const [ready, setReady] = useState(false)

  // 首帧挂载：上报初始尺寸并请求显示（Rust 侧右下锚定后 show）
  useEffect(() => {
    void invoke('isle_show').catch(() => {})
    void invoke('isle_resize', SIZE_BY_MODE.idle).catch(() => {})
    setReady(true)
  }, [])

  // 状态变化 → 上报窗体尺寸（idle/live/open 各不同）
  useEffect(() => {
    if (!ready) return
    void invoke('isle_resize', SIZE_BY_MODE[mode]).catch(() => {})
  }, [mode, ready])

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

  // 派生：有活动 → live 胶囊；无活动 → 收缩态（展开面板态优先）
  useEffect(() => {
    if (mode === 'open') return
    setMode(activities.length > 0 ? 'live' : 'idle')
  }, [activities])

  const open = mode === 'open'
  const live = mode === 'live'
  const count = activities.length

  const clickIsland = () => {
    setMode(mode === 'open' ? (activities.length > 0 ? 'live' : 'idle') : 'open')
  }

  return (
    <div
      className={`isle isle-${mode}`}
      onClick={clickIsland}
      role={open ? 'dialog' : 'button'}
      aria-label={open ? '小 P 面板' : '问小 P：AI 全库问答与进行中活动'}
    >
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
                void invoke('toggle_wheel_window').catch(() => {})
              }}
            >
              轮盘 Ctrl+Alt+Q
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
          <span className="tip">小 P 在 · 悬浮查看 / 点击打开</span>
          <span className="isle-dot" />
        </>
      )}
    </div>
  )
}
