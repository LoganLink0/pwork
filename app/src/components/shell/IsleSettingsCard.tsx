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
      // 打开=直接展开完整横条（2026-11-18 用户反馈：只 show 会停在 logo 小窗并被 1 秒
      // 自动收回计时器收走——「闪现一下就消失」根因）；mode/y 从共享 localStorage 读
      try {
        const pos = JSON.parse(localStorage.getItem('pwork-isle-pos') || '{}') as { mode?: string; y?: number }
        void invoke('isle_expand', { mode: pos.mode ?? 'top', y: pos.y ?? 0 }).catch(() => invoke('isle_show').catch(() => {}))
        return
      } catch {
        void invoke('isle_show').catch(() => {})
        return
      }
    }
    invoke('isle_hide').catch(() => {})
  }

  const resetPos = () => {
    localStorage.removeItem(POS_KEY)
    writePref(POS_KEY, null) // null=重置语义（readPos 判 null 回落顶部居中）
    void invoke('isle_snap_top').catch(() => {})
  }

  return (
    <div className="set-card" data-tab="isle" style={{ display: active ? undefined : 'none' }}>
      <h2>胶囊岛</h2>
      <div className="desc">桌面上的常驻小 P：按住 logo 拖到哪驻留到哪，拖近屏幕上缘自动吸附居中；靠近展开状态条，进行中的抓取、导出与 AI 问答都在这里可见</div>
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
