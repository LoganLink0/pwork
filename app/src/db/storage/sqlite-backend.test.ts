import { beforeEach, describe, expect, it, vi } from 'vitest'

const { invokeMock } = vi.hoisted(() => ({ invokeMock: vi.fn() }))

vi.mock('@tauri-apps/api/core', () => ({ invoke: invokeMock }))
vi.mock('./mirror', () => ({ markMirrorDirty: vi.fn() }))

import { createSqliteBackend } from './sqlite-backend'

/**
 * WhereClause.delete 契约（2026-11-22 实锤）：必须生成 DELETE 语句走 execute 通道——
 * 曾误用 sqlOf('') 的 SELECT 走 execute，rusqlite 报「Execute returned results」，
 * aiCache 例行清理每次都失败并弹错误条。
 */

beforeEach(() => {
  invokeMock.mockReset()
  invokeMock.mockImplementation(async (cmd: string) => {
    if (cmd === 'db_open') return { fresh: true, incompleteMigration: false, path: 'x' }
    if (cmd === 'db_columns')
      return { columns: { aiCache: ['id', 'createdAt', 'purpose', 'output', 'model'] }, keyFields: { aiCache: 'id' } }
    if (cmd === 'db_exec') return 1
    if (cmd === 'db_select') return []
    return null
  })
})

describe('sqlite-backend WhereClause.delete', () => {
  it('生成 DELETE 语句（而非 SELECT）并带绑定参数', async () => {
    const backend = await createSqliteBackend()
    const table = backend.table<{ id: string }>('aiCache')
    await table.where('createdAt').below('2026-11-15T00:00:00.000Z').delete()
    const execCall = invokeMock.mock.calls.find(([cmd]) => cmd === 'db_exec')
    expect(execCall).toBeDefined()
    const sql = (execCall![1] as { sql: string }).sql
    expect(sql.startsWith('DELETE FROM "aiCache" WHERE "createdAt" < ?1')).toBe(true)
    expect(sql).not.toContain('SELECT')
  })

  it('above/equals 同样生成对应比较符的 DELETE', async () => {
    const backend = await createSqliteBackend()
    const table = backend.table<{ id: string }>('aiCache')
    await table.where('purpose').equals('item-aisummary').delete()
    const execCall = invokeMock.mock.calls.find(([cmd]) => cmd === 'db_exec')
    const sql = (execCall![1] as { sql: string }).sql
    expect(sql).toBe('DELETE FROM "aiCache" WHERE "purpose" = ?1')
  })
})
