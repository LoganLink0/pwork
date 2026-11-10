import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '../db/schema'
import {
  detectMutation,
  describeTriggers,
  GUARD_MIN_BASE,
  runMutationGuard,
  writeReference,
  writeReferenceAfterPurge,
  holdUntilGuardSettled,
  acknowledgeCurrentState,
  refreshReferenceAfterRestore,
  getQuarantine,
  readQuarantineBundle,
  clearQuarantine,
  latestDesktopBackup,
  type GuardIo,
} from './dbGuard'
import { wipeAndImport, restorePreImportSnapshot, savePreImportSnapshot, getPreImportSnapshot } from '../db/backup'
import { buildBackupBundle } from '../store/collect'
import type { Item } from '../types/models'
import type { Note } from '../types/models'

/**
 * 主库突变守卫（2026-11-10 定稿设计）：启动比对骤减 ≥95% → 隔离现状 + 恢复窗口。
 * 网页路径直接走内存库；桌面路径经 window.__TAURI_INTERNALS__ 模拟 + 注入 io。
 */

const note = (id: string, updatedAt: string): Note => ({
  id, title: `速记 ${id}`, body: '正文', tags: [], links: { itemIds: [], reviewIds: [], taskIds: [] }, source: 'manual',
  createdAt: updatedAt, updatedAt, deletedAt: null, schemaVersion: 1,
})

const baseCounts = (over: Record<string, number> = {}): Record<string, number> => ({
  notes: 100, sources: 40, items: 200, tasks: 30, reviews: 25, actions: 35, insights: 22, goals: 10,
  ...over,
})

/** 注入 io：backups/ 目录用内存字典模拟，written 记录全部写盘动作供断言 */
const fakeIo = (files: Record<string, string> = {}) => {
  const store = { ...files }
  const written: Array<{ name: string; content: string }> = []
  const io: GuardIo = {
    async readJsonFile(name) {
      return store[name] ?? null
    },
    async writeTextFile(name, content) {
      store[name] = content
      written.push({ name, content })
    },
    async listBackupNames() {
      return Object.keys(store)
    },
    async readBackupFile(name) {
      return store[name] ?? ''
    },
  }
  return { io, written, store }
}

