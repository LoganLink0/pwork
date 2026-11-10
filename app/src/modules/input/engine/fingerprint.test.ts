import { describe, expect, it } from 'vitest'
import { fingerprintOf, normalizeTitle, normalizeUrl } from './fingerprint'

describe('normalizeUrl', () => {
  it('去 utm 跟踪参数', () => {
    expect(normalizeUrl('http://a.com/x?utm_source=rss&id=3')).toBe('https://a.com/x?id=3')
  })
  it('统一协议/主机大小写/尾斜杠', () => {
    expect(normalizeUrl('HTTP://ExaMple.com/path/')).toBe('https://example.com/path')
  })
  it('非 URL 输入退化为去空白原样', () => {
    expect(normalizeUrl('not a url')).toBe('notaurl')
  })
})

describe('normalizeTitle', () => {
  it('去空白与标点、统一全半角与大小写', () => {
    expect(normalizeTitle('Ｈello,　World！ —— 测试')).toBe('helloworld测试')
  })
  it('截断到 80 字', () => {
    expect(normalizeTitle('x'.repeat(120))).toHaveLength(80)
  })
})

describe('fingerprintOf', () => {
  it('同条目（跟踪参数/协议差异）指纹一致', () => {
    const a = fingerprintOf('http://a.com/p?utm_source=feed', '新模型发布！')
    const b = fingerprintOf('https://a.com/p', '新模型发布')
    expect(a).toBe(b)
  })
  it('不同条目指纹不同', () => {
    expect(fingerprintOf('https://a.com/p', '标题一')).not.toBe(fingerprintOf('https://a.com/q', '标题一'))
    expect(fingerprintOf('https://a.com/p', '标题一')).not.toBe(fingerprintOf('https://a.com/p', '标题二'))
  })
})
