import { useEffect, useRef, useState } from 'react'
import { listen } from '@tauri-apps/api/event'
import { invoke } from '@tauri-apps/api/core'

/**
 * 胶囊岛窗（/isle 分流渲染）——抽屉模型（岛仔验证）：
 * 固定 360×160 画布贴右缘（整面=悬停热区），抽屉（.isle-drawer）收起时滑出画布外
 * 只露 16px 把手帽，悬停 0.6 秒滑入展开，移开 1 秒滑出收回。
 * 垂直位置由设置（localStorage）经 Rust 锚定；storage 事件实时响应。
 */

interface ActivityItem {
  id: string
  label: string
}

export interface IsleSettings {
  enabled: boolean
  yPercent: number
}

const SETTINGS_KEY = 'pwork-isle-settings'
const DEFAULT_SETTINGS: IsleSettings = { enabled: true, yPercent: 50 }
const HOVER_OPEN_MS = 600
const LEAVE_CLOSE_MS = 1000

function readSettings(): IsleSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY)
    if (!raw) return DEFAULT_SETTINGS
    const p = JSON.parse(raw) as Partial<IsleSettings>
    return {
      enabled: p.enabled !== false,
      yPercent: typeof p.yPercent === 'number' ? Math.min(100, Math.max(0, p.yPercent)) : 50,
    }
  } catch {
    return DEFAULT_SETTINGS
  }
}

export function IsleWindow() {
  const [activities, setActivities] = useState<ActivityItem[]>([])
  const [settings, setSettings] = useState<IsleSettings>(readSettings())
  const [open, setOpen] = useState(false)
  const enterTimer = useRef<number | null>(null)
  const leaveTimer = useRef<number | null>(null)

  const clearTimers = () => {
    if (enterTimer.current) { clearTimeout(enterTimer.current); enterTimer.current = null }
    if (leaveTimer.current) { clearTimeout(leaveTimer.current); leaveTimer.current = null }
  }

  // 首帧：按设置显示并锚定
  useEffect(() => {
    if (settings.enabled) {
      void invoke('isle_show', { yPercent: settings.yPercent }).catch(() => {})
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 挂载一次
  }, [])

  // 设置变化（storage 事件跨窗同步）
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === SETTINGS_KEY) {
        const next = readSettings()
        setSettings(next)
        if (next.enabled) {
          setOpen(false)
          void invoke('isle_show', { yPercent: next.yPercent }).catch(() => {})
        } else {
          setOpen(false)
          void invoke('isle_hide').catch(() => {})
        }
      }
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
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

  // 悬停 0.6 秒展开；移开 1 秒收回（挂在画布根：靠近右缘即呼出，无需精确瞄准）
  const onEnter = () => {
    clearTimers()
    enterTimer.current = window.setTimeout(() => setOpen(true), HOVER_OPEN_MS)
  }
  const onLeave = () => {
    clearTimers()
    leaveTimer.current = window.setTimeout(() => setOpen(false), LEAVE_CLOSE_MS)
  }
  useEffect(() => () => clearTimers(), [])

  const count = activities.length

  return (
    <div
      id="isle-dock"
      className={open ? 'open' : ''}
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
      onClick={() => {
        clearTimers()
        setOpen((v) => !v)
      }}
    >
      <div className="isle-drawer" role="dialog" aria-label="小 P：伙伴入口与进行中活动">
        <div className="isle-body">
          <div className="isle-row">
            <span className={`isle-dot${count > 0 ? ' live' : ''}`} aria-hidden />
            <span className="isle-title">{count > 0 ? '小 P · 进行中' : '小 P 在'}</span>
            <span className="isle-note">{count > 0 ? `${count} 项进行中` : '一切就绪'}</span>
          </div>
          {activities.slice(0, 2).map((a) => (
            <div className="isle-row isle-act" key={a.id}>
              <span className="isle-act-label">{a.label}</span>
            </div>
          ))}
          <div className="isle-acts">
            <button type="button" className="isle-pbtn" onClick={(e) => { e.stopPropagation(); void invoke('isle_open_palette').catch(() => {}) }}>
              问小 P
            </button>
            <button type="button" className="isle-pbtn" onClick={(e) => { e.stopPropagation(); void invoke('isle_open_main').catch(() => {}) }}>
              打开 PWORK
            </button>
          </div>
        </div>
        <span aria-hidden />
      </div>
    </div>
  )
}
