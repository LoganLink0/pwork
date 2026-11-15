import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '../db/schema'
import { runLocalIntent } from './intent'
import type { Note, TaskItem } from '../types/models'

function note(partial: Partial<Note>): Note {
  return {
    id: partial.id ?? 'n_x',
    title: partial.title ?? '',
    body: partial.body ?? '',
    tags: [],
    links: { itemIds: [], reviewIds: [], taskIds: [] },
    source: 'manual',
    createdAt: '2026-11-15T00:00:00.000Z',
    updatedAt: '2026-11-15T00:00:00.000Z',
    deletedAt: null,
    schemaVersion: 1,
    ...partial,
  } as Note
}

function task(partial: Partial<TaskItem>): TaskItem {
  return {
    id: partial.id ?? 't_x',
    title: partial.title ?? '',
    status: 'todo',
    createdAt: '2026-11-15T00:00:00.000Z',
    updatedAt: '2026-11-15T00:00:00.000Z',
    schemaVersion: 1,
    ...partial,
  } as TaskItem
}

beforeEach(async () => {
  await db.clearAll()
})

describe('runLocalIntent（问小 P 本地降级）', () => {
  it('排期意图：汇总未完成任务，分逾期/今天/之后', async () => {
    await db.tasks.bulkPut([
      task({ id: 't1', title: '交季度总结', due: '2026-11-14' }),
      task({ id: 't2', title: '回复评审意见', due: '2026-11-15' }),
      task({ id: 't3', title: '准备下周分享', due: '2026-11-20' }),
      task({ id: 't4', title: '随手记的想法没定期限' }),
    ])
    const r = await runLocalIntent('最近有什么待办', new Date('2026-11-15T10:00:00'))
    expect(r.via).toBe('schedule')
    expect(r.reply).toContain('交季度总结')
    expect(r.reply).toContain('回复评审意见')
    expect(r.reply).toContain('准备下周分享')
    expect(r.reply).toContain('逾期 1 条')
    expect(r.reply).toContain('没设期限')
  })

  it('排期空库：直说没有待办', async () => {
    const r = await runLocalIntent('今天有什么安排', new Date('2026-11-15T10:00:00'))
    expect(r.via).toBe('schedule')
    expect(r.reply).toContain('没有未完成的待办')
  })

  it('非询问句式不误判为排期（走检索）', async () => {
    const r = await runLocalIntent('帮我整理增长实验的待办清单草稿', new Date('2026-11-15T10:00:00'))
    // 该句含「待办」但无询问词（什么/哪些/看看/列表/有没有/还有 均不在）→ 检索
    expect(r.via).toBe('search')
  })

  it('默认检索：命中速记正文并给来源', async () => {
    await db.notes.bulkPut([
      note({ id: 'n1', title: '增长实验记录', body: '增长实验复盘：转化率提升 12%，下一步扩大样本。' }),
      note({ id: 'n2', title: '周末食谱', body: '番茄牛腩的做法。' }),
    ])
    const r = await runLocalIntent('增长实验')
    expect(r.via).toBe('search')
    expect(r.reply).toContain('本地检索到')
    expect(r.reply).toContain('增长实验记录')
    expect(r.sources.some((s) => s.title === '增长实验记录')).toBe(true)
    expect(r.sources.every((s) => s.title !== '周末食谱')).toBe(true)
  })

  it('空输入：提示先输入', async () => {
    const r = await runLocalIntent('  ')
    expect(r.reply).toContain('先输入')
  })

  it('记一条语法已随写路径移除：不再触发任何特殊意图（走检索）', async () => {
    await db.notes.bulkPut([
      note({ id: 'n1', title: '增长实验记录', body: '增长实验复盘：转化率提升 12%。' }),
    ])
    const r = await runLocalIntent('记一条：这条只是普通内容')
    expect(r.via).toBe('search')
  })
})
