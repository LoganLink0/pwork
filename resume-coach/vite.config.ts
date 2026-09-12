import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// 简历辅导独立项目 · 专用端口 5274（与 PWORK 的 5273 区隔）
export default defineConfig({
  server: { port: 5274 },
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    // 整树渲染集成测试在低配机器全量并发时可能超默认 5s
    testTimeout: 15000,
  },
})
