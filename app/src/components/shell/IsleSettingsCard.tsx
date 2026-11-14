import { useEffect, useState } from 'react'

/**
 * 胶囊岛设置卡（46 批）：桌面版右缘常驻伙伴的开关与垂直位置。
 * 设置写 localStorage（pwork-isle-settings），isle 独立窗经 storage 事件实时响应——
 * 主窗与 isle 窗同源共享 localStorage，无需跨窗事件桥。
 */

const KEY = 'pwork-isle-settings'

export function IsleSettingsCard({ active }: { active: boolean }) {
  const [enabled, setEnabled] = useState(true)
  const [yPercent, setYPercent] = useState(50)

  useEffect(() => {
    if (!active) return
    try {
      const raw = localStorage.getItem(KEY)
      if (raw) {
        const p = JSON.parse(raw) as { enabled?: boolean; yPercent?: number }
        setEnabled(p.enabled !== false)
        setYPercent(typeof p.yPercent === 'number' ? p.yPercent : 50)
      }
    } catch {
      // 坏值走默认
    }
  }, [active])

  const save = (next: { enabled: boolean; yPercent: number }) => {
    localStorage.setItem(KEY, JSON.stringify(next))
  }

  const toggle = (on: boolean) => {
    setEnabled(on)
    save({ enabled: on, yPercent })
  }
  const setY = (y: number) => {
    setYPercent(y)
    save({ enabled, yPercent: y })
  }

  return (
    <div className="set-card" data-tab="isle" style={{ display: active ? undefined : 'none' }}>
      <h2>胶囊岛</h2>
      <div className="desc">桌面右缘常驻的小 P 入口：靠近滑出面板，进行中的抓取、导出与 AI 问答都在这里可见</div>
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
          <span className="val">关闭后桌面右缘不显示，随时回这里重新打开</span>
        </div>
        <div className="set-row">
          <label>垂直位置</label>
          <div className="seg">
            <button type="button" className={yPercent === 20 ? 'on' : ''} onClick={() => setY(20)}>
              偏上
            </button>
            <button type="button" className={yPercent === 50 ? 'on' : ''} onClick={() => setY(50)}>
              居中
            </button>
            <button type="button" className={yPercent === 80 ? 'on' : ''} onClick={() => setY(80)}>
              偏下
            </button>
          </div>
          <span className="val">细条贴在屏幕右缘的垂直位置</span>
        </div>
      </div>
    </div>
  )
}
