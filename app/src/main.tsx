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

// 主题偏好在任何渲染前应用，避免闪屏
applyTheme(loadTheme())
// PWA Service Worker：离线可用、安装到主屏
registerSW({ immediate: true })

// IndexedDB 探针：不可用则降级内存模式，并挂横幅
void initStorage().then(() => {
  if (usingMemoryFallback) {
    const banner = document.createElement('div')
    banner.className = 'storage-banner'
    banner.setAttribute('role', 'alert')
    banner.textContent =
      '当前浏览器的本地存储不可用（隐私模式或已禁用）——本次会话的数据将不会被保存。建议换普通模式使用。'
    document.body.appendChild(banner)
  }
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
