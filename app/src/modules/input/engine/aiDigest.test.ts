import { beforeEach, describe, expect, it, vi } from 'vitest'

const { chatCompletionCached } = vi.hoisted(() => ({
  chatCompletionCached: vi.fn(),
}))

vi.mock('../../../engine/aiCached', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../engine/aiCached')>()
  return { ...actual, chatCompletionCached }
})
vi.mock('../../../engine/platform', () => ({ isDesktopApp: () => false }))
vi.mock('../../review/engine/coach', () => ({ loadCoachConfig: vi.fn() }))

import { summarizeDailyBackfill, summarizeItem } from './aiDigest'
import { db } from '../../../db/schema'
import { loadCoachConfig } from '../../review/engine/coach'
import type { Item } from '../../../types/models'

const mkItem = (i: number, over: Partial<Item> = {}): Item => ({
  id: 'note-mig-' + String(i).padStart(4, '0'),
  sourceId: 'src-test',
  sourceName: '科技日报',
  url: 'https://a.com/note-mig-' + String(i).padStart(4, '0'),
  title: '迁移验证 ' + i,
  content: '某公司今日发布新一代芯片，性能提升三倍，功耗下降一半，下季度量产。',
  summary: '某公司发布新芯片',
  fingerprint: 'fp-note-mig-' + String(i).padStart(4, '0'),
  eventGroup: null,
  publishedAt: null,
  fetchedAt: '2026-11-13T08:00:00.000Z',
  stage: 'kept',
  score: { total: 70, source: 1, novelty: 1, relevance: 0.5, utility: 0.3 },
  scoreReason: '源1.0·新信息',
  aiBy: 'rules',
  tags: [],
  otFlag: null,
  expiresAt: null,
  annotation: { notes: '', vote: null, keepForever: false, linkedReviewId: null },
  createdAt: '2026-11-13T08:00:00.000Z',
  updatedAt: '2026-11-13T08:00:00.000Z',
  schemaVersion: 1,
  ...over,
})

beforeEach(async () => {
  vi.clearAllMocks()
  vi.mocked(loadCoachConfig).mockReturnValue({ mode: 'llm', apiKey: 'k', model: 'm', baseURL: 'https://x' } as never)
  chatCompletionCached.mockResolvedValue({ text: '某公司发布高性能低功耗新芯片，下季度量产。', cached: false })
  await db.items.clear()
})

describe('summarizeItem', () => {
  it('生成摘要写库并返回（去首尾引号）', async () => {
    await db.items.bulkPut([mkItem(1)])
    const updateSpy = vi.spyOn(db.items, 'update').mockResolvedValue(1)
    const out = await summarizeItem(mkItem(1))
    expect(out).toBe('某公司发布高性能低功耗新芯片，下季度量产。')
    const call = chatCompletionCached.mock.calls[0][0]
    expect(call.purpose).toBe('item-aisummary')
    expect(call.inputKey).toContain('note-mig-0001')
    expect(call.user).toContain('某公司今日发布新一代芯片')
    updateSpy.mockRestore()
  })

  it('rule 模式（未配置 LLM）直接返回 null 不调用', async () => {
    vi.mocked(loadCoachConfig).mockReturnValue({ mode: 'rule' } as never)
    const out = await summarizeItem(mkItem(1))
    expect(out).toBeNull()
    expect(chatCompletionCached).not.toHaveBeenCalled()
    vi.mocked(loadCoachConfig).mockReturnValue({ mode: 'llm', apiKey: 'k', model: 'm', baseURL: 'https://x' } as never)
  })

  it('AI 调用失败返回 null 不抛（失败静默语义）', async () => {
    chatCompletionCached.mockRejectedValueOnce(new Error('网络断了'))
    const out = await summarizeItem(mkItem(1))
    expect(out).toBeNull()
  })
})

describe('summarizeDailyBackfill（限量补挂）', () => {
  it('只补缺摘要的 kept 条目，已有摘要/废弃层跳过', async () => {
    await db.items.bulkPut([
      mkItem(1, { aiSummary: '已有摘要', aiSummaryAt: '2026-11-13T09:00:00.000Z' }),
      mkItem(2),
      mkItem(3, { stage: 'discarded' }),
    ])
    const n = await summarizeDailyBackfill('2026-11-13', 10)
    expect(n).toBe(1)
    expect(chatCompletionCached).toHaveBeenCalledTimes(1)
  })
})
