import { beforeEach, describe, expect, it } from 'vitest'
import { buildBackupBundle } from '../store/collect'
import { importBundle } from './backup'
import { db } from './schema'
import { createGoal } from './goalsRepo'
import { saveBlock } from './blocksRepo'
import { saveProfile } from './profilesRepo'
import { addCaseFile } from './caseFilesRepo'

/**
 * 备份全量回归（铁律 6）：v2 包裹必须带上后来新增的五张表
 * （goals/snapshots/blocks/profiles/caseFiles）——漏一张，用户备份恢复就丢一类数据。
 */

beforeEach(async () => {
  await Promise.all(
    db.tables.map((t) => t.clear()),
  )
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
    await Promise.all(db.tables.map((t) => t.clear()))
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
