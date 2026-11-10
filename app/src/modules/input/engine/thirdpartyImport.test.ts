import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import JSZip from 'jszip'
import { importMarkdownNotes, parseMarkdownFiles } from './markdownImport'
import { parseFlomoHtml, parseEnex, parseNotionZip, importNoteAppData } from './thirdpartyImport'
import { parseBookmarksHtml } from './bookmarksImport'
import { db } from '../../../db/schema'

afterEach(async () => {
  vi.unstubAllGlobals()
  await db.notes.clear()
  await db.items.clear()
})

beforeEach(() => {
  localStorage.clear()
})

describe('书签 HTML：ul/li 形态（稍后读三家）', () => {
  const POCKET_LIKE = `<html><body><h1>Pocket Export</h1>
<ul><li><a href="https://p.com/1">第一条</a></li>
<li>文件夹组
  <ul><li><a href="https://p.com/2" add_date="1690000000">组内一条</a></li></ul>
</li></ul></body></html>`

  it('ul/li 形态解析：顶层链接与组文件夹递归、时间戳转 ISO', () => {
    const r = parseBookmarksHtml(POCKET_LIKE)
    expect(r.entries).toHaveLength(2)
    expect(r.entries[0]!.url).toBe('https://p.com/1')
    expect(r.entries[0]!.folders).toEqual([])
    expect(r.entries[1]!.folders).toEqual(['文件夹组'])
    expect(r.entries[1]!.addDate).toBe('2023-07-22T04:26:40.000Z')
  })
})

describe('parseMarkdownFiles（宽容 md 导入）', () => {
  it('frontmatter 型：title/tags 从元数据，正文去头', async () => {
    const r = await parseMarkdownFiles([
      { path: '笔记/深/一条.md', text: '---\ntitle: 有元数据\ntags: [工作, 项目]\n---\n\n正文第一段。\n\n正文第二段。' },
    ])
    expect(r.drafts).toHaveLength(1)
    const d = r.drafts[0]!
    expect(d.title).toBe('有元数据')
    expect(d.tags).toContain('工作')
    expect(d.tags).toContain('笔记') // 文件夹转标签
    expect(d.body).not.toContain('---')
    expect(d.body).toContain('正文第一段。')
  })

  it('无元数据型：H1 或首行作标题，行内 #标签提取', async () => {
    const r = await parseMarkdownFiles([
      { path: 'a.md', text: '# 大标题\n\n带 #标签 的正文，以及 #另一个。' },
    ])
    const d = r.drafts[0]!
    expect(d.title).toBe('大标题')
    expect(d.tags).toEqual(expect.arrayContaining(['标签', '另一个']))
    expect(d.body).toContain('# 大标题')
  })

  it('非 md 与空文件计入跳过；路径文件夹转标签（多段）', async () => {
    const r = await parseMarkdownFiles([
      { path: '库/AI/文章/深度长文.md', text: '内容' },
      { path: '库/图片.png', text: '二进制' },
      { path: '库/空.md', text: '   ' },
    ], '库')
    expect(r.drafts).toHaveLength(1)
    expect(r.skipped).toBe(2)
    expect(r.drafts[0]!.tags).toEqual(['AI', '文章'])
  })
})

describe('importMarkdownNotes（入库与去重）', () => {
  it('按 body 去重：批内重复只进一条；上限保护', async () => {
    const drafts = [
      { title: 'a', body: '正文甲', tags: [] },
      { title: 'b', body: '正文乙', tags: [] },
      { title: 'c', body: '正文甲', tags: [] }, // 批内重复
    ]
    const r = await importMarkdownNotes(drafts)
    expect(r.imported).toBe(2)
    expect(r.duplicates).toBe(1)
    // 再导一次：全部命中库内已有 → 全部去重
    const r2 = await importMarkdownNotes(drafts)
    expect(r2.imported).toBe(0)
    expect(r2.duplicates).toBe(3)
  })
})

