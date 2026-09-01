import { describe, expect, it } from 'vitest'
import { todayNoteCount, useNotes } from './notes'

/** 连点回归（开发复盘 1.2）：同批次多次更新不得互相覆盖 */
describe('useNotes store', () => {
  it('连续两次 update 不同字段都落库', async () => {
    const { create, update } = useNotes.getState()
    const n = await create({ body: '初始正文', tags: ['想法'] })

    await Promise.all([
      update(n.id, { body: '新正文' }),
      update(n.id, { tags: ['复盘'] }),
    ])

    const state = useNotes.getState()
    const stored = state.notes.find((x) => x.id === n.id)
    expect(stored?.body).toBe('新正文')
    expect(stored?.tags).toEqual(['复盘'])
  })

  it('create → notes 立即可见；softDelete → trash', async () => {
    const s = useNotes.getState()
    const n = await s.create({ body: '生命周期测试' })
    expect(useNotes.getState().notes.some((x) => x.id === n.id)).toBe(true)

    await useNotes.getState().softDelete(n.id)
    expect(useNotes.getState().notes.some((x) => x.id === n.id)).toBe(false)
    expect(useNotes.getState().trash.some((x) => x.id === n.id)).toBe(true)

    await useNotes.getState().restore(n.id)
    expect(useNotes.getState().notes.some((x) => x.id === n.id)).toBe(true)
  })

  it('todayNoteCount 只数今天创建的', async () => {
    const s = useNotes.getState()
    await s.create({ body: '今天的' })
    expect(todayNoteCount(useNotes.getState().notes)).toBe(1)
    expect(todayNoteCount(useNotes.getState().notes, new Date(Date.now() + 86400_000))).toBe(0)
  })
})
