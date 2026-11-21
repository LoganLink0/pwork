import { useEffect, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { readPref, writePref } from '../../engine/prefsFile'

/**
 * 胶囊岛设置卡：桌面常驻小 P 的显示开关与位置重置。
 * 开关写数据目录 prefs.json（pwork-isle-settings，配置文件化 2026-11-16；localStorage
 * 双写为兼容期回落）。开关「开」=isle_restore 恢复持久化状态（贴边收纳锚点 /
 * 自由驻留横条）；「关」=屏上完全隐藏。位置=拖拽驻留（贴边带内收成锚点、屏幕
 * 中间驻留横条），重置则清驻留点并收回顶部居中收纳。
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

/** 持久化站位（与锚点窗/本体窗同一结构；无值=顶部收纳默认） */
function readPos(): { mode: string; x?: number; y?: number } {
  try {
    const raw = readPref<unknown>(POS_KEY, undefined) ?? readLocal(POS_KEY)
    if (raw == null) return { mode: 'top' }
    const p = (typeof raw === 'string' ? JSON.parse(raw) : raw) as { mode?: string; x?: number; y?: number }
    if (p.mode && (p.mode === 'free' || p.mode === 'left' || p.mode === 'right' || p.mode === 'top')) return p as { mode: string; x?: number; y?: number }
    return { mode: 'top' }
  } catch {
    return { mode: 'top' }
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
      // 打开=恢复持久化状态（贴边收纳锚点 / 自由驻留横条；从未驻留过=顶部收纳）。
      // 位置由伴生窗在拖拽落位时写入：主窗缓存可能陈旧（跨窗写只广播事件、不刷新
      // 本进程缓存），恢复前必须失效重拉再读——否则关→开会跳回启动时的旧位置。
      void import('../../engine/prefsFile').then((m) => m.refreshPrefsFile()).then(() => {
        const p = readPos()
        void invoke('isle_restore', { mode: p.mode, x: p.x ?? null, y: p.y ?? null }).catch(() => {})
      })
      return
    }
    invoke('isle_hide_all').catch(() => {})
  }

  const resetPos = () => {
    localStorage.removeItem(POS_KEY)
    writePref(POS_KEY, null) // null=重置语义（readPos 判 null 回落顶部收纳）
    // 禁用态重置只写偏好不复活窗体；启用时收回顶部居中收纳（锚点横排贴顶）
    if (enabled) void invoke('isle_anchor_snap_top').catch(() => {})
  }

  return (
    <div className="set-card" data-tab="isle" style={{ display: active ? undefined : 'none' }}>
      <h2>胶囊岛</h2>
      <div className="desc">桌面上的常驻小 P：拖到屏幕边缘（上缘或左右侧）时收成迷你锚点、本体完全隐藏，悬停锚点即可展开；拖到屏幕中间则以完整横条驻留；点击横条上的 LOGO 问小 P，点击横条其他部位打开 PWORK；开关关闭后屏上完全隐藏</div>
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
          <span className="val">平时按住拖动即可换位置，找不到时用这里一键收回顶部收纳</span>
        </div>
      </div>
    </div>
  )
}
