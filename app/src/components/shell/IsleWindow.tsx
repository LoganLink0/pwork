import { useEffect, useState } from 'react'
import { listen } from '@tauri-apps/api/event'
import { invoke } from '@tauri-apps/api/core'

/**
 * 胶囊岛窗（/isle 分流渲染）——边缘停靠式（岛仔验证的模型）：
 * 贴屏幕右缘的细条 tab 常驻，鼠标靠近 tab 面板滑出，移开滑回。
 * 窗口是固定 360×140 画布（Rust 锚定右缘），内容 translateX 滑入滑出——
 * 不做逐状态窗体缩放（0.1.22 教训：内容测量与窗体尺寸循环依赖）。
 * 位置（上/中/下）与启用开关来自 localStorage（主窗设置页写，storage 事件实时响应）。
 */

interface ActivityItem {
  id: string
  label: string
}

export interface IsleSettings {
  enabled: boolean
  /** 垂直位置：0=上 50=中 100=下（可用高度内的百分比） */
  yPercent: number
}

const SETTINGS_KEY = 'pwork-isle-settings'
const DEFAULT_SETTINGS: IsleSettings = { enabled: true, yPercent: 50 }

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
  const [ready, setReady] = useState(false)

  // 首帧：按设置显示并锚定
  useEffect(() => {
    if (settings.enabled) {
      void invoke('isle_show', { yPercent: settings.yPercent }).catch(() => {})
    }
    setReady(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 挂载一次
  }, [])

  // 设置变化（storage 事件跨窗同步）：启用/停用与位置实时生效
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === SETTINGS_KEY) {
        const next = readSettings()
        setSettings(next)
        if (next.enabled) {
          void invoke('isle_show', { yPercent: next.yPercent }).catch(() => {})
        } else {
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

  // 鼠标靠近 tab → 滑出面板；移开 → 滑回
  useEffect(() => {
    const dock = document.getElementById('isle-dock')
    if (!dock) return
    const enter = () => setOpen(true)
    const leave = () => setOpen(false)
    dock.addEventListener('mouseenter', enter)
    dock.addEventListener('mouseleave', leave)
    return () => {
      dock.removeEventListener('mouseenter', enter)
      dock.removeEventListener('mouseleave', leave)
    }
  }, [ready])

  const count = activities.length
  const activityLabel = activities[0]?.label ?? ''

  return (
    <div id="isle-dock" className={settings.enabled ? 'isle-dock on' : 'isle-dock'}>
      {/* 滑出层：贴右缘，展开时向左滑出面板 */}
      <div className={`isle-slide${open ? ' out' : ''}`}>
        <div className="isle-panel" role="dialog" aria-label="小 P 面板">
          <div className="isle-panel-row">
            <span className="isle-dot isle-dot-live" aria-hidden />
            <span className="isle-title">{count > 0 ? '小 P · 进行中' : '小 P 在'}</span>
            <span className="isle-panel-note">{count > 0 ? `${count} 项活动` : '一切就绪'}</span>
          </div>
          {activities.slice(0, 2).map((a) => (
            <div className="isle-panel-row isle-act" key={a.id}>
              <span className="isle-act-label">{a.label}</span>
            </div>
          ))}
          <div className="isle-acts">
            <button type="button" className="isle-pbtn" onClick={() => void invoke('isle_open_palette').catch(() => {})}>
              问小 P
            </button>
            <button type="button" className="isle-pbtn" onClick={() => void invoke('isle_open_main').catch(() => {})}>
              打开 PWORK
            </button>
          </div>
        </div>
      </div>
      {/* 收起态细条 tab：常驻右缘 */}
      <div className="isle-tab" aria-label="小 P">
        <span className="isle-dot isle-dot-live" aria-hidden />
        {count > 0 && <span className="isle-badge">{count}</span>}
      </div>
    </div>
  )
}
