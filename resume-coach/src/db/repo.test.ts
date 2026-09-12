import { beforeEach, describe, expect, it } from 'vitest'
import { addCaseFile, getCase, listCases, listCaseFiles, saveCase, softDeleteCase, toggleCaseDeliverable } from './repo'
import { db } from './schema'

/** 案例数据层：保存/列表/软删除/交付勾选事务化 */

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()))
})

describe('casesRepo', () => {
  it('创建→列表（按更新倒序）→更新字段不互相覆盖', async () => {
    const c1 = await saveCase({ name: '张三 · XX银行信贷岗', kind: '简历辅导', clientName: '张三', targetRole: '信贷岗' })
    await saveCase({ name: 'YY 科技售前', kind: '售前调研' })
    expect((await listCases()).map((c) => c.name)).toEqual(['YY 科技售前', '张三 · XX银行信贷岗'])

    await saveCase({ id: c1.id, name: c1.name, status: '已交付' })
    const updated = (await listCases()).find((c) => c.id === c1.id)
    expect(updated?.status).toBe('已交付')
    expect(updated?.clientName).toBe('张三')
    expect(updated?.targetRole).toBe('信贷岗')
  })

  it('不存在的案例更新会报错（不静默）', async () => {
    await expect(saveCase({ id: 'case_nope', name: 'x' })).rejects.toThrow('案例不存在')
  })

  it('交付物勾选事务化：同一批次连点全部落库', async () => {
    const c = await saveCase({ name: '连点案例' })
    await Promise.all([toggleCaseDeliverable(c.id, 'resume-final'), toggleCaseDeliverable(c.id, 'diagnosis'), toggleCaseDeliverable(c.id, 'star')])
    expect((await getCase(c.id))?.deliverables?.sort()).toEqual(['diagnosis', 'resume-final', 'star'])
    await toggleCaseDeliverable(c.id, 'resume-final')
    expect((await getCase(c.id))?.deliverables?.sort()).toEqual(['diagnosis', 'star'])
  })

  it('软删除案例：案例文件一并软删除（可找回）', async () => {
    const c = await saveCase({ name: '待删除案例' })
    const other = await saveCase({ name: '无关案例' })
    await addCaseFile({ caseId: c.id, name: '简历 v1', kind: 'resume', text: '……' })
    await addCaseFile({ caseId: other.id, name: '别人的文件', kind: 'other', text: 'x' })

    await softDeleteCase(c.id)
    expect((await listCases()).map((x) => x.name)).toEqual(['无关案例'])
    expect(await listCaseFiles(c.id)).toHaveLength(0)
    expect(await listCaseFiles(other.id)).toHaveLength(1)
  })
})
