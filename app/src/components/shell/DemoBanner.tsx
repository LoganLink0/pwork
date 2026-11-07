import { useEffect, useState } from 'react'

/** 在线演示版横幅（仅 demo 构建渲染）：写清演示版定位，引导桌面版拿完整功能。
 *  手机 PWA（添加到主屏后的独立窗口模式）不渲染——手机没有桌面版可下，
 *  横幅对装到主屏的用户只剩占地方（2026-11-07 用户反馈） */
export function DemoBanner() {
  const [standalone, setStandalone] = useState(false)
  useEffect(() => {
    setStandalone(window.matchMedia('(display-mode: standalone)').matches)
  }, [])
  if (standalone) return null
  return (
    <div className="demo-banner" role="note">
      <span>
        <b>演示版</b>——数据只保存在当前浏览器；完整功能（AI、云端同步、工具轮盘）请用电脑上的桌面版。手机可把本页添加到主屏幕，当应用使用。
      </span>
    </div>
  )
}
