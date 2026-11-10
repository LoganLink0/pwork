import { describe, expect, it } from 'vitest'
import { extractFeedLinks, conventionCandidates } from './feedProbe'

describe('extractFeedLinks', () => {
  it('从页面声明提取 rss/atom alternate 并解析为绝对地址', () => {
    const html = `
      <link rel="alternate" type="application/rss+xml" title="RSS" href="/feed.xml">
      <link rel="alternate" type="application/atom+xml" href="https://example.com/atom.xml">
      <link rel="stylesheet" href="/style.css">
    `
    const links = extractFeedLinks(html, 'https://example.com/blog/')
    expect(links).toEqual(['https://example.com/feed.xml', 'https://example.com/atom.xml'])
  })

  it('无单双引号的属性与非法 href 的容错', () => {
    const html = `<link rel=alternate type=application/rss+xml href=/feed>`
    expect(extractFeedLinks(html, 'https://example.com')).toEqual(['https://example.com/feed'])
    expect(extractFeedLinks('<link rel="alternate" type="application/rss+xml" href="javascript:alert(1)">', 'https://example.com')).toEqual([])
  })

  it('非 alternate 的 feed 声明不收', () => {
    const html = `<link rel="self" type="application/atom+xml" href="https://example.com/self.xml">`
    expect(extractFeedLinks(html, 'https://example.com')).toEqual([])
  })
})

describe('conventionCandidates', () => {
  it('末尾斜杠归一后拼接六个惯例路径', () => {
    expect(conventionCandidates('https://example.com/blog/')).toEqual([
      'https://example.com/blog/feed',
      'https://example.com/blog/rss',
      'https://example.com/blog/feed.xml',
      'https://example.com/blog/atom.xml',
      'https://example.com/blog/rss.xml',
      'https://example.com/blog/index.xml',
    ])
  })
})
