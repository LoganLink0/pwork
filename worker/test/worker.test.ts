import { describe, expect, it } from 'vitest'
import { fingerprintOf, prefilterByRules, scoreByRules } from '../src/rules'
import { parseFeed, parseRss2Json } from '../src/rss'
import { aiScore, chat, parseJsonLoose } from '../src/ai'
import type { AiConfig } from '../src/ai'
import { runSource } from '../src/pipeline'
import type { WorkerSource } from '../src/rules'

const RSS = `<?xml version="1.0"?><rss version="2.0"><channel>
<item><title><![CDATA[AI 应用开源工具发布 v2]]></title><link>https://e.com/1?utm_source=rss</link><description>&lt;b&gt;可直接借鉴的实践案例&lt;/b&gt;</description><pubDate>Mon, 31 Aug 2026 08:00:00 GMT</pubDate></item>
<item><title>某公司完成新一轮融资</title><link>https://e.com/2</link><description>金额</description></item>
</channel></rss>`

const SRC: WorkerSource = { id: 'src_t', name: '测试', url: 'https://a/rss', domain: 'ai', tier: 1, weight: 1, active: 1 }

describe('rss 解析（正则版，Workers 无 DOMParser）', () => {
  it('CDATA 标题 / 实体摘要 / 链接 / 日期', () => {
    const r = parseFeed(RSS)
    expect(r.ok).toBe(true)
    expect(r.items[0]!.title).toBe('AI 应用开源工具发布 v2')
    expect(r.items[0]!.summary).toContain('可直接借鉴的实践案例')
    expect(r.items[0]!.url).toBe('https://e.com/1?utm_source=rss')
    expect(r.items[0]!.publishedAt).toBe('2026-08-31T08:00:00.000Z')
  })

  it('rss2json 响应', () => {
    const r = parseRss2Json(JSON.stringify({ status: 'ok', items: [{ title: '标题足够长', link: 'https://a/1', description: 'x' }] }))
    expect(r.ok).toBe(true)
    expect(r.items[0]!.url).toBe('https://a/1')
  })

  it('非 RSS / 空频道 → 失败带原因', () => {
    expect(parseFeed('<html/>').ok).toBe(false)
    expect(parseFeed('<rss version="2.0"><channel></channel></rss>').ok).toBe(false)
  })
})

describe('规则评分（与 app 同公式）', () => {
  it('预筛屏蔽词', () => {
    expect(prefilterByRules('某公司完成融资', '', ['融资']).pass).toBe(false)
    expect(prefilterByRules('AI 应用开源工具发布', '', ['融资']).pass).toBe(true)
  })

  it('评分四维与理由 ≤30 字', () => {
    const s = scoreByRules(SRC, 'AI 应用开源工具发布', '实践案例', 0, ['AI 应用'])
    expect(s.total).toBeGreaterThanOrEqual(80)
    expect(s.reason.length).toBeLessThanOrEqual(30)
    expect(s.tags).toContain('ai')
  })

  it('fingerprint 与 app 同锚点（跟踪参数归一）', () => {
    expect(fingerprintOf('http://e.com/1?utm_source=rss', '标题！')).toBe(fingerprintOf('https://e.com/1', '标题'))
  })
})

describe('AI 两级筛选与降级（04 §5）', () => {
  const AI: AiConfig = {
    baseUrl: 'https://fake.ai/v1',
    apiKey: 'sk-test',
    modelCheap: 'cheap',
    modelStrong: 'strong',
    dailyBudget: 1000,
    interests: ['AI 应用'],
    dislikes: ['融资'],
    context: '',
  }

  it('parseJsonLoose 剥围栏', () => {
    expect(parseJsonLoose('```json\n{"pass":true}\n```')).toEqual({ pass: true })
  })

  it('AI 评分正常路径（mock fetch 200）', async () => {
    const fetchMock = async () =>
      new Response(JSON.stringify({ choices: [{ message: { content: '{"total":88,"novelty":0.9,"relevance":0.8,"utility":0.7,"reason":"高相关可操作","tags":["AI"],"otFlag":"opportunity"}' } }], usage: { total_tokens: 120 } }), { status: 200 })
    globalThis.fetch = fetchMock as typeof fetch
    const spend = async () => true
    const s = await aiScore(AI, 'AI 应用开源工具发布', 'x', spend)
    expect(s?.total).toBe(88)
    expect(s?.otFlag).toBe('opportunity')
  })

  it('降级链：LLM 500 → aiScore 返回 null（调用方走规则）', async () => {
    globalThis.fetch = (async () => new Response('err', { status: 500 })) as typeof fetch
    const spend = async () => true
    expect(await aiScore(AI, '任意标题足够长', '', spend)).toBeNull()
    expect(await aiPrefilterNull()).toBeNull()
  })

  async function aiPrefilterNull() {
    const { aiPrefilter } = await import('../src/ai')
    return aiPrefilter(AI, '标题', '', async () => true)
  }

  it('熔断：budget 用尽 → 不再调用 AI', async () => {
    let calls = 0
    globalThis.fetch = (async () => {
      calls++
      return new Response('err', { status: 500 })
    }) as typeof fetch
    const spend = async () => false // 已熔断
    await aiScore(AI, '标题', '', spend)
    expect(calls).toBe(0) // spend 直接 false，fetch 未被调用
  })
})