describe('parseFlomoHtml（时间戳锚点切块）', () => {
  const FLOMO = `<html><body>
<div class="memo"><div class="time">2026-01-01 09:30</div><div class="content">#工作 早上想到一个点子，关于 #项目的缓存设计</div></div>
<div class="memo"><div class="time">2026-01-02 21:05</div><div class="content">纯文字没有标签的一条</div></div>
</body></html>`

  it('按时间戳切块：每条带 tags 与正文；无时间戳文本不产生空条目', () => {
    const r = parseFlomoHtml(FLOMO)
    expect(r.drafts).toHaveLength(2)
    expect(r.drafts[0]!.tags).toEqual(['工作', '项目的缓存设计'])
    expect(r.drafts[0]!.body).toContain('早上想到一个点子')
    expect(r.drafts[1]!.tags).toEqual([])
    expect(r.skipped).toBe(0)
  })

  it('无时间戳的普通网页返回空结果', () => {
    expect(parseFlomoHtml('<html><body><p>没有时间戳</p></body></html>').drafts).toHaveLength(0)
  })
})

describe('parseEnex（公开 DTD 的 XML）', () => {
  const ENEX = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE en-export SYSTEM "http://xml.evernote.com/pub/evernote-export3.dtd">
<en-export export-date="20261104T000000Z" application="Evernote"><note>
<title>会议纪要</title><content><![CDATA[<?xml version="1.0"?><en-note><div>第一段内容</div><div>第二段内容</div></en-note>]]></content>
<tag>会议</tag><tag>纪要</tag><created>20261101T090000Z</created></note><note>
<title>空的</title><content><![CDATA[<?xml version="1.0"?><en-note></en-note>]]></content></note></en-export>`

  it('title/tags/正文段落提取；空正文计数跳过', () => {
    const r = parseEnex(ENEX)
    expect(r.drafts).toHaveLength(1)
    const d = r.drafts[0]!
    expect(d.title).toBe('会议纪要')
    expect(d.tags).toEqual(['会议', '纪要'])
    expect(d.body).toContain('第一段内容')
    expect(d.body).toContain('第二段内容')
    expect(d.body).toContain('\n') // 二次解析保留段落换行，字面标签不进正文
    expect(d.body).not.toContain('<div>')
    expect(r.skipped).toBe(1)
  })
})

describe('parseNotionZip 与统一入口', () => {
  async function makeZip(): Promise<File> {
    const zip = new JSZip()
    zip.file('工作区/主页面 abcdef0123456789abcdef0123456789/主页面.md', '# 主页面\n\n内容甲')
    zip.file('工作区/子页面 0123456789abcdef0123456789abcdef/子页.md', '内容乙')
    zip.file('工作区/主页面 abcdef0123456789abcdef0123456789/media/图.png', new Uint8Array([1, 2, 3]))
    const blob = await zip.generateAsync({ type: 'blob' })
    return new File([blob], 'Export.zip', { type: 'application/zip' })
  }

  it('Notion zip：md 解析、hex 后缀文件夹清洗、csv/资源计为非笔记文件', async () => {
    const f = await makeZip()
    const r = await parseNotionZip(f)
    expect(r.drafts).toHaveLength(2)
    expect(r.nonNoteFiles).toBe(1)
    const d = r.drafts[0]!
    expect(d.title).toBe('主页面')
    expect(d.tags).toContain('工作区')
    // hex 后缀被剥掉：同一主页面文件夹的标签不带哈希
    expect(d.tags.join(' ')).not.toMatch(/[0-9a-f]{32}/)
  })

  it('统一入口分发：zip 走 Notion、enex 走 enex；不支持类型如实报错', async () => {
    const f = await makeZip()
    const r = await importNoteAppData(f)
    expect(r.source).toBe('notion')
    expect(r.imported).toBeGreaterThanOrEqual(1)
    await expect(importNoteAppData(new File(['x'], 'data.txt'))).rejects.toThrow('不支持的文件类型')
  })
})
