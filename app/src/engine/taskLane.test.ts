import { describe, expect, it } from 'vitest'
import { resolveLane } from './taskLane'
import type { TaskItem } from '../types/models'

function task(over: Partial<TaskItem> = {}): TaskItem {
  return {
    id: 'task_test',
    title: '测试任务',
    status: 'todo',
    origin: { kind: 'manual', refId: null },
    closedAt: null,
    createdAt: '2026-09-01T08:00:00.000Z',
    updatedAt: '2026-09-01T08:00:00.000Z',
    deletedAt: null,
    schemaVersion: 1,
    ...over,
  }
}

describe('resolveLane 三问分诊', () => {
  it('到期日已到（今天/逾期）→ 一类', () => {
    expect(resolveLane(task({ due: '2026-09-01' }), '2026-09-01')).toBe(1)
    expect(resolveLane(task({ due: '2026-08-30' }), '2026-09-01')).toBe(1)
  })

  it('投标来源 → 二类（即使还没到今天）', () => {
    expect(resolveLane(task({ due: '2026-09-10', origin: { kind: 'bid', refId: null } }), '2026-09-01')).toBe(2)
  })

  it('普通无期限任务 → 三类', () => {
    expect(resolveLane(task(), '2026-09-01')).toBe(3)
  })

  it('手动设置过分类 → 以手动为准，自动规则不再覆盖', () => {
    // 今天到期但用户明确挪到三类：尊重用户决定（逾期红标仍然可见）
    expect(resolveLane(task({ due: '2026-09-01', lane: 3 }), '2026-09-01')).toBe(3)
    // 投标来源但用户挪到一类
    expect(resolveLane(task({ origin: { kind: 'bid', refId: null }, lane: 1 }), '2026-09-01')).toBe(1)
  })

  it('已结束任务不再参与自动分诊，保留当时分类', () => {
    expect(resolveLane(task({ status: 'done', closedAt: '2026-09-01T10:00:00.000Z' }), '2026-09-01')).toBe(3)
    expect(resolveLane(task({ status: 'dropped', lane: 2, closedAt: '2026-09-01T10:00:00.000Z' }), '2026-09-01')).toBe(2)
  })
})
