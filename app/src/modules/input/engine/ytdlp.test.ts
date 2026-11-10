import { describe, expect, it } from 'vitest'
import { parseFlatJson } from './ytdlp'

describe('parseFlatJson', () => {
  const AT = '2026-11-01T00:00:00.000Z'

  it('清单 JSON：entries 逐条转条目（YouTube 等标题完整）', () => {
    const raw = JSON.stringify({
      entries: [
        { title: '视频一', webpage_url: 'https://youtu.be/a' },
        { title: '视频二', url: 'https://youtu.be/b' },
      ],
    })
    const items = parseFlatJson(raw, AT)
    expect(items).toHaveLength(2)
    expect(items[0]).toEqual({ title: '视频一', url: 'https://youtu.be/a', summary: '', publishedAt: AT })
  })

  it('B站 space：无 title 用 BV 号（id）兜底', () => {
    const raw = JSON.stringify({
      entries: [
        { ie_key: 'BiliBili', id: 'BV1mmxv67Evo', _type: 'url', url: 'https://www.bilibili.com/video/BV1mmxv67Evo' },
      ],
    })
    const items = parseFlatJson(raw, AT)
    expect(items[0].title).toBe('BV1mmxv67Evo')
    expect(items[0].url).toBe('https://www.bilibili.com/video/BV1mmxv67Evo')
  })

  it('entries 中的 null 项（平台侧删除/受限）跳过不炸', () => {
    const raw = JSON.stringify({ entries: [null, { title: '正常', url: 'https://youtu.be/c' }, null] })
    const items = parseFlatJson(raw, AT)
    expect(items).toHaveLength(1)
    expect(items[0].title).toBe('正常')
  })

  it('单视频 JSON（无 entries）：根对象即条目——链接捕获的基础', () => {
    const raw = JSON.stringify({
      title: '【官方 MV】Never gonna give you up', webpage_url: 'https://www.bilibili.com/video/BV1GJ411x7h7',
      uploader: '索尼音乐中国', like_count: 2968483,
    })
    const items = parseFlatJson(raw, AT)
    expect(items).toHaveLength(1)
    expect(items[0].title).toBe('【官方 MV】Never gonna give you up')
    expect(items[0].url).toBe('https://www.bilibili.com/video/BV1GJ411x7h7')
  })

  it('平台拦截（412）时 yt-dlp 输出 null → 抛人话错误', () => {
    expect(() => parseFlatJson('null', AT)).toThrow('平台拦截')
  })

  it('输出非 JSON → 抛版本过旧指引', () => {
    expect(() => parseFlatJson('ERROR: something broke', AT)).toThrow('yt-dlp -U')
  })

  it('条目缺 url → 过滤；全空 → 空数组（调用方转「清单为空」）', () => {
    const raw = JSON.stringify({ entries: [{ title: '无链接' }, { title: '有链接', url: 'https://youtu.be/d' }] })
    expect(parseFlatJson(raw, AT)).toHaveLength(1)
    expect(parseFlatJson(JSON.stringify({ entries: [] }), AT)).toHaveLength(0)
  })
})
