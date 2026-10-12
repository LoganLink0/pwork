import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'
import { VitePWA } from 'vite-plugin-pwa'
import { fork } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Plugin } from 'vite'

const appRoot = dirname(fileURLToPath(import.meta.url))
// 固定入口常量：fork 直接以参数数组启动本仓库自带脚本，不经 shell、不拼命令
const GATEWAY_ENTRY = resolve(appRoot, 'tools/gateway.mjs')

/**
 * AI 本地网关自启（2026-10-12 用户拍板：服务起了，网关就得在——分发后用户不该遇到"问答报错因为网关没起"）。
 * 开发服务器启动时探测 127.0.0.1:8788/health：已有网关（桌面版/手动起的）跳过，否则拉起 tools/gateway.mjs；
 * 服务器退出时一并收掉。Key 仍只从 app/.env.local 读（gateway.mjs 自身逻辑）。
 */
function pworkGatewayAutostart(): Plugin {
  return {
    name: 'pwork-gateway-autostart',
    configureServer(server) {
      // vitest 也走这份配置起 server——测试环境绝不拉网关（否则子进程拖住 Vite 退出）
      if (process.env.VITEST) return
      let child: ReturnType<typeof fork> | null = null
      const up = async () => {
        try {
          const r = await fetch('http://127.0.0.1:8788/health', { signal: AbortSignal.timeout(800) })
          if (r.ok) {
            server.config.logger.info('[gateway] 8788 已有网关在跑，跳过自启')
            return
          }
        } catch {
          /* 未启动 → 继续拉起 */
        }
        // stdio 'ignore'：Windows 下从 vite 进程继承控制台会 0xC0000142 初始化失败（实测）；
        // 网关状态经 /health 与设置页「测试网关」暴露，用量写 gateway-usage.log，不依赖控制台输出
        child = fork(GATEWAY_ENTRY, [], { cwd: appRoot, stdio: 'ignore' })
        child.unref() // 不拖住 Vite 自身退出；退出时由下方 close 钩子显式收掉
        child.on('exit', (code) => {
          if (code) server.config.logger.warn(`[gateway] 网关进程退出（码 ${code}）——AI 问答将不可用，检查 app/.env.local`)
        })
        server.config.logger.info('[gateway] AI 本地网关已随开发服务器启动（127.0.0.1:8788）')
      }
      void up()
      server.httpServer?.on('close', () => child?.kill())
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  // PWORK 专用端口（与 FUPAN 的 5173/5174 区隔；启动器 launcher.cmd 依赖此端口）
  server: { port: 5273 },
  plugins: [
    react(),
    pworkGatewayAutostart(),
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['favicon.svg', 'icon-192.png', 'icon-512.png'],
      manifest: {
        name: '个人工作台 PWORK',
        short_name: '工作台',
        description: '本地优先的四模块个人操作系统——输入 → 处理 → 输出 → 回路，数据只属于你',
        lang: 'zh-CN',
        theme_color: '#e8833a',
        background_color: '#f5f4f1',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png}'],
        navigateFallback: 'index.html',
      },
    }),
  ],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    // 整树渲染 <App /> 的集成测试在全量并发时单条可超 5s（单跑 <1s），默认超时会误报
    testTimeout: 15000,
  },
})
