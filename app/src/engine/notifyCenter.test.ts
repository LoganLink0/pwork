import { describe, it, expect, beforeEach } from 'vitest'
import { useNotifyHub, unreadCount } from './notifyCenter'

/** 每例前清空 store 与 localStorage（store 读取发生在模块加载后，逐例重置） */
beforeEach(() => {
  localStorage.clear()
  useNotifyHub.setState({ items: [], panelOpen: false })
})

describe('通知中心（notifyCenter）', () => {
  it('push 新增未读条目，最新在前', () => {
    useNotifyHub.getState().push({ kind: 'done', title: '日报已生成', to: '/input/digest' })
    useNotifyHub.getState().push({ kind: 'remind', title: '该复盘了' })
    const items = useNotifyHub.getState().items
    expect(items).toHaveLength(2)
    expect(items[0].title).toBe('该复盘了')
    expect(items[1].title).toBe('日报已生成')
    expect(items.every((it) => !it.read)).toBe(true)
    expect(unreadCount(items)).toBe(2)
  })

  it('push 带可选字段：desc 与 to 落库，缺省为 undefined', () => {
    useNotifyHub.getState().push({ kind: 'done', title: '完成', desc: '3 条', to: '/process' })
    useNotifyHub.getState().push({ kind: 'remind', title: '提醒' })
    const [first, second] = useNotifyHub.getState().items
    expect(first.desc).toBeUndefined()
    expect(second.desc).toBe('3 条')
    expect(second.to).toBe('/process')
  })

  it('上限 50 条：超出后最旧的被挤出', () => {
    for (let i = 0; i < 52; i++) useNotifyHub.getState().push({ kind: 'system', title: `通知 ${i}` })
    const items = useNotifyHub.getState().items
    expect(items).toHaveLength(50)
    expect(items[0].title).toBe('通知 51')
    expect(items[49].title).toBe('通知 2')
  })

  it('markRead 单条翻已读；markAllRead 全部翻已读', () => {
    useNotifyHub.getState().push({ kind: 'done', title: 'A' })
    useNotifyHub.getState().push({ kind: 'done', title: 'B' })
    const [a] = useNotifyHub.getState().items
    useNotifyHub.getState().markRead(a.id)
    expect(unreadCount(useNotifyHub.getState().items)).toBe(1)
    useNotifyHub.getState().markAllRead()
    expect(unreadCount(useNotifyHub.getState().items)).toBe(0)
  })

  it('clear 清空并持久化（重载后仍为空）', () => {
    useNotifyHub.getState().push({ kind: 'done', title: 'A' })
    useNotifyHub.getState().clear()
    expect(useNotifyHub.getState().items).toHaveLength(0)
    expect(JSON.parse(localStorage.getItem('pwork-notify-hub') ?? '[]')).toHaveLength(0)
  })

  it('push 持久化到 localStorage：新页面读同一份', () => {
    useNotifyHub.getState().push({ kind: 'done', title: '跨页面可见' })
    const stored = JSON.parse(localStorage.getItem('pwork-notify-hub') ?? '[]') as { title: string }[]
    expect(stored[0].title).toBe('跨页面可见')
  })
})
