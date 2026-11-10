import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { importBookmarks, parseBookmarksHtml } from './bookmarksImport'
import { DEFAULT_COLLECT_CONFIG } from '../../../content/collect'
import { db } from '../../../db/schema'
import { putItem } from '../../../db/collect'

/** Chrome 形态的 Netscape 书签导出（含根文件夹、嵌套、非 http 链接、秒形 ADD_DATE） */
const CHROME_EXPORT = `<!DOCTYPE NETSCAPE-Bookmark-file-1>
<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">
<TITLE>Bookmarks</TITLE>
<H1>Bookmarks</H1>
<DL><p>
    <DT><H3 ADD_DATE="1690000000" LAST_MODIFIED="1690000001">书签栏</H3>
    <DL><p>
        <DT><H3 ADD_DATE="1690000002">AI</H3>
        <DL><p>
            <DT><A HREF="https://example.com/a1" ADD_DATE="1690000100">一篇 AI 文章</A>
            <DT><A HREF="https://example.com/a2" ADD_DATE="1690000200">另一篇</A>
        </DL><p>
        <DT><A HREF="https://example.com/top">顶层直存的一篇</A>
    </DL><p>
    <DT><H3>其他书签</H3>
    <DL><p>
        <DT><A HREF="chrome://settings">浏览器内部页</A>
        <DT><A HREF="https://example.com/dup">重复书签</A>
    </DL><p>
</DL><p>`

/** Firefox 形态：DT 后兄弟 DL 嵌套 + 无 ADD_DATE 的链接 */
const FIREFOX_EXPORT = `<!DOCTYPE NETSCAPE-Bookmark-file-1>
<TITLE>Bookmarks Menu</TITLE>
<H1>Bookmarks Menu</H1>
<DL><p>
    <DT><H3>工具</H3>
    <DL><p>
        <DT><A HREF="https://tool.example.com/1">工具站</A>
    </DL><p>
    <DT><A HREF="https://plain.example.com/">裸链接</A>
</DL>`

afterEach(async () => {
  vi.unstubAllGlobals()
  await db.items.clear()
})

describe('parseBookmarksHtml（Netscape HTML 解析）', () => {
  it('Chrome 形态：根文件夹剔除、嵌套转路径、非 http 计入跳过、秒形 ADD_DATE 转 ISO', () => {
    const r = parseBookmarksHtml(CHROME_EXPORT)
    expect(r.entries).toHaveLength(4)
    const a1 = r.entries.find((e) => e.url === 'https://example.com/a1')!
    expect(a1.folders).toEqual(['AI'])
    expect(a1.title).toBe('一篇 AI 文章')
    expect(a1.addDate).toBe('2023-07-22T04:28:20.000Z')
    const top = r.entries.find((e) => e.url === 'https://example.com/top')!
    expect(top.folders).toEqual([]) // 「书签栏」根名剔除后无层
    expect(r.skipped).toBe(1) // chrome://settings
  })

  it('Firefox 形态：DT 后兄弟 DL 同样收敛；缺 ADD_DATE 为 null', () => {
    const r = parseBookmarksHtml(FIREFOX_EXPORT)
    expect(r.entries).toHaveLength(2)
    expect(r.entries.find((e) => e.url === 'https://tool.example.com/1')!.folders).toEqual(['工具'])
    expect(r.entries.find((e) => e.url === 'https://plain.example.com/')!.addDate).toBeNull()
  })

  it('无 DL 结构的普通网页返回空结果', () => {
    expect(parseBookmarksHtml('<html><body><p>不是书签文件</p></body></html>').entries).toHaveLength(0)
  })
})

describe('importBookmarks（去重与入库形态）', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('URL 全局去重：库内已有同址跳过、本批重复跳过；入库条目带来源/评分/文件夹标签', async () => {
    await putItem({
      id: 'itm_seed', sourceId: 's1', sourceName: '某源', url: 'https://example.com/a1',
      title: '已有条目', summary: '', fingerprint: 'fp_seed', eventGroup: null, publishedAt: null,
      fetchedAt: new Date().toISOString(), stage: 'scored',
      score: { total: 50, source: 10, novelty: 10, relevance: 20, utility: 10 }, scoreReason: '', aiBy: 'rules',
      tags: [], otFlag: null, expiresAt: null,
      annotation: { notes: '', vote: null, keepForever: false, linkedReviewId: null },
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), schemaVersion: 1,
    })
    const entries = parseBookmarksHtml(CHROME_EXPORT).entries
    // a1 与库内同址；末尾补一个批内重复（同址第二次出现）
    entries.push({ title: '重复书签二', url: 'https://example.com/dup', folders: [], addDate: null })
    const r = await importBookmarks(entries, DEFAULT_COLLECT_CONFIG)
    expect(r.imported).toBe(3) // a2 / top / dup（第一次出现）
    expect(r.skipped).toBe(2) // a1 库内同址 + dup 第二次出现
    const all = await db.items.toArray()
    const imported = all.filter((i) => i.sourceId === 'bookmark')
    expect(imported).toHaveLength(3)
    const dup = imported.filter((i) => i.url === 'https://example.com/dup')
    expect(dup).toHaveLength(1) // 批内重复只进一条
    const one = imported[0]!
    expect(one.sourceName).toBe('书签导入')
    expect(one.stage).toBe('scored')
    expect(one.score.total).toBeGreaterThan(0)
    expect(one.scoreReason).toContain('书签导入')
  })

  it('导入上限：超过 5000 条时余量计入跳过', async () => {
    const many = Array.from({ length: 5010 }, (_, i) => ({
      title: `条${i}`, url: `https://example.com/${i}`, folders: [], addDate: null,
    }))
    const r = await importBookmarks(many, DEFAULT_COLLECT_CONFIG)
    expect(r.imported).toBe(5000)
    expect(r.skipped).toBe(10)
  }, 30000)
})
