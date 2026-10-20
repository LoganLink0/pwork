import { describe, expect, it } from 'vitest'
import { rejectionStats } from './rejectionStats'
import { newId } from '../db/repo'
import type { Item } from '../types/models'

function mkDiscarded(reason: string, sourceId = 's1', sourceName = '源一', dayOffset = 0): Item {
  const at = new Date(Date.now() - dayOffset * 86_400_000).toISOString()
  return {
    id: newId('itm'),
    sourceId,
    sourceName,
    url: `https://a.com/${newId('x')}`,
    title: '标题足够长的条目内容',
    summary: '',
    fingerprint: newId('fp'),
    eventGroup: null,
    publishedAt: null,
    fetchedAt: at,
    stage: 'discarded',
    score: { total: 0, source: 0, novelty: 0, relevance: 0, utility: 0 },
    scoreReason: reason,
    aiBy: 'rules',
    tags: [],
    otFlag: null,
    expiresAt: at,
    annotation: { notes: '', vote: null, keepForever: false, linkedReviewId: null },
    createdAt: at,
    updatedAt: at,
    schemaVersion: 1,
  }
}

describe('rejectionStats（筛除原因聚合）', () => {
  it('按原因分桶：屏蔽词归并统计词频冠军、本地前缀剥掉、其余按原文', () => {
    const items = [
      mkDiscarded('预筛拒绝：命中屏蔽词「融资」'),
      mkDiscarded('预筛拒绝：命中屏蔽词「融资」'),
      mkDiscarded('命中屏蔽词「八卦」'), // 云端拉回的没有前缀
      mkDiscarded('预筛拒绝：标题过短'),
      mkDiscarded('AI 判定与兴趣无关'),
    ]
    const r = rejectionStats(items)!
    expect(r.total).toBe(5)
    expect(r.byReason[0]).toMatchObject({ reason: '命中屏蔽词', count: 3 })
    expect(r.byReason[0]!.topWord).toEqual({ word: '融资', count: 2 })
    expect(r.byReason.map((b) => b.reason)).toContain('标题过短')
    expect(r.byReason.map((b) => b.reason)).toContain('AI 判定与兴趣无关')
  })

  it('筛除量最大的源 + 占比；占比过半是页面提示的门槛', () => {
    const items = [
      ...Array.from({ length: 4 }, () => mkDiscarded('标题过短', 's1', '垃圾源')),
      mkDiscarded('标题过短', 's2', '正常源'),
    ]
    const r = rejectionStats(items)!
    expect(r.topSource).toEqual({ name: '垃圾源', count: 4, share: 0.8 })
  })

  it('只统计近 30 天未删除的已筛除条目；没有则返回 null', () => {
    const old = { ...mkDiscarded('标题过短'), fetchedAt: new Date(Date.now() - 40 * 86_400_000).toISOString() }
    const deleted = { ...mkDiscarded('标题过短'), deletedAt: new Date().toISOString() }
    const scored = { ...mkDiscarded('标题过短'), stage: 'scored' as const }
    expect(rejectionStats([old, deleted, scored])).toBeNull()
    expect(rejectionStats([])).toBeNull()
  })
})
