/**
 * 浏览器书签导入（R1 批，2026-11-04）：Chrome / Edge / Firefox「导出书签」的
 * Netscape HTML 格式 → 条目库。解析走平台 DOMParser（成熟解析器，非法嵌套自动容错），
 * 文件夹路径转标签；按网址全局去重（库内已有任意阶段条目 + 本批内重复书签）。
 *
 * 与「链接捕获」同型：手动导入即明确意图，跳过预筛、按规则评分直接入 scored 层。
 * 入库时间统一取导入时刻——各浏览器 ADD_DATE 单位不一（秒/微秒/缺失），v1 不带入，
 * 避免把不可靠时间写进发布/入库语义；条目库、检索、导出都即时可见。
 */
import { putItem } from '../db/collect'
import { newId } from '../db/repo'
import { fingerprintOf } from './fingerprint'
import { scoreByRules } from './rules'
import type { CollectConfig, Item, Source } from '../types/models'

/** 顶层根文件夹名（各浏览器中英文），转标签时剔除——它只是浏览器分区，无语义 */
const ROOT_NAMES = new Set([
  '书签栏', '书签工具栏', '书签菜单', '其他书签', '收藏夹栏', '其他收藏夹', '收藏栏',
  'bookmarks bar', 'bookmarks toolbar', 'bookmarks menu', 'other bookmarks', 'favorites bar', 'other favorites', 'favorites',
])

export interface BookmarkEntry {
  title: string
  url: string
  /** 从根到所在处的文件夹名（顶层根文件夹已剔除；最多保留 5 层转标签） */
  folders: string[]
  /** Netscape ADD_DATE 转 ISO（秒形）；缺失或非秒形返回 null */
  addDate: string | null
}

export interface ParseResult {
  entries: BookmarkEntry[]
  /** 非 http(s) 链接数（chrome:// 、javascript: 等不出库的） */
  skipped: number
}

/** 解析 Netscape 书签 HTML：文件夹递归收集，链接提取标题/网址/时间 */
export function parseBookmarksHtml(html: string): ParseResult {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const entries: BookmarkEntry[] = []
  let skipped = 0
  const walk = (dl: Element, folders: string[]) => {
    const children = [...dl.children]
    for (let i = 0; i < children.length; i++) {
      const dt = children[i]
      if (dt.tagName !== 'DT') continue
      const h3 = dt.querySelector('h3')
      // 嵌套 DL：多数导出在 DT 内部（解析器容错嵌套）；个别在 DT 之后作兄弟节点
      const innerDl = dt.querySelector('dl')
      const siblingDl = children[i + 1] && children[i + 1].tagName === 'DL' ? children[i + 1] : null
      if (h3) {
        const name = (h3.textContent ?? '').trim()
        // 顶层根文件夹只是浏览器分区名，不带进标签；再往下的文件夹有语义
        const next = folders.length === 0 && ROOT_NAMES.has(name.toLowerCase()) ? folders : [...folders, name]
        if (innerDl) walk(innerDl, next)
        if (siblingDl) walk(siblingDl, next)
        if (siblingDl) i++ // 已消费兄弟 DL，外层跳过
        continue
      }
      const a = dt.querySelector('a')
      if (!a) continue
      const url = (a.getAttribute('href') ?? '').trim()
      if (!/^https?:\/\//i.test(url)) {
        skipped++
        continue
      }
      const addRaw = (a.getAttribute('add_date') ?? '').trim()
      const addDate = /^\d{9,10}$/.test(addRaw) ? new Date(Number(addRaw) * 1000).toISOString() : null
      entries.push({ title: (a.textContent ?? '').trim() || url, url, folders, addDate })
    }
  }
  const root = doc.querySelector('dl')
  if (!root) return { entries: [], skipped: 0 }
  walk(root, [])
  return { entries, skipped }
}

/** 虚拟来源：书签导入不属于任何订阅，权重取 T1.5 档（用户主动保存，置信高于普通信源） */
function virtualSource(): Source {
  const now = new Date().toISOString()
  return {
    id: 'bookmark', name: '书签导入', url: '', domain: 'other', tier: 1.5, weight: 0.7, active: true,
    kind: 'rss', checkEvery: 'daily', health: { failStreak: 0, lastOkAt: null, lastError: null },
    createdAt: now, updatedAt: now, deletedAt: null, schemaVersion: 1,
  }
}

/** 单条上限保护：一次导入最多入库 5000 条，防超大书签库一次性拖垮导入 */
const IMPORT_CAP = 5000

export interface ImportResult {
  imported: number
  /** 库内已有同址或本批内重复的书签数 */
  skipped: number
}

/** 书签导入入库：URL 全局去重（库内任意阶段条目 + 本批内），按规则评分入 scored 层 */
export async function importBookmarks(
  entries: BookmarkEntry[],
  config: CollectConfig,
): Promise<ImportResult> {
  const { db } = await import('../db/schema')
  const all = await db.items.toArray()
  const seen = new Set(all.map((i) => i.url))
  const source = virtualSource()
  const now = new Date().toISOString()
  let imported = 0
  let skipped = 0
  for (const e of entries) {
    if (!e.url || seen.has(e.url)) {
      skipped++
      continue
    }
    if (imported >= IMPORT_CAP) {
      skipped += entries.length - imported - skipped
      break
    }
    seen.add(e.url)
    const { score, reason } = scoreByRules({
      source,
      title: e.title,
      summary: '',
      domainCountToday: 0,
      config,
    })
    const item: Item = {
      id: newId('itm'),
      sourceId: 'bookmark',
      sourceName: '书签导入',
      url: e.url,
      title: e.title,
      summary: '',
      fingerprint: fingerprintOf(e.url, e.title),
      eventGroup: null,
      publishedAt: null,
      fetchedAt: now,
      stage: 'scored',
      score,
      scoreReason: `书签导入 · ${reason}`,
      aiBy: 'rules',
      tags: e.folders.slice(0, 5),
      otFlag: null,
      expiresAt: null, // scored 为 Curated 层，无 TTL
      annotation: { notes: '', vote: null, keepForever: false, linkedReviewId: null },
      createdAt: now,
      updatedAt: now,
      schemaVersion: 1,
    }
    await putItem(item)
    imported++
  }
  return { imported, skipped }
}
