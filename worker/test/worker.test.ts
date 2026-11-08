import { describe, expect, it } from 'vitest'
import { fingerprintOf, prefilterByRules, scoreByRules } from '../src/rules'
import { parseFeed, parseRss2Json } from '../src/rss'
import { aiScore, chat, parseJsonLoose } from '../src/ai'
import type { AiConfig } from '../src/ai'
import { runSource } from '../src/pipeline'
import type { WorkerSource } from '../src/rules'
import { INGEST_MAX_PER_MINUTE, INGEST_MAX_PER_REQUEST, minuteKey, normalizeIngest } from '../src/ingest'
import { assertPublicHttpUrl } from '../src/urlGuard'
import worker from '../src/index'

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

  it('parseJsonLoose 三层防线：尾随杂文 / 前置杂文 / 字符串内裸控制字符（AIHOT 移植）', () => {
    // 旧实现 slice(start) 到结尾：JSON 后跟任何解释文字必炸
    expect(parseJsonLoose('{"total": 88}\n以上是评分，希望有帮助。')).toEqual({ total: 88 })
    expect(parseJsonLoose('好的，结果如下：\n{"pass": true}')).toEqual({ pass: true })
    // 裸 \x0b 在字符串字面量内：JSON.parse 必炸，修复后可解析
    const raw = '{"reason": "第一段\x0b第二段"}'
    expect(() => JSON.parse(raw)).toThrow()
    expect(parseJsonLoose(raw)).toEqual({ reason: '第一段\x0b第二段' })
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

describe('ingest 限额与规范化（Token 泄漏止损）', () => {
  it('超单请求上限截断并计数；字段截断与空跳过；单对象形态', () => {
    const many = Array.from({ length: INGEST_MAX_PER_REQUEST + 30 }, (_, i) => ({ title: `t${i}`, content: 'c' }))
    const r = normalizeIngest({ blocks: many })
    expect(r.blocks).toHaveLength(INGEST_MAX_PER_REQUEST)
    expect(r.truncated).toBe(30)

    const r2 = normalizeIngest({ blocks: [{ title: ' x ', content: '  '.trim() || 'y' }, { title: 'ok', content: '正文' }, { title: '', content: 'z' }] })
    expect(r2.blocks).toEqual([
      { source: 'api', title: 'x', content: 'y' },
      { source: 'api', title: 'ok', content: '正文' },
    ])
    expect(r2.skipped).toBe(1) // 仅空标题那条被跳过；' x '/'  ' 两条展示 trim 归一

    // 单对象（非数组）形态照常受理
    expect(normalizeIngest({ title: '单块', content: '内容', source: 'n8n' })).toEqual({
      blocks: [{ source: 'n8n', title: '单块', content: '内容' }],
      skipped: 0,
      truncated: 0,
    })

    // 字段截断：超长 title/content/source
    const r3 = normalizeIngest({ title: '长'.repeat(60), content: '文'.repeat(30000), source: 's'.repeat(80) })
    expect(r3.blocks[0]!.title).toHaveLength(40)
    expect(r3.blocks[0]!.content).toHaveLength(20000)
    expect(r3.blocks[0]!.source).toHaveLength(40)
  })

  it('minuteKey 格式为 UTC 分钟（代码生成，无用户输入）', () => {
    expect(minuteKey(new Date('2026-09-29T08:07:22.123Z'))).toBe('2026-09-29T08:07')
  })

  it('/api/health 开放可达（部署验收用）', async () => {
    const res = await worker.fetch(new Request('https://w/api/health'), { TOKEN: 't' } as never)
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ ok: true })
  })
})

