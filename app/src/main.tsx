import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import './styles/tokens.css'
import './styles/base.css'
/* shell 域样式（3.2 拆分）：按原 shell.css 的段顺序引入——级联顺序即原文件顺序，不可乱序 */
import './styles/shell.css'
import './styles/shell-home.css'
import './styles/shell-pages.css'
import './styles/shell-mobile.css'
import './styles/shell-overlays.css'
import './styles/shell-welcome.css'
import './styles/shell-widgets.css'
import './styles/collect.css'
import './modules/review/styles/review.css'
import App from './App.tsx'
import { applyTheme, loadTheme } from './engine/appearance.ts'
import { migrateLocalPrefs, readPrefsFile, readPref, writePref } from './engine/prefsFile.ts'
import { initPrefs } from './engine/prefs.ts'
import { initStorage, usingMemoryFallback } from './db/schema.ts'
import { useUi } from './store/ui.ts'
import { installErrorCapture, recordError, track } from './engine/errorLog.ts'
import { isDesktopApp } from './engine/platform.ts'

// 错误捕获最先安装：之后任何未捕获错误都会记录 + 顶出错误条
installErrorCapture()

// 主题偏好在任何渲染前应用，避免闪屏
applyTheme(loadTheme())

// 配置文件化迁移（2026-11-16，桌面版）：预热 prefs.json 缓存后把 localStorage 旧键一次性
// 平移进文件（文件已有键跳过不覆盖——升级时文件里的值比旧键新）。治 origin 隔离与强杀丢配置：
// dev 壳与桌面版自此读同一数据目录文件。平移后各消费方读 prefs 命中、localStorage 只作回落。
// 浏览器版不迁（无数据目录，继续走 localStorage）。
if (isDesktopApp()) {
  void readPrefsFile()
    .then(() =>
      migrateLocalPrefs([
        'pwork-theme',
        'fupan-coach',
        'pwork-keybinds',
        'pwork-autobackup',
        'pwork-isle-pos',
        'pwork-isle-settings',
        'pwork-last-backup',
        'pwork-backup-snooze',
      ]),
    )
    .then(() => {
      // Key 边界手术（0.1.18 定稿：桌面版 Key 只在 gateway.env）：历史配置可能带直连
      // apiKey 字段，平移进了明文文件——读出来清掉再写回（viaGateway 归一不受影响）
      const coach = readPref<Record<string, unknown> | undefined>('fupan-coach', undefined)
      if (coach && typeof coach.apiKey === 'string' && coach.apiKey) {
        writePref('fupan-coach', { ...coach, apiKey: '' })
        recordError({ where: '配置文件.迁移', kind: 'app', message: '历史直连 API Key 已按桌面边界清除（Key 只在 gateway.env）' }, { silent: true })
      }
    })
}

// 显示设置（字号缩放/阅读行宽/字体）同样渲染前应用——写 CSS 变量到根元素
initPrefs()

// 常用页面 chunk 空闲预载：消除「首屏懒组件未加载完时快速点击导航 → 目标页白屏」的竞态窗口，
// 同时治「首次点击各模块页加载缓慢」（2026-11-15 用户反馈：此前只预载 4 页，其余模块页
// 首次点击现拉 chunk+现挂 store）。高频主干一次 idle 拉齐；低频工具页第二波错峰（避免启动
// 瞬间并发抢资源）。两波都不 await——预载失败静默（点击时 loader 自然重试）
const IDLE = (window as unknown as { requestIdleCallback?: (cb: () => void) => void }).requestIdleCallback
const preloadIdle = (cb: () => void) => (IDLE ? IDLE(cb) : setTimeout(cb, 1200))
preloadIdle(() => {
  void import('./pages/Settings')
  void import('./pages/Help')
  void import('./pages/Tasks')
  void import('./pages/Goals')
  void import('./modules/input/pages/Notes')
  void import('./modules/input/pages/Digest')
  void import('./modules/input/pages/Items')
  void import('./modules/input/pages/Sources')
  void import('./modules/process/pages/Process')
  void import('./modules/output/pages/Output')
  void import('./modules/review/pages/Dashboard')
})
preloadIdle(() => {
  void import('./modules/output/pages/ProducePage')
  void import('./modules/output/pages/ReportGenerator')
  void import('./modules/output/pages/ReadOutLoud')
  void import('./modules/output/pages/DataCard')
  void import('./modules/output/pages/PptWriter')
  void import('./modules/output/pages/ArticleDraftPage')
  void import('./modules/output/pages/ResearchPage')
})

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
  // demo 构建自动更新模式：新 SW 接管（skipWaiting+clientsClaim）后自动刷新一次——
  // 部署新版后用户免手动清缓存再刷（2026-11-07 手机端反馈：夸克等浏览器缓存停旧版）
  if (import.meta.env.MODE === 'demo') {
    let reloaded = false
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (reloaded) return
      reloaded = true
      window.location.reload()
    })
  }
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

// 轮盘独立窗（系统工具形态）：label=wheel 的透明小窗加载 #/wheel——不进 App 的路由与壳，
// 只渲染轮盘本体（无焦点纯鼠标视图）。html 打 wheel 标记：全局样式里把 body 底色转透明
//（base.css 的 body 有 var(--bg) 底色，不豁免的话透明窗会渲染成一块实色）。
// 仅桌面版分流：#/wheel 是 Tauri 专属入口，公网网页版（demo）有人手输这个地址时走正常应用
if (window.location.hash.startsWith('#/wheel') && isDesktopApp()) {
  document.documentElement.dataset.wheel = '1'
  void import('./components/shell/WheelWindow').then(({ WheelWindow }) => {
    createRoot(document.getElementById('root')!).render(
      <StrictMode>
        <WheelWindow />
      </StrictMode>,
    )
  })
} else if (window.location.hash.startsWith('#/isle') && isDesktopApp()) {
  // 胶囊岛独立窗：同轮盘的透明窗分流（html 打 isle 标记，body 底色转透明）
  document.documentElement.dataset.isle = '1'
  void import('./components/shell/IsleWindow').then(({ IsleWindow }) => {
    createRoot(document.getElementById('root')!).render(
      <StrictMode>
        <IsleWindow />
      </StrictMode>,
    )
  })
} else if (window.location.hash.startsWith('#/palette') && isDesktopApp()) {
  // 问小 P 独立窗（Spotlight 形态）：胶囊岛「问小 P」/全局键呼出，不承载主窗壳与路由；
  // 页面跳转经 palette_goto 桥接回主窗执行
  document.documentElement.dataset.palette = '1'
  void import('./components/shell/PaletteWindow').then(({ PaletteWindow }) => {
    createRoot(document.getElementById('root')!).render(
      <StrictMode>
        <PaletteWindow />
      </StrictMode>,
    )
  })
} else {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}
