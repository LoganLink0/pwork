import { beforeEach, describe, expect, it } from 'vitest'
import fixtureRaw from './__fixtures__/backup-0.1.10-sample.json?raw'
import { buildBackupBundle } from '../store/collect'
import { importBundle, savePreImportSnapshot, getPreImportSnapshot, restorePreImportSnapshot } from './backup'
import { db } from './schema'
import { createGoal } from './goalsRepo'
import { saveBlock } from './blocksRepo'
import { saveProfile } from './profilesRepo'
import { addCaseFile } from './caseFilesRepo'
import type { Note } from '../types/models'

/**
 * 备份全量回归（铁律 6）：v2 包裹必须带上后来新增的五张表
 * （goals/snapshots/blocks/profiles/caseFiles）——漏一张，用户备份恢复就丢一类数据。
 */

beforeEach(async () => {
  await db.clearAll()
})

describe('buildBackupBundle + importBundle（v2 全表回路）', () => {
  it('五张表导出→清库→导入→全数回来', async () => {
    const goal = await createGoal({ title: '本季度签 3 个客户' })
    await saveProfile({ name: '张三 · XX银行信贷岗', kind: '简历辅导', clientName: '张三' })
    const profile = (await db.profiles.toArray())[0]!
    await saveBlock({ title: '销售周数据', content: '新增线索: 23', profileId: profile.id })
    await addCaseFile({ caseId: profile.id, name: '简历 v1', kind: 'resume', text: '五年销售经验……' })
    await db.snapshots.put({
      id: 'snap_2026-09-11', day: '2026-09-11', closureRate: 80, closedCount: 4,
      openCount: 1, overdueCount: 0, goalsActive: 1, insightsCount: 2, notesCount: 12, createdAt: '2026-09-11T10:00:00.000Z',
    })

    const bundle = await buildBackupBundle()
    expect(bundle.version).toBe(2)
    for (const key of ['goals', 'snapshots', 'blocks', 'profiles', 'caseFiles'] as const) {
      expect(bundle.entities[key], `导出缺 ${key}`).toHaveLength(1)
    }

    // 模拟换机恢复：清空全部表后导入备份
    await db.clearAll()
    const r = await importBundle(JSON.stringify(bundle))
    expect(r.format).toBe('pwork-v2')
    expect(r.counts.goals).toBe(1)
    expect(r.counts.snapshots).toBe(1)
    expect(r.counts.blocks).toBe(1)
    expect(r.counts.profiles).toBe(1)
    expect(r.counts.caseFiles).toBe(1)

    expect((await db.goals.toArray()).find((g) => g.id === goal.id)?.title).toBe('本季度签 3 个客户')
    expect((await db.profiles.toArray())[0]?.clientName).toBe('张三')
    const blk = (await db.blocks.toArray())[0]!
    expect(blk.profileId).toBe(profile.id)
    expect((await db.caseFiles.toArray())[0]?.name).toBe('简历 v1')
    expect(await db.snapshots.toArray()).toHaveLength(1)
  })

  it('旧版 v2 备份（无五张表字段）照常导入，不报错', async () => {
    const r = await importBundle(JSON.stringify({ version: 2, exportedAt: '2026-09-01T00:00:00.000Z', entities: { notes: [] } }))
    expect(r.format).toBe('pwork-v2')
    expect(r.counts.notes ?? 0).toBe(0)
  })
})

describe('导入前快照（2026-10-29 安全网热修）', () => {
  const note = (id: string, title: string, updatedAt: string): Note => ({
    id, title, body: '正文', tags: [], links: { itemIds: [], reviewIds: [], taskIds: [] }, source: 'manual',
    createdAt: updatedAt, updatedAt, deletedAt: null, schemaVersion: 1,
  })

  it('存快照 → 可读回时间与内容', async () => {
    await db.notes.put(note('n1', '原始', '2026-10-01T00:00:00.000Z'))
    await savePreImportSnapshot(await buildBackupBundle())
    const snap = await getPreImportSnapshot()
    expect(snap).not.toBeNull()
    expect(typeof snap!.at).toBe('string')
    const entities = (snap!.bundle as { entities: { notes: Note[] } }).entities
    expect(entities.notes).toHaveLength(1)
    expect(entities.notes[0]!.title).toBe('原始')
  })

  it('误导入后恢复：清掉导入进来的记录，回到快照状态', async () => {
    await importBundle(JSON.stringify({ version: 2, entities: { notes: [note('n1', '原始', '2026-10-01T00:00:00.000Z')] } }))
    await savePreImportSnapshot(await buildBackupBundle())
    // 模拟误导入：覆盖原笔记（更晚 updatedAt）+ 多进一条别人的笔记
    await importBundle(JSON.stringify({
      version: 2,
      entities: { notes: [note('n1', '被覆盖', '2026-10-29T00:00:00.000Z'), note('junk1', '误导入', '2026-10-29T00:00:00.000Z')] },
    }))
    expect(await db.notes.count()).toBe(2)
    const r = await restorePreImportSnapshot()
    expect(await db.notes.count()).toBe(1)
    expect((await db.notes.toArray())[0]?.title).toBe('原始')
    expect(r.counts.notes).toBe(1)
  })

  it('没有快照时恢复就地报错（fast-fail）', async () => {
    await expect(restorePreImportSnapshot()).rejects.toThrow('没有可恢复的导入前快照')
  })
})

describe('升级链夹具（0.3g）：0.1.10 真实备份形态 × 当前导入链', () => {
  it('v0.1.10 样本全表导入成功，字段原样入库', async () => {
    const r = await importBundle(fixtureRaw)
    expect(r.format).toBe('pwork-v2')
    expect(r.detail.notes).toMatchObject({ added: 1, updated: 0 })
    expect((await db.notes.toArray())[0]?.title).toBe('夹具：0.1.10 速记')
    expect((await db.items.toArray())[0]?.fingerprint).toBe('fp-fixture-1')
    expect((await db.tasks.toArray())[0]?.due).toBe('2026-11-01')
    expect((await db.reviews.toArray())[0]?.summary).toEqual(['样本复盘'])
    // 重复导入不产生重复（LWW 幂等），对账全部"保留本地"
    const again = await importBundle(fixtureRaw)
    expect(again.detail.notes).toMatchObject({ added: 0, updated: 0, skipped: 1 })
    expect(await db.notes.count()).toBe(1)
  })
})