describe('D1 代理（手机端通路：挂 CORS 转发官方端点，鉴权由官方裁定）', () => {
  const GOOD = { accountId: 'a'.repeat(32), databaseId: '12345678-1234-1234-1234-123456789012', sql: 'SELECT 1', params: [] }

  it('无 Bearer → 401 且不外呼', async () => {
    let called = 0
    globalThis.fetch = (async () => { called++; return new Response('{}', { status: 200 }) }) as typeof fetch
    const res = await worker.fetch(new Request('https://w/api/d1/query', { method: 'POST', body: JSON.stringify(GOOD) }), { TOKEN: 't' } as never)
    expect(res.status).toBe(401)
    expect(called).toBe(0)
  })

  it('账户/库 ID 格式坏 → 400（拼上游 URL 前拦截，防路径注入）', async () => {
    globalThis.fetch = (async () => new Response('{}', { status: 200 })) as typeof fetch
    const res = await worker.fetch(
      new Request('https://w/api/d1/query', { method: 'POST', headers: { authorization: 'Bearer cf_x' }, body: JSON.stringify({ ...GOOD, accountId: '../other/account' }) }),
      { TOKEN: 't' } as never,
    )
    expect(res.status).toBe(400)
  })

  it('正常请求 → 转发官方端点带原 Bearer，响应透传 + CORS 头', async () => {
    let seenUrl = ''
    let seenAuth = ''
    globalThis.fetch = (async (url: string | URL, init?: RequestInit) => {
      seenUrl = String(url)
      seenAuth = String((init?.headers as Record<string, string>)?.authorization ?? '')
      return new Response(JSON.stringify({ success: true, result: [{ results: [{ n: 3 }] }] }), { status: 200 })
    }) as typeof fetch
    const res = await worker.fetch(
      new Request('https://w/api/d1/query', { method: 'POST', headers: { authorization: 'Bearer cf_tok' }, body: JSON.stringify(GOOD) }),
      { TOKEN: 't' } as never,
    )
    expect(res.status).toBe(200)
    expect(seenUrl).toContain(`/accounts/${'a'.repeat(32)}/d1/database/12345678-1234-1234-1234-123456789012/query`)
    expect(seenAuth).toBe('Bearer cf_tok')
    expect(res.headers.get('access-control-allow-origin')).toBe('*')
    const data = (await res.json()) as { result?: { results?: unknown[] }[] }
    expect(data.result?.[0]?.results?.[0]).toEqual({ n: 3 })
  })

  it('上游 401 → 状态与错误体原样透传（官方裁定，worker 不吞不改）', async () => {
    globalThis.fetch = (async () => new Response(JSON.stringify({ success: false, errors: [{ message: 'Invalid API Token' }] }), { status: 401 })) as typeof fetch
    const res = await worker.fetch(
      new Request('https://w/api/d1/query', { method: 'POST', headers: { authorization: 'Bearer bad' }, body: JSON.stringify(GOOD) }),
      { TOKEN: 't' } as never,
    )
    expect(res.status).toBe(401)
    const data = (await res.json()) as { errors?: { message?: string }[] }
    expect(data.errors?.[0]?.message).toBe('Invalid API Token')
  })
})

