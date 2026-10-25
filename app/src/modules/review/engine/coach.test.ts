import { describe, expect, it, vi, afterEach } from 'vitest'
import { LlmCoach, llmConfigFrom, llmConfigured, parseStringArray, RuleBasedCoach, getCoach, loadCoachConfig } from './coach'
import type { CoachContext } from './coach'

const ctx: CoachContext = {
  scenario: 'project',
  goal: '季度完成新版本上线',
  result: '延期两周上线，线上事故 1 次',
  causes: ['集成测试环境不稳定'],
}

afterEach(() => {
  vi.unstubAllGlobals()
  localStorage.clear()
})

describe('规则引擎教练（离线默认）', () => {
  it('有原因时给深挖追问；无原因时先要靶子', async () => {
    const coach = new RuleBasedCoach()
    const withCauses = await coach.askDeepQuestions(ctx)
    expect(withCauses.length).toBeGreaterThanOrEqual(3)
    const without = await coach.askDeepQuestions({ ...ctx, causes: [] })
    expect(without.some((q) => q.includes('原因'))).toBe(true)
  })

  it('情绪场景换触发点视角', async () => {
    const coach = new RuleBasedCoach()
    const qs = await coach.askDeepQuestions({ ...ctx, scenario: 'emotion' })
    expect(qs.some((q) => q.includes('信号') || q.includes('打断'))).toBe(true)
  })

  it('改写走规则库映射', async () => {
    const coach = new RuleBasedCoach()
    const out = await coach.reframe('都是小王的错', 'blame')
    expect(out).toContain('主角')
  })
})

describe('LLM 教练（BYOK）', () => {
  const cfg = {
    mode: 'llm' as const,
    provider: 'deepseek' as const,
    baseURL: 'https://api.deepseek.com',
    apiKey: 'sk-test',
    model: 'deepseek-chat',
  }

  function mockFetch(payload: unknown, ok = true, status = 200) {
    return vi.fn().mockResolvedValue({
      ok,
      status,
      text: async () => JSON.stringify(payload),
      json: async () => payload,
    })
  }

  it('parseStringArray：兼容 JSON 与编号列表', () => {
    expect(parseStringArray('["A 问题","B 问题"]')).toEqual(['A 问题', 'B 问题'])
    expect(parseStringArray('好的，以下是问题：\n1. 第一问\n2. 第二问')).toEqual(['第一问', '第二问'])
    expect(parseStringArray('完全无关的长文本——没有可用问题')).toEqual([])
  })

  it('LLM 成功路径：解析出 3 个问题', async () => {
    vi.stubGlobal('fetch', mockFetch({ choices: [{ message: { content: '["为什么测试环境不稳定会反复出现？","环境问题的责任人是固定的吗？"]' } }] }))
    const coach = new LlmCoach(cfg)
    const qs = await coach.askDeepQuestions(ctx)
    expect(qs).toHaveLength(2)
    expect(qs[0]).toContain('测试环境')
  })

  it('LLM 失败时回落规则引擎（产品完整可用）', async () => {
    vi.stubGlobal(
      'fetch',
      mockFetch({ error: { message: 'auth failed' } }, false, 401),
    )
    const coach = new LlmCoach(cfg)
    const qs = await coach.askDeepQuestions(ctx)
    expect(qs.length).toBeGreaterThanOrEqual(3)
    const out = await coach.reframe('都是市场的错', 'blame')
    expect(out.length).toBeGreaterThan(4)
  })

  it('getCoach：无 Key 时永远返回规则引擎', () => {
    localStorage.setItem('fupan-coach', JSON.stringify({ ...cfg, apiKey: '' }))
    expect(getCoach().id).toBe('rule')
    localStorage.setItem('fupan-coach', JSON.stringify(cfg))
    expect(getCoach(loadCoachConfig()).id).toBe('llm')
  })
})

describe('本地网关模式（Key 在网关进程，浏览器侧无 Key）', () => {
  it('llmConfigured：网关模式算已配置，直连无 Key 算未配置', () => {
    localStorage.setItem('fupan-coach', JSON.stringify({ mode: 'llm', viaGateway: true }))
    expect(loadCoachConfig().mode).toBe('llm')
    expect(llmConfigured()).toBe(true)

    localStorage.setItem('fupan-coach', JSON.stringify({ mode: 'llm', apiKey: '' }))
    expect(llmConfigured()).toBe(false)

    localStorage.setItem('fupan-coach', JSON.stringify({ mode: 'llm', apiKey: 'sk-real' }))
    expect(llmConfigured()).toBe(true)
  })

  it('getCoach：网关模式（apiKey 空 + viaGateway）也走 LLM 适配器——推荐配置路径不能被工厂挡在门外', () => {
    localStorage.setItem('fupan-coach', JSON.stringify({ mode: 'llm', viaGateway: true, gatewayUrl: 'http://127.0.0.1:8788' }))
    expect(getCoach(loadCoachConfig()).id).toBe('llm')

    localStorage.setItem('fupan-coach', JSON.stringify({ mode: 'llm', apiKey: '', viaGateway: false }))
    expect(getCoach(loadCoachConfig()).id).toBe('rule')
  })

  it('llmConfigFrom：网关模式用 sentinel Key + 网关 /v1 地址，直连用原样配置', () => {
    localStorage.setItem('fupan-coach', JSON.stringify({ mode: 'llm', viaGateway: true, gatewayUrl: 'http://127.0.0.1:8788', model: 'deepseek-chat' }))
    const g = llmConfigFrom(loadCoachConfig())
    expect(g.apiKey).toBe('pwork-gateway')
    expect(g.baseURL).toBe('http://127.0.0.1:8788/v1')
    expect(g.model).toBe('deepseek-chat')

    localStorage.setItem('fupan-coach', JSON.stringify({ mode: 'llm', apiKey: 'sk-real', baseURL: 'https://api.deepseek.com', model: 'deepseek-chat' }))
    const d = llmConfigFrom(loadCoachConfig())
    expect(d.apiKey).toBe('sk-real')
    expect(d.baseURL).toBe('https://api.deepseek.com')
  })
})
