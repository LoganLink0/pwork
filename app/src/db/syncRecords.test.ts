import { beforeEach, describe, expect, it } from 'vitest'
import { deviceId, loadSyncConfig, pickChanged, recordAt, rowsToEntities, saveSyncConfig, upsertBatches, type SyncRow } from './syncRecords'

beforeEach(() => localStorage.clear())

describe('记录级设备同步（2026-10-19 替换镜像档 1）', () => {
  it('pickChanged：只挑水位之后变更的；items 只认 curated 未软删；payload 序列化完整', () => {
    const tables = [
      {
        key: 'notes',
        rows: [
          { id: 'n1', updatedAt: '2026-10-19T01:00:00Z' }, // 水位之后 → 推
          { id: 'n2', updatedAt: '2026-10-18T01:00:00Z' }, // 水位之前 → 跳
          { id: 'n3' }, // 无时间 → 跳（无法判增量）
        ],
      },
      {
        key: 'items',
        rows: [
          { id: 'i1', updatedAt: '2026-10-19T02:00:00Z', stage: 'scored' }, // 推
          { id: 'i2', updatedAt: '2026-10-19T02:00:00Z', stage: 'raw' }, // 非 curated → 跳
          { id: 'i3', updatedAt: '2026-10-19T02:00:00Z', stage: 'kept', deletedAt: 'x' }, // 软删 → 跳
        ],
      },
    ]
    const rows = pickChanged(tables as never, '2026-10-18T12:00:00Z', 'dev-a')
    expect(rows.map((r) => r.id)).toEqual(['n1', 'i1'])
    expect(rows[0]).toMatchObject({ entity: 'notes', id: 'n1', device: 'dev-a' })
    expect(JSON.parse(rows[0]!.payload)).toEqual({ id: 'n1', updatedAt: '2026-10-19T01:00:00Z' })
  })

  it('软删除的普通实体照常同步（deletedAt 有值但 updatedAt 更新 → 传播删除）', () => {
    const rows = pickChanged([{ key: 'tasks', rows: [{ id: 't1', updatedAt: '2026-10-19T03:00:00Z', deletedAt: '2026-10-19T03:00:00Z' }] }], '', 'dev-a')
    expect(rows).toHaveLength(1) // items 之外的实体软删是有效状态，要传到其他设备
  })

  it('upsertBatches：10 行一批、参数展平、占位符数量一致', () => {
    const rows: SyncRow[] = Array.from({ length: 25 }, (_, i) => ({
      entity: 'notes',
      id: `n${i}`,
      updated_at: `2026-10-19T0${i % 10}:00:00Z`,
      device: 'd',
      payload: '{}',
    }))
    const batches = upsertBatches(rows)
    expect(batches).toHaveLength(3)
    expect(batches[0]!.params).toHaveLength(50)
    expect(batches[0]!.sql.match(/\(\?,\?,\?,\?,\?\)/g)).toHaveLength(10)
    expect(batches[2]!.params).toHaveLength(25)
  })

  it('rowsToEntities：按实体分组；collectConfig 单列不吃备份的无条件覆盖', () => {
    const { entities, configPayload } = rowsToEntities([
      { entity: 'notes', payload: '{"id":"n1"}' },
      { entity: 'notes', payload: '{"id":"n2"}' },
      { entity: 'tasks', payload: '{"id":"t1"}' },
      { entity: 'collectConfig', payload: '{"interests":["AI"]}' },
    ])
    expect(entities.notes).toHaveLength(2)
    expect(entities.tasks).toHaveLength(1)
    expect(entities.collectConfig).toBeUndefined()
    expect(configPayload).toEqual({ interests: ['AI'] })
  })

  it('recordAt：updatedAt 优先、createdAt 兜底（snapshots 无 updatedAt）', () => {
    expect(recordAt({ updatedAt: 'a', createdAt: 'b' })).toBe('a')
    expect(recordAt({ createdAt: 'b' })).toBe('b')
    expect(recordAt({})).toBe('')
  })

  it('配置与设备标识：存取回落、设备 id 生成后稳定', () => {
    expect(loadSyncConfig()).toEqual({ enabled: false, lastSyncAt: null, lastPushed: 0, lastPulled: 0 })
    saveSyncConfig({ enabled: true, lastSyncAt: 'x', lastPushed: 3, lastPulled: 5 })
    expect(loadSyncConfig().enabled).toBe(true)
    const d1 = deviceId()
    expect(deviceId()).toBe(d1)
    expect(d1).toMatch(/^dev-/)
  })
})

describe('删除墓碑（安全审计 2026-10-26 B5）', () => {
  it('registerTombstones / tombstonesSince / pruneTombstones：登记、水位筛选、过期裁剪', async () => {
    const { registerTombstones, tombstonesSince, pruneTombstones, loadTombstones } = await import('./tombstones')
    registerTombstones('notes', [{ id: 'n1', deletedAt: '2026-01-01T00:00:00Z' }, { id: 'n2', deletedAt: '2026-02-01T00:00:00Z' }], new Date('2026-03-01T00:00:00Z'))
    // 墓碑时间取 deletedAt 优先（与软删时推送的墓碑行版本一致，避免重复推）
    const all = loadTombstones()
    expect(all.find((t) => t.id === 'n1')!.at).toBe('2026-01-01T00:00:00Z')
    expect(all.find((t) => t.id === 'n2')!.at).toBe('2026-02-01T00:00:00Z')
    expect(tombstonesSince('2026-01-15T00:00:00Z').map((t) => t.id)).toEqual(['n2'])
    expect(tombstonesSince('2026-03-01T00:00:00Z')).toHaveLength(0)
    // 90 天窗口外裁剪
    pruneTombstones(new Date('2026-05-01T00:00:00Z'))
    expect(loadTombstones().map((t) => t.id)).toEqual(['n2'])
  })

  it('isTombstonePayload：三键专用形态是墓碑；真实记录与配置不是', async () => {
    const { isTombstonePayload } = await import('./syncRecords')
    expect(isTombstonePayload('notes', { id: 'n1', deletedAt: 't', updatedAt: 't' })).toBe(true)
    expect(isTombstonePayload('notes', { id: 'n1', deletedAt: 't', updatedAt: 't', body: '正文' })).toBe(false)
    expect(isTombstonePayload('collectConfig', { id: 'x', deletedAt: 't', updatedAt: 't' })).toBe(false)
    expect(isTombstonePayload('notes', null)).toBe(false)
  })
})
