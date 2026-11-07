import { useEffect, useState } from 'react'

/** 在线演示版横幅（仅 demo 构建渲染）：写清演示版定位与手机安装路径。
 *  手机 PWA（添加到主屏后的独立窗口模式）不渲染——横幅对装到主屏的用户只剩占地方。
 *  不做自定义安装按钮：beforeinstallprompt.prompt() 调起时浏览器要重新验证 manifest
 *  与 start_url（GitHub Pages 国内慢通道），原生框会推迟十几秒——浏览器菜单的原生
 *  「添加到主屏幕」判定在页面加载时已完成，点击立即弹框，走菜单路径（2026-11-07 用户实测反馈） */
export function DemoBanner() {
  const [standalone, setStandalone] = useState(false)
  useEffect(() => {
    setStandalone(window.matchMedia('(display-mode: standalone)').matches)
  }, [])
  if (standalone) return null
  return (
    <div className="demo-banner" role="note">
      <span>
        <b>演示版</b>——数据只保存在当前浏览器；完整功能（AI、云端同步、工具轮盘）请用电脑上的桌面版。手机安装：浏览器右上角菜单 →「添加到主屏幕」，当应用使用（夸克等部分浏览器无此入口，建议 Chrome 或手机自带浏览器）。
      </span>
    </div>
  )
}
