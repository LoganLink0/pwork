import { describe, expect, it } from 'vitest'
import { parseOpml, sourcesToOpml } from './opml'
import type { Source } from '../types/models'

/** OPML 信源互导：平台 DOMParser/XMLSerializer 的进出走（0.3 数据主权批） */

const src = (over: Partial<Source>): Source => ({
  id: 's1', name: '量子位', url: 'https://qbitai.com/feed', kind: 'rss', domain: 'ai',
  tier: 1.5, weight: 0.7, checkEvery: 'daily', active: true,
  health: { failStreak: 0, lastOkAt: null, lastError: null }, deletedAt: null, schemaVersion: 1,
  ...over,
} as Source)

describe('parseOpml', () => {
  it('标准 OPML 解析出名称与地址', () => {
    const entries = parseOpml(`<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0"><head><title>x</title></head><body>
<outline type="rss" text="量子位" xmlUrl="https://qbitai.com/feed"/>
<outline text="无类型但有地址" xmlUrl="https://example.com/rss"/>
</body></opml>`)
    expect(entries).toEqual([
      { name: '量子位', url: 'https://qbitai.com/feed' },
      { name: '无类型但有地址', url: 'https://example.com/rss' },
    ])
  })

  it('跳过无地址与非 http/https 的条目；名称缺省取地址', () => {
    const entries = parseOpml(`<opml version="2.0"><body>
<outline text="子分组"><outline text="嵌套源" xmlUrl="https://a.com/feed"/></outline>
<outline text="没地址"/>
<outline text="危险协议" xmlUrl="file:///etc/passwd"/>
<outline xmlUrl="ftp://x.com/feed"/>
<outline xmlUrl="https://b.com/feed"/>
</body></opml>`)
    expect(entries).toEqual([
      { name: '嵌套源', url: 'https://a.com/feed' },
      { name: 'https://b.com/feed', url: 'https://b.com/feed' },
    ])
  })

  it('坏 XML 就地报错（fast-fail）', () => {
    expect(() => parseOpml('<opml><body>')).toThrow('不是合法的 OPML/XML 文件')
    expect(() => parseOpml('随便一段文本')).toThrow('不是合法的 OPML/XML 文件')
  })
})

describe('sourcesToOpml', () => {
  it('导出 → 解析 roundtrip；软删除的源不导出', () => {
    const xml = sourcesToOpml([
      src({}),
      src({ id: 's2', name: '带 & 符号的名字', url: 'https://x.com/feed?a=1&b=2' }),
      src({ id: 's3', deletedAt: '2026-10-01T00:00:00.000Z' }),
    ])
    const entries = parseOpml(xml)
    expect(entries).toEqual([
      { name: '量子位', url: 'https://qbitai.com/feed' },
      { name: '带 & 符号的名字', url: 'https://x.com/feed?a=1&b=2' },
    ])
  })
})
