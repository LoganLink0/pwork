import { describe, expect, it } from 'vitest'
import { DOMAIN_LABEL, RECOMMENDED_SOURCES, SOURCE_CATALOG } from './collect'

/** 信源目录数据文件（source-catalog.json）载入质量：0.4-6 内容插件层的门槛测试 */

describe('source-catalog.json 载入', () => {
  it('目录规模：11 个领域 40+ 源；领域全部有中文标签', () => {
    expect(SOURCE_CATALOG.length).toBeGreaterThanOrEqual(11)
    const total = SOURCE_CATALOG.reduce((n, g) => n + g.sources.length, 0)
    expect(total).toBeGreaterThanOrEqual(40)
    for (const g of SOURCE_CATALOG) {
      expect(DOMAIN_LABEL[g.domain], `领域 ${g.domain} 缺中文标签（DOMAINS 未登记）`).toBeTruthy()
    }
  })

  it('全部条目字段合法且地址全局唯一', () => {
    const seen = new Set<string>()
    for (const g of SOURCE_CATALOG) {
      for (const s of g.sources) {
        expect(s.name.trim()).toBeTruthy()
        expect(s.url).toMatch(/^https:\/\//)
        expect([1, 1.5, 2]).toContain(s.tier)
        expect(s.domain).toBe(g.domain)
        expect(seen.has(s.url), `地址重复：${s.url}`).toBe(false)
        seen.add(s.url)
      }
    }
  })

  it('首页快捷导入包（RECOMMENDED_SOURCES）非空且全部来自目录', () => {
    const byName = new Set(SOURCE_CATALOG.flatMap((g) => g.sources).map((s) => s.name))
    expect(RECOMMENDED_SOURCES.length).toBeGreaterThanOrEqual(10)
    for (const s of RECOMMENDED_SOURCES) {
      expect(byName.has(s.name), `推荐包成员不在目录里：${s.name}`).toBe(true)
    }
  })
})