describe('runSource（D1 mock）：入库/去重/失败计数', () => {
  function mockDB() {
    const items = new Map<string, Record<string, unknown>>()
    const sources = new Map<string, Record<string, unknown>>([
      ['src_t', { id: 'src_t', fail_streak: 0, active: 1 }],
    ])
    const stmt = (sql: string) => ({
      bind: (...vals: unknown[]) => ({
        first: async () => {
          if (sql.includes('FROM items WHERE fingerprint')) return items.get(String(vals[0])) ?? null
          if (sql.includes('FROM sources WHERE id')) return sources.get(String(vals[0])) ?? null
          return null
        },
        run: async () => {
          if (sql.startsWith('INSERT INTO items')) {
            const fp = String(vals[6])
            items.set(fp, { id: vals[0], fingerprint: fp })
          }
          if (sql.startsWith('UPDATE sources SET fail_streak')) {
            const cur = sources.get(String(vals[3])) ?? {}
            sources.set(String(vals[3]), { ...cur, fail_streak: vals[0], active: vals[1] })
          }
          if (sql.startsWith('UPDATE sources SET fail_streak = 0')) {
            const cur = sources.get(String(vals[1])) ?? {}
            sources.set(String(vals[1]), { ...cur, fail_streak: 0 })
          }
        },
      }),
    })
    return {
      prepare: stmt,
      _items: items,
      _sources: sources,
    } as unknown as import('../src/pipeline').Env['DB']
  }

  it('无 AI key → 规则评分入库；重复抓取去重', async () => {
    globalThis.fetch = (async () => new Response(RSS, { status: 200 })) as typeof fetch
    const env = mockDB()
    const ai = { ...({} as AiConfig), apiKey: undefined, interests: ['AI 应用'], dislikes: ['融资'], baseUrl: '', modelCheap: '', modelStrong: '', dailyBudget: 0, context: '' }
    const r1 = await runSource({ DB: env } as never, ai, SRC, new Map([['ai', 0]]), '2026-08-31')
    expect(r1.ok).toBe(true)
    expect(r1.newCount).toBe(1) // 融资条目被规则预筛掉
    expect(r1.discardedCount).toBe(1)
    const r2 = await runSource({ DB: env } as never, ai, SRC, new Map(), '2026-08-31')
    // 已入库条目（含 discarded）同样参与指纹去重 → 第二轮全部命中
    expect(r2.duplicateCount).toBe(2)
    expect(r2.newCount).toBe(0)
  })

  it('抓取失败 → fail_streak 累计，第 3 次自动停用', async () => {
    globalThis.fetch = (async () => new Response('x', { status: 500 })) as typeof fetch
    const env = mockDB()
    const ai = { apiKey: undefined, interests: [], dislikes: [], baseUrl: '', modelCheap: '', modelStrong: '', dailyBudget: 0, context: '' } as AiConfig
    await runSource({ DB: env } as never, ai, SRC, new Map(), 'd')
    await runSource({ DB: env } as never, ai, SRC, new Map(), 'd')
    const r3 = await runSource({ DB: env } as never, ai, SRC, new Map(), 'd')
    expect(r3.autoStopped).toBe(true)
    expect((env as unknown as { _sources: Map<string, Record<string, unknown>> })._sources.get('src_t')?.active).toBe(0)
  })
})
