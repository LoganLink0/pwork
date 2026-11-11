import { describe, expect, it } from 'vitest'
import { fillTemplate, buildCallUrl, hasPlaceholder, usedPlaceholders } from './toolTemplates'

/** 外部工具文本模板层（2.4）：占位符/编码/协议白名单/无上下文置空 */

describe('fillTemplate（占位符填充）', () => {
  it('四类占位符替换；无上下文置空不报错（验收③）', () => {
    expect(fillTemplate('A{selected}B{title}C', { selected: '文本', title: '标题' })).toBe('A文本B标题C')
    expect(fillTemplate('{noteId}-{itemId}', {})).toBe('-')
    expect(fillTemplate('{selected}', {})).toBe('')
  })

  it('多占位与重复占位全部替换', () => {
    expect(fillTemplate('{selected} 与 {selected}', { selected: 'x' })).toBe('x 与 x')
  })

  it('特殊字符（引号/换行/&）原样进替换结果——只做字符串工作', () => {
    const dirty = 'a "b" & | c\nd'
    expect(fillTemplate('X{selected}', { selected: dirty })).toBe(`X${dirty}`)
  })
})

describe('buildCallUrl（URL 模板 + 安全校验）', () => {
  it('obsidian:// 新笔记：selected 编码传递', () => {
    const url = buildCallUrl('obsidian://new?content={selected}', { selected: '你好 & 世界' })
    expect(url).toBe(`obsidian://new?content=${encodeURIComponent('你好 & 世界')}`)
    expect(url).not.toContain(' & ')
  })

  it('https 搜索模板', () => {
    const url = buildCallUrl('https://www.bing.com/search?q={selected}', { selected: 'AI' })
    expect(url).toBe('https://www.bing.com/search?q=AI')
  })

  it('协议白名单：javascript:/data:/file: 一律拒绝（null 不静默降级）', () => {
    expect(buildCallUrl('javascript:alert({selected})', { selected: 'x' })).toBeNull()
    expect(buildCallUrl('data:text/html,{selected}', { selected: '<b>x</b>' })).toBeNull()
    expect(buildCallUrl('file:///C:/x{selected}', { selected: 'y' })).toBeNull()
  })

  it('模板自身的协议不可被用户文本污染（编码先行）', () => {
    // 用户文本含 "javascript:"，编码后为 %3A 不构成协议分隔——地址仍安全
    const url = buildCallUrl('https://a.com/?q={selected}', { selected: 'javascript:alert(1)' })
    expect(url).toContain(encodeURIComponent('javascript:alert(1)'))
    expect(url!.startsWith('https://')).toBe(true)
  })

  it('引号与 & 不逃逸出参数位（验收①：含特殊字符的文本编码正确）', () => {
    const url = buildCallUrl('https://a.com/?q={selected}', { selected: '"x"&y=|z' })
    expect(url).toBe(`https://a.com/?q=${encodeURIComponent('"x"&y=|z')}`)
  })

  it('无上下文 → 占位符为空串，地址仍生成（空搜索无害）', () => {
    expect(buildCallUrl('https://www.bing.com/search?q={selected}', {})).toBe('https://www.bing.com/search?q=')
  })

  it('多占位符模板', () => {
    const url = buildCallUrl('https://a.com/?n={title}&id={itemId}&s={selected}', { title: 'T', itemId: 'i1', selected: 'S' })
    expect(url).toBe(`https://a.com/?n=${encodeURIComponent('T')}&id=i1&s=${encodeURIComponent('S')}`)
  })
})

describe('占位符自检', () => {
  it('hasPlaceholder 与 usedPlaceholders', () => {
    expect(hasPlaceholder('a{selected}b', '{selected}')).toBe(true)
    expect(hasPlaceholder('a{title}b', '{selected}')).toBe(false)
    expect(usedPlaceholders('obsidian://new?content={selected}')).toEqual(['{selected}'])
    expect(usedPlaceholders('https://a.com/?n={title}&id={itemId}')).toEqual(['{title}', '{itemId}'])
  })
})
