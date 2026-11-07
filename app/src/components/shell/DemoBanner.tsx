import { useEffect, useState } from 'react'

/** 在线演示版横幅（仅 demo 构建渲染）：写清演示版定位，引导桌面版拿完整功能。
 *  手机 PWA（添加到主屏后的独立窗口模式）不渲染——手机没有桌面版可下，
 *  横幅对装到主屏的用户只剩占地方（2026-11-07 用户反馈）。
 *  「添加到主屏」按钮捕获浏览器安装事件（beforeinstallprompt）：支持时一键弹
 *  原生安装框，不依赖浏览器菜单（夸克等部分壳浏览器菜单里没有该入口）；
 *  不支持时显示指引文字，建议换手机自带浏览器打开 */
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
}

export function DemoBanner() {
  const [standalone, setStandalone] = useState(false)
  const [installEvt, setInstallEvt] = useState<BeforeInstallPromptEvent | null>(null)

  useEffect(() => {
    setStandalone(window.matchMedia('(display-mode: standalone)').matches)
    const onPrompt = (e: Event) => {
      e.preventDefault()
      setInstallEvt(e as BeforeInstallPromptEvent)
    }
    window.addEventListener('beforeinstallprompt', onPrompt)
    return () => window.removeEventListener('beforeinstallprompt', onPrompt)
  }, [])

  if (standalone) return null
  return (
    <div className="demo-banner" role="note">
      <span>
        <b>演示版</b>——数据只保存在当前浏览器；完整功能（AI、云端同步、工具轮盘）请用电脑上的桌面版。
      </span>
      {installEvt ? (
        <button
          type="button"
          className="demo-install-btn"
          onClick={() => {
            installEvt.prompt()
            setInstallEvt(null)
          }}
        >
          ⬇ 添加到主屏
        </button>
      ) : (
        <span className="demo-install-tip">手机安装：建议用 Chrome 或手机自带浏览器打开本页，菜单里「添加到主屏幕」（夸克等部分浏览器不支持）</span>
      )}
    </div>
  )
}
