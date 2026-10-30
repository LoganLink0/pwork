import { beforeEach, describe, expect, it } from 'vitest'
import { listBlocks, saveBlock, softDeleteBlock } from './blocksRepo'
import { db } from './schema'

/** 外部数据块数据层：保存/列表/软删除回路 */

beforeEach(async () => {
  await db.blocks.clear()
})

describe('blocksRepo', () => {
  it('保存→列表→更新→软删除 全回路', async () => {
    const b1 = await saveBlock({ title: '销售周数据', content: '新增线索: 23' })
    // 两条记录的更新时间隔开（同毫秒保存的先后顺序是不确定的，倒序断言需要可比较的时间戳）
    await new Promise((r) => setTimeout(r, 2))
    await saveBlock({ title: '客服工单', content: '本周闭环: 41' })
    expect((await listBlocks()).map((x) => x.title)).toEqual(['客服工单', '销售周数据']) // 按更新时间倒序

    await saveBlock({ id: b1.id, title: '销售周数据', content: '新增线索: 27\n成交金额: 86万' })
    const updated = (await listBlocks()).find((x) => x.id === b1.id)
    expect(updated?.content).toContain('27')
    expect(await listBlocks()).toHaveLength(2)

    await softDeleteBlock(b1.id)
    const after = await listBlocks()
    expect(after.map((x) => x.title)).toEqual(['客服工单'])
  })

  it('标题去空白并限 40 字；空标题兜底', async () => {
    const b = await saveBlock({ title: '  ' + '长'.repeat(50) + '  ', content: 'x' })
    expect(b.title).toBe('长'.repeat(40))
    const b2 = await saveBlock({ title: '', content: 'x' })
    expect(b2.title).toBe('未命名数据块')
  })
})
