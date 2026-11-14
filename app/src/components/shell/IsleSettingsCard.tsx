import { useEffect, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'

/**
 * 胶囊岛设置卡：桌面常驻小 P 的显示开关与位置重置。
 * 开关写 localStorage（pwork-isle-settings），isle 独立窗经 storage 事件实时显隐——
 * 两窗同源共享 localStorage，无需跨窗事件桥。位置=拖拽驻留，重置则清驻留点并吸回顶部居中。
 */

const KEY = 'pwork-isle-settings'
const POS_KEY = 'pwork-isle-pos'

export function IsleSettingsCard({ active }: { active: boolean }) {
  const [enabled, setEnabled] = useState(true)

  useEffect(() => {
    if (!active) return
    try {
      const raw = localStorage.getItem(KEY)
      if (raw) {
        const p = JSON.parse(raw) as { enabled?: boolean }
        setEnabled(p.enabled !== false)
      }
    } catch {
      // 坏值走默认
    }
  }, [active])

  const toggle = (on: boolean) => {
    setEnabled(on)
    localStorage.setItem(KEY, JSON.stringify({ enabled: on }))
    // isle 窗经 storage 事件实时响应；这里同步 invoke 兜底（事件丢失时也能立即显隐）
    void invoke(on ? 'isle_show' : 'isle_hide').catch(() => {})
  }

  const resetPos = () => {
    localStorage.removeItem(POS_KEY)
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
