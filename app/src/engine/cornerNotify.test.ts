import { afterEach, describe, expect, it, vi } from 'vitest'
import { useCornerNotify } from './cornerNotify'

afterEach(() => {
  vi.useRealTimers()
  useCornerNotify.setState({ entries: [] })
})

describe('右下角完成通知（cornerNotify）', () => {
  it('notify 入栈（最多保留 3 条）；dismiss 移除', () => {
    useCornerNotify.getState().notify({ title: '任务一', to: '/output/report', actionLabel: '去查看' })
    useCornerNotify.getState().notify({ title: '任务二', to: '/output/write', actionLabel: '去查看' })
    expect(useCornerNotify.getState().entries).toHaveLength(2)
    const first = useCornerNotify.getState().entries[0]!
    useCornerNotify.getState().dismiss(first.id)
    expect(useCornerNotify.getState().entries).toHaveLength(1)
    expect(useCornerNotify.getState().entries[0]!.title).toBe('任务二')
  })

  it('TTL 到点自动消失（超时兜底防堆积）', async () => {
    vi.useFakeTimers()
    useCornerNotify.getState().notify({ title: '任务三', to: '/goals', actionLabel: '去目标' })
    expect(useCornerNotify.getState().entries).toHaveLength(1)
    await vi.advanceTimersByTimeAsync(13_000)
    expect(useCornerNotify.getState().entries).toHaveLength(0)
    vi.useRealTimers()
  })
})