const setDesktop = (on: boolean) => {
  if (on) {
    ;(window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {}
  } else {
    delete (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__
  }
}

/** 读 kv 里的比对基准；行不存在就地崩（测试自身失序比静默通过更糟） */
async function refCounts(): Promise<Record<string, number>> {
  const row = await db.kv.get('pwork-last-counts')
  if (!row) throw new Error('比对基准行不存在')
  return (row.value as { counts: Record<string, number> }).counts
}

beforeEach(async () => {
  await db.clearAll()
  setDesktop(false)
})

describe('detectMutation（纯判定）', () => {
  it('无基准 → 不判', () => {
    expect(detectMutation(null, baseCounts())).toEqual([])
    expect(detectMutation(undefined, baseCounts())).toEqual([])
  })

  it('正常波动与增长 → 不判', () => {
    expect(detectMutation(baseCounts(), baseCounts({ notes: 80, items: 260 }))).toEqual([])
  })

  it('骤减 ≥95% → 命中', () => {
    const hits = detectMutation(baseCounts(), baseCounts({ notes: 4, items: 3 }))
    expect(hits.map((h) => h.table).sort()).toEqual(['items', 'notes'])
    expect(hits.find((h) => h.table === 'notes')).toMatchObject({ prev: 100, cur: 4 })
  })

  it('边界：现存恰好 5% 算命中（100→5），6% 不算', () => {
    expect(detectMutation(baseCounts(), baseCounts({ notes: 5 }))).toHaveLength(1)
    expect(detectMutation(baseCounts(), baseCounts({ notes: 6 }))).toEqual([])
  })

  it(`基准低于 ${GUARD_MIN_BASE} 条不判（小库自然波动不惊扰）`, () => {
    expect(detectMutation(baseCounts({ goals: 19 }), baseCounts({ goals: 0 }))).toEqual([])
    expect(detectMutation(baseCounts({ goals: 20 }), baseCounts({ goals: 0 }))).toHaveLength(1)
  })

  it('基准缺某表键 → 该表跳过不误报', () => {
    const prev = baseCounts()
    delete prev.goals
    expect(detectMutation(prev, baseCounts({ goals: 0 }))).toEqual([])
  })

  it('describeTriggers 出人话', () => {
    const msg = describeTriggers([{ table: 'notes', prev: 5203, cur: 3 }])
    expect(msg).toContain('速记')
    expect(msg).toContain('5,203')
    expect(msg).toContain('3')
  })
})

describe('runMutationGuard（网页路径：kv 基准 + kv 隔离副本）', () => {
  it('首次启动无基准 → 不触发，基准写入 kv', async () => {
    const r = await runMutationGuard({ counts: baseCounts(), now: new Date('2026-11-10T10:00:00') })
    expect(r.triggered).toBe(false)
    expect((await refCounts()).notes).toBe(100)
  })

  it('正常启动 → 基准刷新为当前计数', async () => {
    await writeReference(baseCounts())
    await runMutationGuard({ counts: baseCounts({ notes: 120 }), now: new Date('2026-11-10T10:00:00') })
    expect((await refCounts()).notes).toBe(120)
  })

  it('突变触发：返回触发项、隔离副本进 kv、基准不被覆盖（未回答前下次启动还会提醒）', async () => {
    await db.notes.bulkAdd([note('n1', '2026-11-09T10:00:00.000Z'), note('n2', '2026-11-09T11:00:00.000Z')])
    await writeReference(baseCounts())
    const r = await runMutationGuard({ counts: baseCounts({ notes: 2 }), now: new Date('2026-11-10T10:00:00') })
    expect(r.triggered).toBe(true)
    expect(r.triggers).toEqual([{ table: 'notes', prev: 100, cur: 2 }])

    const q = await getQuarantine()
    expect(q).not.toBeNull()
    expect(q!.where).toBe('kv')
    expect(q!.triggers).toEqual(r.triggers)
    const bundleText = await readQuarantineBundle(q!)
    const bundle = JSON.parse(bundleText) as { entities: { notes: unknown[] } }
    expect(bundle.entities.notes).toHaveLength(2)

    expect((await refCounts()).notes).toBe(100)
  })

  it('确认保留现状 → 基准刷新，再启动不再提醒', async () => {
    await writeReference(baseCounts())
    const r = await runMutationGuard({ counts: baseCounts({ notes: 2 }), now: new Date('2026-11-10T10:00:00') })
    expect(r.triggered).toBe(true)
    await acknowledgeCurrentState(r.counts)
    const again = await runMutationGuard({ counts: r.counts, now: new Date('2026-11-10T11:00:00') })
    expect(again.triggered).toBe(false)
  })

  it('恢复完成后 refreshReferenceAfterRestore：基准=恢复后计数、隔离标记清除', async () => {
    await db.notes.bulkAdd([note('n1', '2026-11-09T10:00:00.000Z')])
    await writeReference(baseCounts())
    await runMutationGuard({ counts: baseCounts({ notes: 1 }), now: new Date('2026-11-10T10:00:00') })
    expect(await getQuarantine()).not.toBeNull()
    await refreshReferenceAfterRestore()
    expect((await refCounts()).notes).toBe(1)
    expect(await getQuarantine()).toBeNull()
  })
})

describe('runMutationGuard（桌面路径：注入 io 模拟 backups/ 文件）', () => {
  it('突变触发 → 隔离副本写入备份文件夹（quarantine- 前缀）', async () => {
    setDesktop(true)
    const io = fakeIo({ 'db-counts.json': JSON.stringify({ at: '2026-11-09T10:00:00', counts: baseCounts() }) })
    const r = await runMutationGuard({ counts: baseCounts({ items: 1 }), io: io.io, now: new Date('2026-11-10T10:00:00') })
    expect(r.triggered).toBe(true)
    expect(r.quarantine?.where).toBe('file')
    expect(r.quarantine?.fileName).toMatch(/^quarantine-\d{8}-\d{4}\.json$/)
    const quarWrite = io.written.find((w) => w.name.startsWith('quarantine-'))
    expect(quarWrite).toBeDefined()
    expect(JSON.parse(quarWrite!.content)).toMatchObject({ version: 2 })
  })

  it('kv 基准缺失时回落到库外文件 db-counts.json 比对（主库被整个换掉的兜底）', async () => {
    setDesktop(true)
    const io = fakeIo({ 'db-counts.json': JSON.stringify({ at: '2026-11-09T10:00:00', counts: baseCounts() }) })
    const r = await runMutationGuard({ counts: baseCounts({ notes: 0 }), io: io.io, now: new Date('2026-11-10T10:00:00') })
    expect(r.triggered).toBe(true)
    expect(r.triggers[0]?.table).toBe('notes')
  })

  it('无突变 → 库外基准文件同步刷新', async () => {
    setDesktop(true)
    const io = fakeIo()
    await runMutationGuard({ counts: baseCounts({ notes: 88 }), io: io.io, now: new Date('2026-11-10T10:00:00') })
    const text = await io.io.readJsonFile('db-counts.json')
    expect(text).not.toBeNull()
    expect((JSON.parse(text!) as { counts: Record<string, number> }).counts.notes).toBe(88)
  })

  it('latestDesktopBackup：只认 pwork-backup-*.json，取字典序最新（quarantine- 与其他文件不掺和）', async () => {
    setDesktop(true)
    const io = fakeIo({
      'pwork-backup-20261101-0900.json': '{"old":1}',
      'pwork-backup-20261108-0900.json': '{"new":2}',
      'quarantine-20261109-1200.json': '{"q":3}',
      '手工导出.json': '{"m":4}',
    })
    const latest = await latestDesktopBackup(io.io)
    expect(latest?.name).toBe('pwork-backup-20261108-0900.json')
    expect(latest?.text).toBe('{"new":2}')
  })
})

describe('wipeAndImport（守卫恢复与导入前快照共用的清表恢复入口）', () => {
  it('清业务表整包导回；kv 不动（本地设置与快照保留）', async () => {
    await db.notes.bulkAdd([note('n1', '2026-11-01T10:00:00.000Z'), note('n2', '2026-11-02T10:00:00.000Z'), note('n3', '2026-11-03T10:00:00.000Z')])
    await db.kv.put({ key: 'pwork-guard-quarantine', value: { at: 'x', where: 'kv', name: 'y', triggers: [] } })
    const keep = { notes: [note('restore-me', '2026-10-01T10:00:00.000Z')] }
    const r = await wipeAndImport(JSON.stringify({ version: 2, entities: keep }))
    expect(r.format).toBe('pwork-v2')
    expect((await db.notes.toArray()).map((n) => n.id)).toEqual(['restore-me'])
    expect(await db.kv.get('pwork-guard-quarantine')).not.toBeUndefined()
  })

  it('restorePreImportSnapshot 复用同一条路：恢复后回到快照状态', async () => {
    await db.notes.bulkAdd([note('keep-a', '2026-11-01T10:00:00.000Z')])
    await savePreImportSnapshot(await buildBackupBundle())
    await db.notes.bulkAdd([note('junk-b', '2026-11-05T10:00:00.000Z')])
    await restorePreImportSnapshot()
    expect((await db.notes.toArray()).map((n) => n.id)).toEqual(['keep-a'])
    expect(await getPreImportSnapshot()).not.toBeNull()
  })
})

describe('例行清理闸（守卫 × TTL 清理竞态修正，2026-11-10）', () => {
  const expiredDiscarded = (id: string): Item => ({
    id, sourceId: 's', sourceName: '源', url: `https://a.com/${id}`, title: `过期条目 ${id}`,
    summary: '', fingerprint: `fp_${id}`, eventGroup: null, publishedAt: null,
    fetchedAt: '2026-10-01T00:00:00.000Z', stage: 'discarded',
    score: { total: 50, source: 10, novelty: 10, relevance: 20, utility: 10 }, scoreReason: '', aiBy: 'rules',
    tags: [], otFlag: null, expiresAt: '2026-10-20T00:00:00.000Z',
    annotation: { notes: '', vote: null, keepForever: false, linkedReviewId: null },
    createdAt: '2026-10-01T00:00:00.000Z', updatedAt: '2026-10-01T00:00:00.000Z', deletedAt: undefined, schemaVersion: 1,
  })

  it('闸未放行时 maintenance 不清理；放行后清理，writeReferenceAfterPurge 刷新基准', async () => {
    await db.items.bulkAdd([expiredDiscarded('g1'), expiredDiscarded('g2'), expiredDiscarded('g3')])
    let release!: () => void
    holdUntilGuardSettled(
      new Promise<void>((r) => {
        release = r
      }),
    )
    const { maintenance } = await import('../engine/collect')
    const run1 = maintenance() // 挂在闸上
    await new Promise((r) => setTimeout(r, 20))
    expect((await db.items.toArray()).length).toBe(3) // 闸未放行：数据不动
    release()
    expect(await run1).toBe(3) // 放行后正常清理
    await writeReferenceAfterPurge()
    const counts = (await db.kv.get('pwork-last-counts'))?.value as { counts: Record<string, number> }
    expect(counts.counts.items).toBe(0)
    holdUntilGuardSettled(Promise.resolve()) // 复位闸，不影响其他用例
  })

  it('不持闸（默认已放行）时 maintenance 行为不变——非启动场景零影响', async () => {
    holdUntilGuardSettled(Promise.resolve())
    await db.items.bulkAdd([expiredDiscarded('g4')])
    const { maintenance } = await import('../engine/collect')
    expect(await maintenance()).toBe(1)
  })
})

describe('clearQuarantine', () => {
  it('清掉后 getQuarantine 返回 null', async () => {
    await db.kv.put({ key: 'pwork-guard-quarantine', value: { at: 'x', where: 'kv', name: 'y', triggers: [{ table: 'notes', prev: 100, cur: 2 }] } })
    expect(await getQuarantine()).not.toBeNull()
    await clearQuarantine()
    expect(await getQuarantine()).toBeNull()
  })
})