describe('配对码直执行（手机端两步配对：端点地址 + 配对码，白名单收口）', () => {
  const PAIR = 'A1B2C3D4E5F60708'
  /** 最小 D1 mock：config 表查询回配对码；其余语句走可选 exec 回结果 */
  function mockSyncDb(pairing: string | null, exec?: (sql: string, params: unknown[]) => { results?: unknown[] }) {
    return {
      prepare(sql: string) {
        if (/from\s+config/i.test(sql)) {
          return {
            bind: () => ({ first: async () => ({ value: pairing }), all: async () => ({ results: [] }), run: async () => ({}) }),
          }
        }
        return {
          first: async () => null,
          bind: (...params: unknown[]) => ({
            all: async () => ({ results: exec?.(sql, params)?.results ?? [] }),
            run: async () => ({}),
          }),
        }
      },
    }
  }
  const req = (sql: string, bearer: string, exec?: (sql: string, params: unknown[]) => { results?: unknown[] }) =>
    worker.fetch(
      new Request('https://w/api/d1/query', { method: 'POST', headers: { authorization: `Bearer ${bearer}` }, body: JSON.stringify({ sql, params: [] }) }),
      { TOKEN: 'ptk_x', DB: mockSyncDb(PAIR, exec) } as never,
    )

  it('配对码命中 + 白名单内 SELECT → 就地执行返回官方形状，不外呼', async () => {
    globalThis.fetch = (async () => { throw new Error('不应外呼') }) as typeof fetch
    const res = await req("SELECT * FROM items WHERE stage = 'scored'", PAIR)
    expect(res.status).toBe(200)
    const data = (await res.json()) as { success?: boolean; result?: { results?: unknown[] }[] }
    expect(data.success).toBe(true)
    expect(data.result?.[0]?.results).toEqual([])
  })

  it('配对码错误 → 不就地执行也不外呼（无 ID 可转发，400 拒绝）', async () => {
    let called = 0
    globalThis.fetch = (async () => { called++; return new Response('{}', { status: 200 }) }) as typeof fetch
    const res = await req('SELECT * FROM items', 'WRONGCODE0000')
    expect(res.status).toBe(400)
    expect(called).toBe(0)
  })

  it('白名单外的表 → 拒绝且不外呼（错误消息含表名）', async () => {
    let called = 0
    globalThis.fetch = (async () => { called++; return new Response('{}', { status: 200 }) }) as typeof fetch
    const res = await req('SELECT * FROM notes', PAIR)
    const data = (await res.json()) as { success?: boolean; errors?: { message?: string }[] }
    expect(data.success).toBe(false)
    expect(data.errors?.[0]?.message).toContain('白名单')
    expect(called).toBe(0)
  })

  it('多语句（分号）→ 拒绝', async () => {
    const res = await req('SELECT * FROM items; DROP TABLE items', PAIR)
    const data = (await res.json()) as { success?: boolean }
    expect(data.success).toBe(false)
  })

  it('部署 Token（ptk_）同样走直执行白名单，不外呼', async () => {
    globalThis.fetch = (async () => { throw new Error('不应外呼') }) as typeof fetch
    const res = await req('SELECT count(*) AS n FROM sources', 'ptk_x')
    const data = (await res.json()) as { success?: boolean }
    expect(data.success).toBe(true)
  })
})

describe('外联 URL 守卫（SSRF 止损）', () => {
  it('公网 http/https 放行', () => {
    expect(() => assertPublicHttpUrl('https://api.deepseek.com/v1')).not.toThrow()
    expect(() => assertPublicHttpUrl('http://example.com/rss')).not.toThrow()
    expect(() => assertPublicHttpUrl('https://[2606:4700::6810:85e5]/')).not.toThrow()
  })

  it('协议与主机：非 http(s)、环回、内网、链路本地、保留段全拒', () => {
    expect(() => assertPublicHttpUrl('file:///etc/passwd')).toThrow('http/https')
    expect(() => assertPublicHttpUrl('https://localhost/v1')).toThrow('内网')
    expect(() => assertPublicHttpUrl('http://127.0.0.1/')).toThrow('内网')
    expect(() => assertPublicHttpUrl('http://10.1.2.3/')).toThrow('内网')
    expect(() => assertPublicHttpUrl('http://172.16.0.1/')).toThrow('内网')
    expect(() => assertPublicHttpUrl('http://192.168.1.1/')).toThrow('内网')
    expect(() => assertPublicHttpUrl('http://169.254.169.254/latest/meta-data')).toThrow('内网') // 云 metadata
    expect(() => assertPublicHttpUrl('http://100.64.0.1/')).toThrow('内网') // CGNAT
    expect(() => assertPublicHttpUrl('http://0.0.0.0/')).toThrow('内网')
    expect(() => assertPublicHttpUrl('http://224.0.0.1/')).toThrow('内网') // 组播段
    expect(() => assertPublicHttpUrl('http://[::1]/')).toThrow('内网')
    expect(() => assertPublicHttpUrl('http://[fe80::1]/')).toThrow('内网')
    expect(() => assertPublicHttpUrl('http://[fc00::1]/')).toThrow('内网')
    expect(() => assertPublicHttpUrl('https://db.internal/api')).toThrow('内网')
  })

  it('公网 IPv4 段不误伤', () => {
    expect(() => assertPublicHttpUrl('http://8.8.8.8/')).not.toThrow()
    expect(() => assertPublicHttpUrl('http://172.32.0.1/')).not.toThrow() // 172.32 不在私有段
    expect(() => assertPublicHttpUrl('http://192.169.0.1/')).not.toThrow()
  })
})
