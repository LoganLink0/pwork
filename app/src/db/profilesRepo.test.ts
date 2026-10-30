import { beforeEach, describe, expect, it } from 'vitest'
import { listProfiles, saveProfile, softDeleteProfile, toggleProfileDeliverable } from './profilesRepo'
import { listBlocks, saveBlock } from './blocksRepo'
import { addCaseFile, listCaseFiles } from './caseFilesRepo'
import { db } from './schema'

/** 对象/案例数据层：保存/列表/软删除，以及删除时对数据块与案例文件的连带处理 */

beforeEach(async () => {
  await db.profiles.clear()
  await db.blocks.clear()
  await db.caseFiles.clear()
})

describe('profilesRepo', () => {
  it('保存→列表（按更新时间倒序）→更新保留未传字段', async () => {
    const p1 = await saveProfile({ name: '张三 · XX银行信贷岗', kind: '简历辅导', clientName: '张三', targetRole: '信贷岗' })
    // 两条记录的更新时间隔开（同毫秒保存的先后顺序是不确定的，倒序断言需要可比较的时间戳）
    await new Promise((r) => setTimeout(r, 2))
    await saveProfile({ name: 'YY 科技售前', kind: '售前调研' })
    expect((await listProfiles()).map((p) => p.name)).toEqual(['YY 科技售前', '张三 · XX银行信贷岗'])

    await saveProfile({ id: p1.id, name: p1.name, status: '已交付' })
    const updated = (await listProfiles()).find((p) => p.id === p1.id)
    expect(updated?.status).toBe('已交付')
    expect(updated?.clientName).toBe('张三')
    expect(updated?.targetRole).toBe('信贷岗')
  })

  it('更新保留未传字段；交付物清单可整体替换', async () => {
    const p1 = await saveProfile({ name: '王五 · 运营岗', kind: '简历辅导', deliverables: ['resume-final'] })
    // 未传 deliverables → 保留
    await saveProfile({ id: p1.id, name: p1.name, status: '已交付' })
    expect((await listProfiles()).find((p) => p.id === p1.id)?.deliverables).toEqual(['resume-final'])
    // 传新清单 → 整体替换
    await saveProfile({ id: p1.id, name: p1.name, deliverables: ['resume-final', 'diagnosis'] })
    expect((await listProfiles()).find((p) => p.id === p1.id)?.deliverables).toEqual(['resume-final', 'diagnosis'])
  })

  it('交付物勾选事务化：同一批次连点 3 件全部落库（复盘 1.1 竞态回归）', async () => {
    const p = await saveProfile({ name: '连点案例', kind: '简历辅导' })
    await Promise.all([toggleProfileDeliverable(p.id, 'resume-final'), toggleProfileDeliverable(p.id, 'diagnosis'), toggleProfileDeliverable(p.id, 'star')])
    expect((await listProfiles()).find((x) => x.id === p.id)?.deliverables?.sort()).toEqual(['diagnosis', 'resume-final', 'star'])
    // 再勾一次同名件 → 取消
    await toggleProfileDeliverable(p.id, 'resume-final')
    expect((await listProfiles()).find((x) => x.id === p.id)?.deliverables?.sort()).toEqual(['diagnosis', 'star'])
  })

  it('软删除案例：数据块回到未归类、案例文件一并软删除（备份可找回）', async () => {
    const p = await saveProfile({ name: '李四 · 大客户经理', kind: '简历辅导' })
    const other = await saveProfile({ name: '无关对象' })
    const blk = await saveBlock({ title: '自检包', content: '业绩: 120%', profileId: p.id })
    await saveBlock({ title: '别人的材料', content: 'x', profileId: other.id })
    await addCaseFile({ caseId: p.id, name: '简历 v1', kind: 'resume', text: '……' })
    await addCaseFile({ caseId: p.id, name: '岗位解码表', kind: 'doc', text: '……' })
    await addCaseFile({ caseId: other.id, name: '别人的文件', kind: 'other', text: 'x' })

    await softDeleteProfile(p.id)

    expect((await listProfiles()).map((x) => x.name)).toEqual(['无关对象'])
    const blocks = await listBlocks()
    expect(blocks.find((b) => b.id === blk.id)?.profileId).toBeUndefined()
    expect(blocks.find((b) => b.title === '别人的材料')?.profileId).toBe(other.id)
    expect(await listCaseFiles(p.id)).toHaveLength(0)
    expect(await listCaseFiles(other.id)).toHaveLength(1)
    // 软删除：行仍在表里，只是打了 deletedAt
    const rawFiles = await db.caseFiles.where('caseId').equals(p.id).toArray()
    expect(rawFiles).toHaveLength(2)
    expect(rawFiles.every((f) => f.deletedAt)).toBe(true)

    // 重复删除是幂等的
    await softDeleteProfile(p.id)
    expect(await listProfiles()).toHaveLength(1)
  })
})
