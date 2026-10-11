import { beforeEach, describe, expect, it } from 'vitest'
import { buildBackupBundle } from '../store/collect'
import { importBundle } from './backup'
import { db } from './schema'
import { newId, createNote } from './repo'
import { createSource } from './collect'
import { putItem } from './collect'
import { createGoal } from './goalsRepo'
import { saveBlock } from './blocksRepo'
import { saveProfile } from './profilesRepo'
import { addCaseFile } from './caseFilesRepo'
import type { ActionItem, InsightRecord, ReviewRecord } from '../modules/review/types/models'
import type { Item } from '../types/models'

/**
 * 备份恢复演练（2026-10-11 发布前收口）：全部 12 张业务表
 * 种子 → 导出 → 清空（模拟换机/丢库）→ 导入 → 逐表核对。
 * 这是"数据安全网"的核心承诺，用测试固化，任何表漏进包裹当场红。
 */

const NOW = '2026-10-11T10:00:00.000Z'

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()))
})

describe('备份恢复演练：12 张表全量回路', () => {
  it('种子→导出→清库→导入→逐表全数回来（含 ID 与关联）', async () => {
    // ---- 种子：每张表一条，带可核对的字段 ----
    await createNote({ body: '备份回路验证', tags: ['演练'] })
    const source = await createSource({ name: '演练源', url: 'https://drill.example/rss', domain: 'ai', tier: 1 })
    const item: Item = {
      id: newId('item'),
      sourceId: source.id,
      sourceName: '演练源',
      url: 'https://drill.example/1',
      title: '演练条目：AI 工具实践',
      summary: 's',
      fingerprint: newId('fp'),
      eventGroup: null,
      publishedAt: null,
      fetchedAt: NOW,
      stage: 'kept',
      score: { total: 88, source: 1, novelty: 1, relevance: 1, utility: 0.7 },
      scoreReason: '演练',
      aiBy: 'rules',
      tags: ['AI 应用'],
      otFlag: null,
      expiresAt: null,
      annotation: { notes: '打过批注', stars: 5, keepForever: false, linkedReviewId: null },
      createdAt: NOW,
      updatedAt: NOW,
      schemaVersion: 1,
    }
    await putItem(item)

    const review: ReviewRecord = {
      id: newId('rev'),
      scenario: 'personal-daily',
      type: 'personal',
      title: '演练复盘',
      status: 'archived',
      facts: [],
      scores: {},
      outputs: {},
      noteIds: [],
      createdAt: NOW,
      updatedAt: NOW,
      deletedAt: null,
      schemaVersion: 1,
    } as unknown as ReviewRecord
    await db.reviews.put(review)

    const action: ActionItem = {
      id: newId('act'),
      reviewId: review.id,
      kind: 'start',
      text: '演练行动项',
      status: 'open',
      closedAt: null,
    }
    await db.actions.put(action)

    const insight: InsightRecord = {
      id: newId('ins'),
      reviewId: review.id,
      content: '演练洞察：备份是安全网',
      verified: false,
      patternGroup: null,
      revisitAt: null,
      createdAt: NOW,
      updatedAt: NOW,
      deletedAt: null,
      schemaVersion: 1,
    } as unknown as InsightRecord
    await db.insights.put(insight)

    const task = await db.tasks.put({
      id: newId('task'),
      title: '演练任务',
      lane: 1,
      status: 'todo',
      origin: { kind: 'review', refId: action.id },
      closedAt: null,
      createdAt: NOW,
      updatedAt: NOW,
      deletedAt: null,
      schemaVersion: 1,
    }).then(() => undefined)
    void task

    const goal = await createGoal({ title: '演练目标' })
    await db.snapshots.put({
      id: 'snap_drill', day: '2026-10-11', closureRate: 50, closedCount: 1,
      openCount: 1, overdueCount: 0, goalsActive: 1, insightsCount: 1, notesCount: 1, createdAt: NOW,
    })
    const profile = await saveProfile({ name: '李四 · 演练档案', kind: '简历辅导', clientName: '李四' })
    await saveBlock({ title: '演练数据块', content: 'x', profileId: profile.id })
    await addCaseFile({ caseId: profile.id, name: '演练简历', kind: 'resume', text: '内容' })

    // ---- 导出 ----
    const bundle = await buildBackupBundle()
    const text = JSON.stringify(bundle)
    for (const key of ['notes', 'sources', 'items', 'reviews', 'actions', 'insights', 'tasks', 'goals', 'snapshots', 'blocks', 'profiles', 'caseFiles'] as const) {
      expect((bundle.entities[key] ?? []).length, `导出缺表 ${key}`).toBeGreaterThanOrEqual(1)
    }

    // ---- 模拟丢库：清空全部 ----
    await Promise.all(db.tables.map((t) => t.clear()))
    expect(await db.notes.count()).toBe(0)

    // ---- 恢复 ----
    const r = await importBundle(text)
    expect(r.format).toBe('pwork-v2')

    // ---- 逐表核对：数量 + 关键字段 + 关联 ----
    const n = (await db.notes.toArray())[0]!
    expect(n.body).toBe('备份回路验证')
    expect(n.tags).toEqual(['演练'])

    const s = (await db.sources.toArray()).find((x) => x.id === source.id)!
    expect(s.name).toBe('演练源')

    const it2 = (await db.items.toArray()).find((x) => x.id === item.id)!
    expect(it2.annotation.stars).toBe(5) // 用户批注/星级必须随备份走（标注/知识层）
    expect(it2.sourceId).toBe(source.id)

    const rv = await db.reviews.get(review.id)
    expect(rv?.title).toBe('演练复盘')

    const ac = await db.actions.get(action.id)
    expect(ac?.text).toBe('演练行动项')
    expect(ac?.reviewId).toBe(review.id)

    expect(await db.insights.count()).toBe(1)

    const tk = (await db.tasks.toArray())[0]!
    expect(tk.origin?.refId).toBe(action.id) // 跨模块 ID 引用在恢复后仍成立（SSOT）

    expect((await db.goals.toArray()).find((g) => g.id === goal.id)?.title).toBe('演练目标')
    expect(await db.snapshots.count()).toBe(1)

    const pf = (await db.profiles.toArray())[0]!
    expect(pf.clientName).toBe('李四')
    expect((await db.blocks.toArray())[0]?.profileId).toBe(pf.id)
    expect((await db.caseFiles.toArray())[0]?.name).toBe('演练简历')
  })

  it('合并语义：恢复时同名 ID 以 updatedAt 新者为准（不回滚新数据）', async () => {
    const a = await createNote({ body: '旧内容' })
    const bundle = await buildBackupBundle()

    // 恢复前，本地已有同 ID 的更新版本（updatedAt 更新）
    await new Promise((r) => setTimeout(r, 10))
    await db.notes.put({ ...a, body: '新内容', updatedAt: new Date().toISOString() })
    await importBundle(JSON.stringify(bundle))
    const after = (await db.notes.toArray())[0]!
    expect(after.body).toBe('新内容') // 备份里的旧版没有覆盖本地新版
  })
})
