import { beforeEach, describe, expect, it } from 'vitest'
import { DEFAULT_QUICK_SITES, byRecentUse, loadQuickSites, makeSite, normalizeSiteUrl, saveQuickSites } from './quickLaunch'

beforeEach(() => localStorage.clear())

describe('快速启动清单', () => {
  it('未配置 → 内置默认（≥6 个，含豆包/DeepSeek）', () => {
    const sites = loadQuickSites()
    expect(sites.length).toBeGreaterThanOrEqual(6)
    expect(sites.some((s) => s.name === '豆包')).toBe(true)
    expect(sites.some((s) => s.name === 'DeepSeek')).toBe(true)
    expect(DEFAULT_QUICK_SITES.every((s) => s.url.startsWith('https://'))).toBe(true)
  })

  it('自定义增删：保存后加载一致；全删空清单回落默认', () => {
    const mine = [makeSite('测试站', 'https://t.example.com'), makeSite('例2', 'example.org')]
    saveQuickSites(mine)
    const loaded = loadQuickSites()
    expect(loaded).toHaveLength(2)
    expect(loaded[1]!.url).toBe('example.org') // 存储层原样存取；协议归一发生在编辑保存层（normalizeSiteUrl）
    saveQuickSites([])
    expect(loadQuickSites()).toEqual(DEFAULT_QUICK_SITES)
  })

  it('normalizeSiteUrl：补协议、拒非法、放行本地服务', () => {
    expect(normalizeSiteUrl('chat.deepseek.com')).toBe('https://chat.deepseek.com/')
    expect(normalizeSiteUrl('https://a.com/x')).toBe('https://a.com/x')
    expect(normalizeSiteUrl('localhost:1234')).toBe('https://localhost:1234/')
    expect(normalizeSiteUrl('')).toBeNull()
    expect(normalizeSiteUrl('不是网址')).toBeNull()
  })

  it('排序：最近使用在前，未用过的保持原顺序（稳定）', () => {
    const a = makeSite('A', 'https://a.com')
    const b = makeSite('B', 'https://b.com')
    const c = makeSite('C', 'https://c.com')
    const d = makeSite('D', 'https://d.com')
    const sorted = byRecentUse([{ ...a, lastUsedAt: 900 }, b, { ...c, lastUsedAt: 500 }, d])
    expect(sorted.map((s) => s.name)).toEqual(['A', 'C', 'B', 'D'])
  })
})
