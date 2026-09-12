import '@testing-library/jest-dom/vitest'
import 'fake-indexeddb/auto'
import { configure } from '@testing-library/dom'
import { afterEach, beforeEach } from 'vitest'
import { cleanup } from '@testing-library/react'
import { db } from '../db/schema'

// 慢机器全量并发时放宽查询超时（PWORK 同款教训）
configure({ asyncUtilTimeout: 3000 })

// vitest 未开 globals 时 RTL 不会自动 cleanup——显式挂载，避免用例间 DOM 与全局监听器叠加
afterEach(() => cleanup())

// 铁律 7：测试永远指向测试库（fake-indexeddb 内存实现），与真实数据物理隔离
beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()))
  localStorage.clear()
})
