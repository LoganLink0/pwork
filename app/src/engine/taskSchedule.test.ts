import { describe, expect, it } from 'vitest'
import { scheduleGroups } from './taskSchedule'
import type { Goal, TaskItem } from '../types/models'

const now = new Date('2026-10-24T10:00:00')
const day = (offset: number) => {
  const d = new Date(now)
  d.setDate(d.getDate() + offset)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

let seq = 0
function task(pick: Partial<TaskItem> = {}): TaskItem {
  seq++
  return {
    id: `t${seq}`,
    title: `任务${seq}`,
    status: 'todo',
    origin: { kind: 'manual', refId: null },
    closedAt: null,
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-01T00:00:00.000Z',
    deletedAt: null,
    schemaVersion: 1,
    ...pick,
  }
}

function goal(pick: Partial<Goal> = {}): Goal {
  seq++
  return {
    id: `g${seq}`,
    title: `目标${seq}`,
    status: 'active',
    closedAt: null,
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-01T00:00:00.000Z',
    deletedAt: null,
    schemaVersion: 1,
    ...pick,
  }
}

describe('时间视图分组（scheduleGroups）', () => {
  it('逾期置顶、今天/明天/后天具名、更远按日、无期限沉底', () => {
    const groups = scheduleGroups(
      [
        task({ due: day(-3) }),
        task({ due: day(0) }),
        task({ due: day(1) }),
        task({ due: day(2) }),
        task({ due: day(5) }),
        task({ due: undefined }),
      ],
      [],
      now,
    )
    expect(groups.map((g) => g.key)).toEqual(['over', day(0), day(1), day(2), day(5), 'none'])
    expect(groups.map((g) => g.label)).toEqual(['已逾期', '今天', '明天', '后天', expect.stringContaining('月'), '无期限'])
    expect(groups[0]!.entries[0]!.overDays).toBe(3)
  })

  it('目标按期限汇入同一时间线，无期限目标不进', () => {
    const groups = scheduleGroups([task({ due: day(0) })], [goal({ due: day(1) }), goal({ due: undefined })], now)
    expect(groups).toHaveLength(2)
    expect(groups[1]!.entries.some((e) => e.kind === 'goal')).toBe(true)
  })

  it('已完成/已放弃/已删的待办与已结束的目标不进时间线', () => {
    const groups = scheduleGroups(
      [task({ due: day(0), status: 'done' }), task({ due: day(0), status: 'dropped' }), task({ due: day(0), deletedAt: '2026-10-20T00:00:00.000Z' })],
      [goal({ due: day(0), status: 'done' })],
      now,
    )
    expect(groups).toHaveLength(0)
  })

  it('同日待办与目标同组，逾期天数逐条标注', () => {
    const groups = scheduleGroups(
      [task({ due: day(-1) }), task({ due: day(-10) })],
      [goal({ due: day(-1) })],
      now,
    )
    expect(groups).toHaveLength(1)
    expect(groups[0]!.key).toBe('over')
    expect(groups[0]!.entries.map((e) => e.overDays).sort()).toEqual([1, 1, 10])
  })
})
