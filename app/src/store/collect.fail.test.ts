import { beforeEach, describe, expect, it, vi } from 'vitest'

// runCollect 打桩：本文件只验证 store 层的失败恢复与耗时透出
vi.mock('../engine/collect', async (importOriginal) => {
  const orig = await importOriginal<typeof import('../engine/collect')>()
  return { ...orig, runCollect: vi.fn() }
})

import { useCollect } from './collect'
import { runCollect } from '../engine/collect'
import { listErrors } from '../engine/errorLog'
import type { RunSummary } from '../engine/collect'

/** 「立即抓取」的失败路径（2026-10 事故回归：拒绝穿透曾让按钮永久停在「抓取中」） */

const OK_SUMMARY: RunSummary = {
  results: [],
  totalNew: 0,
  totalDiscarded: 0,
  digestIds: [],
  elapsedMs: 1234,
}

beforeEach(() => {
  vi.mocked(runCollect).mockReset()
  useCollect.setState({
    sources: [{ id: 's1', active: true } as never],
    fetch: { running: false, summary: null, lastRunAt: null, error: null },
  })
})

describe('runFetchAll 失败恢复', () => {
  it('runCollect 抛错 → running 复位、error 带原因、错误入日志', async () => {
    vi.mocked(runCollect).mockRejectedValueOnce(new Error('读取响应中止'))
    await useCollect.getState().runFetchAll()

    const f = useCollect.getState().fetch
    expect(f.running).toBe(false)
    expect(f.error).toBe('读取响应中止')
    expect(f.summary).toBeNull()

    const errs = await listErrors()
    expect(errs.length).toBeGreaterThanOrEqual(1)
    expect(errs[0]).toMatchObject({ where: '采集.立即抓取 runFetchAll', message: '读取响应中止' })
  })

  it('非 Error 抛出值 → error 存字符串形式，同样复位', async () => {
    vi.mocked(runCollect).mockRejectedValueOnce('裸字符串故障')
    await useCollect.getState().runFetchAll()
    const f = useCollect.getState().fetch
    expect(f.running).toBe(false)
    expect(f.error).toBe('裸字符串故障')
  })

  it('成功路径 → error 为空，耗时透出到 summary.elapsedMs', async () => {
    vi.mocked(runCollect).mockResolvedValueOnce(OK_SUMMARY)
    await useCollect.getState().runFetchAll()
    const f = useCollect.getState().fetch
    expect(f.running).toBe(false)
    expect(f.error).toBeNull()
    expect(f.summary?.elapsedMs).toBe(1234)
  })
})
