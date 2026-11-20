import { useEffect, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { readPref, writePref } from '../../engine/prefsFile'

/**
 * 胶囊岛设置卡：桌面常驻小 P 的显示开关与位置重置。
 * 开关写数据目录 prefs.json（pwork-isle-settings，配置文件化 2026-11-16；localStorage
 * 双写为兼容期回落），isle 独立窗经 pwork-prefs-changed 事件实时显隐。
 * 位置=拖拽驻留，重置则清驻留点并吸回顶部居中。
 */

const KEY = 'pwork-isle-settings'
const POS_KEY = 'pwork-isle-pos'

/** localStorage 兼容期回落（读取失败返回 null） */
function readLocal(key: string): unknown {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

export function IsleSettingsCard({ active }: { active: boolean }) {
  const [enabled, setEnabled] = useState(true)

  useEffect(() => {
    if (!active) return
    try {
      const raw = readPref<unknown>(KEY, undefined) ?? readLocal(KEY)
      if (raw != null) {
        const p = (typeof raw === 'string' ? JSON.parse(raw) : raw) as { enabled?: boolean }
        setEnabled(p.enabled !== false)
      }
    } catch {
      // 坏值走默认
    }
  }, [active])

  const toggle = (on: boolean) => {
    setEnabled(on)
    localStorage.setItem(KEY, JSON.stringify({ enabled: on }))
    writePref(KEY, { enabled: on })
    if (on) {
      // 打开=本体在锚点站位展开并保持（锚点旁出现完整横条）
      void invoke('isle_show_expanded').catch(() => {})
      return
    }
    invoke('isle_hide_all').catch(() => {})
  }

  const resetPos = () => {
    localStorage.removeItem(POS_KEY)
    writePref(POS_KEY, null) // null=重置语义（readPos 判 null 回落顶部居中）
    // 禁用态重置只写偏好不复活窗体；启用时锚点回顶缘下方居中
    if (enabled) void invoke('isle_anchor_snap_top').catch(() => {})
  }

  return (
    <div className="set-card" data-tab="isle" style={{ display: active ? undefined : 'none' }}>
      <h2>胶囊岛</h2>
      <div className="desc">桌面上的常驻小 P：迷你胶囊常驻可见，按住拖到哪驻留到哪（任意位置）；靠近胶囊展开状态条，进行中的抓取、导出与 AI 问答都在这里可见，鼠标离开自动收回；开关关闭后屏上完全隐藏</div>
      <div className="set-body">
        <div className="set-row">
          <label>显示</label>
          <div className="radio">
            <button type="button" className={enabled ? 'on' : ''} onClick={() => toggle(true)}>
              开
            </button>
            <button type="button" className={!enabled ? 'on' : ''} onClick={() => toggle(false)}>
              关
            </button>
          </div>
          <span className="val">关闭后桌面不显示，随时回这里重新打开</span>
        </div>
        <div className="set-row">
          <label>位置</label>
          <button type="button" className="btn-ghost" onClick={resetPos}>
            重置到屏幕顶部居中
          </button>
          <span className="val">平时按住 logo 拖动即可，找不到时用这里一键复位</span>
        </div>
      </div>
    </div>
  )
}
