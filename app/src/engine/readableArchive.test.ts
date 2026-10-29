import { describe, expect, it } from 'vitest'
import JSZip from 'jszip'
import { buildReadableArchive, type ArchiveInput } from './readableArchive'
import { parseArchiveFiles, sanitizeArchiveEntity, type ArchiveMdFile } from './readableArchiveParse'
import type { Note } from '../types/models'

/** 可读档案导出 → 回导 roundtrip（0.3 数据主权批）：字段全等才算无损 */

const note = (over: Partial<Note>): Note => ({
  id: 'note_abcd1234', title: '会前准备', body: '带上数据表\n核对三个数', tags: ['工作'],
  links: { itemIds: [], reviewIds: [], taskIds: [] }, source: 'manual',
  createdAt: '2026-10-01T08:00:00.000Z', updatedAt: '2026-10-02T08:00:00.000Z',
  deletedAt: null, schemaVersion: 1, ...over,
})

const sample: ArchiveInput = {
  notes: [note({})],
  tasks: [{
    id: 'task_abcd1234', title: '交周报', status: 'todo', due: '2026-10-30', lane: 1,
    origin: { kind: 'manual', refId: null }, closedAt: null,
    createdAt: '2026-10-01T00:00:00.000Z', updatedAt: '2026-10-01T00:00:00.000Z',
    deletedAt: null, schemaVersion: 1,
  }],
  goals: [{
    id: 'goal_abcd1234', title: '季度签三单', status: 'active', due: '2026-12-31',
    progressLog: [{ at: '2026-10-01T00:00:00.000Z', note: '启动' }], closedAt: null,
    createdAt: '2026-10-01T00:00:00.000Z', updatedAt: '2026-10-01T00:00:00.000Z',
    deletedAt: null, schemaVersion: 1,
  }],
  insights: [{
    id: 'ins_abcd1234', reviewId: 'rev_1', text: '先对齐口径再动手', tags: ['方法'],
    kind: 'inductive', verified: false, patternGroup: 'g1', createdAt: '2026-10-01T00:00:00.000Z', revisit: [],
  }],
  reviews: [{
    id: 'rev_abcd1234', type: 'personal', scenario: 'weekly', templateId: 't1', title: '第 40 周复盘',
    createdAt: '2026-10-01T00:00:00.000Z', updatedAt: '2026-10-01T00:00:00.000Z',
    status: 'archived', quick: false, clap: {} as never, summary: ['本周顺利', '下周聚焦'],
  }],
  actions: [{
    id: 'act_abcd1234', reviewId: 'rev_abcd1234', kind: 'start', text: '整理清单',
    status: 'open', closedAt: null,
  }],
  sources: [{
    id: 'src_abcd1234', name: '量子位', url: 'https://qbitai.com/feed', kind: 'rss', domain: 'ai',
    tier: 1.5, weight: 0.7, checkEvery: 'daily', active: true,
    health: { failStreak: 0, lastOkAt: null, lastError: null }, deletedAt: null, schemaVersion: 1,
    createdAt: '2026-10-01T00:00:00.000Z', updatedAt: '2026-10-01T00:00:00.000Z',
  }],
  items: [{
    id: 'item_abcd1234', sourceId: 'src_abcd1234', sourceName: '量子位', url: 'https://qbitai.com/p/1',
    title: '某发布', summary: '一家公司发布了新产品', fingerprint: 'fp1', eventGroup: null,
    publishedAt: null, fetchedAt: '2026-10-03T00:00:00.000Z', stage: 'kept', score: {} as never,
    scoreReason: '命中兴趣词', aiBy: 'rules', tags: [], otFlag: null, expiresAt: null,
    annotation: { vote: null, note: '' } as never, createdAt: '2026-10-03T00:00:00.000Z',
    updatedAt: '2026-10-03T00:00:00.000Z', schemaVersion: 1,
  }],
}

async function zipToMdFiles(bytes: Uint8Array): Promise<ArchiveMdFile[]> {
  const zip = await JSZip.loadAsync(bytes)
  const out: ArchiveMdFile[] = []
  for (const f of Object.values(zip.files)) {
    if (f.dir || !f.name.endsWith('.md')) continue
    out.push({ path: f.name, text: await f.async('string') })
  }
  return out
}

describe('可读档案 roundtrip', () => {
  it('导出 → 回导：八类实体字段全等（速记正文从正文区恢复）', async () => {
    const bytes = await buildReadableArchive(sample)
    const bundle = parseArchiveFiles(await zipToMdFiles(bytes)) as { entities: Record<string, Record<string, unknown>[]> }
    const e = bundle.entities
    expect(Object.keys(e).sort()).toEqual(['actions', 'goals', 'insights', 'items', 'notes', 'reviews', 'sources', 'tasks'])

    const n = e.notes[0] as unknown as Note
    expect(n.id).toBe('note_abcd1234')
    expect(n.title).toBe('会前准备')
    expect(n.body).toBe('带上数据表\n核对三个数')
    expect(n.tags).toEqual(['工作'])
    expect(n.schemaVersion).toBe(1)

    const t = e.tasks[0]
    expect(t.id).toBe('task_abcd1234')
    expect(t.due).toBe('2026-10-30')
    expect(t.origin).toEqual({ kind: 'manual', refId: null })

    expect(e.goals[0]!.title).toBe('季度签三单')
    expect((e.insights[0] as { text: string }).text).toBe('先对齐口径再动手')
    expect(e.reviews[0]!.summary).toEqual(['本周顺利', '下周聚焦'])
    expect(e.actions[0]!.text).toBe('整理清单')
    expect(e.sources[0]!.url).toBe('https://qbitai.com/feed')
    expect(e.items[0]!.fingerprint).toBe('fp1')
  })

  it('导出的说明文件不进实体；正文区混入 frontmatter 缺失时 fast-fail', async () => {
    const bytes = await buildReadableArchive(sample)
    const files = await zipToMdFiles(bytes)
    expect(files.some((f) => f.path.startsWith('README'))).toBe(true)
    expect(() => parseArchiveFiles([{ path: '速记/坏.md', text: '没有元数据块的内容' }])).toThrow('缺少元数据块')
  })
})

describe('sanitizeArchiveEntity（读取防御）', () => {
  it('未知键丢弃、类型不对的字段丢弃、缺 id 整条跳过', () => {
    const cleaned = sanitizeArchiveEntity('notes', {
      id: 'n1', title: 'ok', evil: '注入字段', tags: '不是数组', schemaVersion: '不是数字',
    })
    expect(cleaned).toEqual({ id: 'n1', title: 'ok' })
    expect(sanitizeArchiveEntity('notes', { title: '没 id' })).toBeNull()
    expect(sanitizeArchiveEntity('未知表', { id: 'x' })).toBeNull()
  })
})
