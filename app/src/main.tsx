import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import './styles/tokens.css'
import './styles/base.css'
import './styles/shell.css'
import './styles/collect.css'
import './modules/review/styles/review.css'
import App from './App.tsx'
import { applyTheme, loadTheme } from './engine/appearance.ts'
import { initStorage, usingMemoryFallback } from './db/schema.ts'
import { useUi } from './store/ui.ts'
import { installErrorCapture, track } from './engine/errorLog.ts'
import { isDesktopApp } from './engine/platform.ts'

// 错误捕获最先安装：之后任何未捕获错误都会记录 + 顶出错误条
installErrorCapture()

// 主题偏好在任何渲染前应用，避免闪屏
applyTheme(loadTheme())

// PWA Service Worker：网页版离线可用、安装到主屏。
// prompt 模式：新版本就绪后顶栏出更新按钮——必须把 registerSW 返回的激活函数传进去，
// 只 location.reload() 不会激活 waiting 状态的 SW，刷新后仍由旧 SW 供页。
// 桌面版不注册并注销历史注册：桌面资源内嵌在应用里，SW 缓存会在升级后拦截请求供出旧界面
// （2026-10-26 实测：1.1.6 升级后用户看到的仍是 1.1.5 的界面，根因即此），桌面完全不需要它
if (isDesktopApp()) {
  if ('serviceWorker' in navigator) {
    void navigator.serviceWorker.getRegistrations().then((rs) => {
      for (const r of rs) void r.unregister()
    })
  }
} else {
  const updateSW = registerSW({
    immediate: true,
    onNeedRefresh() {
      useUi.getState().setUpdateReady(true, () => void updateSW())
    },
  })
}

// IndexedDB 探针：不可用则降级内存模式，并挂横幅；失败入错误日志
track(
  initStorage().then(() => {
    if (usingMemoryFallback) {
      const banner = document.createElement('div')
      banner.className = 'storage-banner'
      banner.setAttribute('role', 'alert')
      banner.textContent =
        '当前浏览器的本地存储不可用（隐私模式或已禁用）——本次会话的数据将不会被保存。建议换普通模式使用。'
      document.body.appendChild(banner)
    }
  }),
  '启动存储探针 initStorage',
)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
