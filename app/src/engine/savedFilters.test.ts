import { beforeEach, describe, expect, it } from 'vitest'
import { listSavedFilters, saveSavedFilter, deleteSavedFilter, describeFilterState } from './savedFilters'
import { db } from '../db/schema'

/** 保存的过滤器（1.2 批）：往返 / 同名覆盖 / 白名单清洗 / 坏数据回落空态 / 上限轮换 */

beforeEach(async () => {
  await db.clearAll()
})

const STATE = { stage: 'must', query: '周刊', otOnly: true } as const

describe('保存的过滤器', () => {
  it('保存 → 读回 → 删除 → 为空（全往返）', async () => {
    const f = await saveSavedFilter('AI 周刊必看', STATE)
    expect(f.id).toBeTruthy()
    const list = await listSavedFilters()
    expect(list).toHaveLength(1)
    expect(list[0]).toMatchObject({ name: 'AI 周刊必看', scope: 'items', version: 1, state: STATE })
    await deleteSavedFilter(f.id)
    expect(await listSavedFilters()).toHaveLength(0)
  })

  it('同名覆盖不堆积', async () => {
    await saveSavedFilter('同名', { stage: 'all', query: '', otOnly: false })
    await saveSavedFilter('同名', STATE)
    const list = await listSavedFilters()
    expect(list).toHaveLength(1)
    expect(list[0].state).toEqual(STATE)
  })

  it('保存侧状态白名单：非法 stage 回 all、类型防御清洗（布尔严格判定不猜测）', async () => {
    const f = await saveSavedFilter('脏状态', { stage: 'must', query: 42 as unknown as string, otOnly: 'yes' as unknown as boolean })
    expect(f.state).toEqual({ stage: 'must', query: '', otOnly: false })
  })

  it('坏 kv 数据回落空态不崩（手改存储场景）', async () => {
    await db.kv.put({ key: 'pwork-saved-filters', value: { hello: 'world' } })
    expect(await listSavedFilters()).toEqual([])
    // version 不符 → 整体丢弃（不猜旧结构）
    await db.kv.put({
      key: 'pwork-saved-filters',
      value: { version: 2, list: [{ id: 'x', name: '旧版本过滤器', scope: 'items', version: 1, state: {} }] },
    })
    expect(await listSavedFilters()).toEqual([])
    // 单条坏数据逐条剔除，好条目保留
    await db.kv.put({
      key: 'pwork-saved-filters',
      value: {
        version: 1,
        list: [null, 42, { id: '', name: '无 id' }, { id: 'ok1', name: '  有效  ', scope: 'items', version: 1, state: { stage: 'kept', query: '  ', otOnly: false } }],
      },
    })
    const list = await listSavedFilters()
    expect(list).toHaveLength(1)
    expect(list[0].name).toBe('有效')
    expect(list[0].state.stage).toBe('kept')
    expect(list[0].state.query).toBe('  ')  // 查询词保留原样（套用后与保存时状态完全一致）
  })

  it('空白名 fast-fail', async () => {
    await expect(saveSavedFilter('   ', STATE)).rejects.toThrow('先给这个筛选起个名字')
  })

  it('上限 20：超出丢最旧的', async () => {
    for (let i = 0; i < 22; i++) await saveSavedFilter(`筛选${String(i).padStart(2, '0')}`, { stage: 'all', query: '', otOnly: false })
    const list = await listSavedFilters()
    expect(list).toHaveLength(20)
    expect(list[0]?.name).toBe('筛选02')
    expect(list[19]?.name).toBe('筛选21')
  })

  it('describeFilterState 出人话', () => {
    expect(describeFilterState({ stage: 'all', query: '', otOnly: false })).toBe('全部条目')
    expect(describeFilterState(STATE)).toBe('必看 · 机会/威胁/趋势 · 搜索「周刊」')
  })
})
