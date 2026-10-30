import '@testing-library/jest-dom/vitest'
import 'fake-indexeddb/auto'
import { configure } from '@testing-library/dom'
import { afterEach, beforeEach } from 'vitest'
import { cleanup } from '@testing-library/react'
import { db, setBackend } from '../db/delegate'
import { createMemoryBackend } from '../db/storage/memory'

// 08 设计 S1：测试全量跑内存后端——行为等价证明的载体（生产仍默认 Dexie）
setBackend(createMemoryBackend({ keyFields: { kv: 'key' } }))

// 全量并行时慢机器上步进转换可能超过默认 1s——统一放宽到 3s（FUPAN 2.2）
configure({ asyncUtilTimeout: 3000 })

// vitest 未开 globals 时 RTL 不会自动 cleanup——显式挂载，避免用例间 DOM 与全局监听器叠加
afterEach(() => cleanup())

// 铁律 7：测试永远指向测试库（fake-indexeddb 内存实现），与真实数据物理隔离
beforeEach(async () => {
  await db.clearAll()
  localStorage.clear()
  // 默认视为已完成首访引导——专门的 welcome 用例自行清除该标记
  localStorage.setItem('pwork-welcomed', '1')
})


