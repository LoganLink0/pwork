/**
 * 笔记应用数据导入（R1 批，2026-11-05）：flomo 导出 HTML、Notion 导出 zip（Markdown&CSV）、
 * Evernote/印象笔记 .enex——按扩展名分发统一入口，一律宽容提取为速记草稿，
 * 入库复用 markdownImport 的去重管线（按 body 全文去重）。
 * 格式依据（2026-11-05 官方文档查证）：flomo 官方导出为单个 HTML、内部结构未文档化→
 * 时间戳锚点切块的宽容提取；Notion 导出 zip 内 .md + 子页面文件夹 + .csv（CSV 数据库页
 * v1 跳过）；.enex 为公开 DTD 的 XML（note: title/created/updated/tag/content）。
 * JSZip 仅 Notion zip 需要（单 HTML/enex 用 DOMParser）——动态加载，避免 Settings 页
 * 静态依赖大库拖慢首页到设置的跳转加载（e2e 实测 chunk 加载超测试等待窗口）。
 */
import { importMarkdownNotes, parseMarkdownFiles, type MarkdownDraft, type MarkdownImportResult } from './markdownImport'

export interface ThirdpartyOutcome extends MarkdownImportResult {
  /** 实际命中的通道（flomo / notion / enex） */
  source: string
  /** 仅计数跳过的非笔记文件（如 Notion 的 CSV 与资源文件） */
  nonNoteFiles: number
}

/* ------------------------------ 块感知文本序列化（DOM → 保留换行的纯文本） ------------------------------ */

const BLOCK_TAGS = new Set(['DIV', 'P', 'LI', 'UL', 'OL', 'BR', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'TR', 'TABLE', 'BLOCKQUOTE', 'SECTION', 'ARTICLE', 'HEADER', 'FOOTER'])

function domToText(node: Node, out: string[]): void {
  // 文本与 CDATA 段（enex 的 en-note 内容以 CDATA 承载）都按字面文本收集
  if (node.nodeType === 3 || node.nodeType === 4) {
    out.push(node.textContent ?? '')
    return
  }
  if (node.nodeType !== 1) return
  const el = node as Element
  if (el.tagName === 'BR') {
    out.push('\n')
    return
  }
  const block = BLOCK_TAGS.has(el.tagName.toUpperCase()) // XML 模式下标签名保留原大小写
  if (block) out.push('\n')
  for (const child of el.childNodes) domToText(child, out)
  if (block) out.push('\n')
}

function textOf(el: Element): string {
  const out: string[] = []
  for (const child of el.childNodes) domToText(child, out)
  return out
    .join('')
    .replace(/[ \t\u00a0]+/g, ' ')
    .replace(/ ?\n ?/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/* ------------------------------ flomo（单个 HTML，时间戳锚点切块） ------------------------------ */

const TIME_RE = /\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(:\d{2})?/

export interface SimpleParseResult {
  drafts: MarkdownDraft[]
  skipped: number
}

/** flomo 导出 HTML：整页文本流按时间戳锚点切块，每块一条 memo；#标签入 tags */
export function parseFlomoHtml(html: string): SimpleParseResult {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const full = textOf(doc.body)
  if (!full) return { drafts: [], skipped: 0 }
  const stamps: { at: number; text: string }[] = []
  for (const m of full.matchAll(new RegExp(TIME_RE.source, 'g'))) {
    stamps.push({ at: m.index ?? 0, text: m[0] })
  }
  if (stamps.length === 0) return { drafts: [], skipped: 0 }
  const drafts: MarkdownDraft[] = []
  let skipped = 0
  for (let i = 0; i < stamps.length; i++) {
    const segStart = stamps[i]!.at + stamps[i]!.text.length
    const segEnd = i + 1 < stamps.length ? stamps[i + 1]!.at : full.length
    const raw = full.slice(segStart, segEnd).trim()
    if (!raw) {
      skipped++
      continue
    }
    drafts.push({ title: raw.split('\n')[0]!.slice(0, 60), body: raw, tags: extractInlineTags(raw) })
  }
  return { drafts, skipped }
}

/* ------------------------------ Evernote/印象笔记 .enex（公开 DTD 的 XML） ------------------------------ */

export function parseEnex(xml: string): SimpleParseResult {
  const doc = new DOMParser().parseFromString(xml, 'text/xml')
  const drafts: MarkdownDraft[] = []
  let skipped = 0
  for (const n of doc.querySelectorAll('note')) {
    // en-note 以 CDATA 承载且自带 XML 声明头——先剥声明，再当作 XML 二次解析出真实
    // 段落结构（div/p 是块元素，段落换行由此保留）；二次解析失败时回退原文本
    const raw = (n.querySelector('content')?.textContent ?? '').replace(/^<\?xml[^>]*\?>\s*/, '')
    let body = ''
    if (raw) {
      try {
        const inner = new DOMParser().parseFromString(raw, 'text/xml')
        const enNote = inner.querySelector('parsererror') ? null : inner.documentElement
        body = enNote ? textOf(enNote).trim() : raw.trim()
      } catch {
        body = raw.trim()
      }
    }
    if (!body) {
      skipped++
      continue
    }
    const title = (n.querySelector('title')?.textContent ?? '').trim()
    const tags = [...n.querySelectorAll('tag')]
      .map((t) => (t.textContent ?? '').trim())
      .filter(Boolean)
      .slice(0, 5)
    drafts.push({ title: title.slice(0, 80), body: body.slice(0, 50_000), tags })
  }
  return { drafts, skipped }
}

/* ------------------------------ Notion（zip：.md + 子文件夹 + .csv） ------------------------------ */

/** Notion 子页面文件夹名形如「页面名 + 32 位十六进制后缀」——标签里剥掉它 */
function cleanNotionSegment(seg: string): string {
  return seg.replace(/\s+[0-9a-f]{32}$/i, '').trim()
}

export async function parseNotionZip(file: File): Promise<SimpleParseResult & { nonNoteFiles: number }> {
  const { default: JSZip } = await import('jszip')
  const zip = await JSZip.loadAsync(await file.arrayBuffer())
  const files: { path: string; text: string }[] = []
  let nonNoteFiles = 0
  for (const [path, entry] of Object.entries(zip.files)) {
    if (entry.dir) continue
    if (!/\.md$/i.test(path)) {
      nonNoteFiles++
      continue
    }
    const segs = path.split(/[\\/]/).filter((s) => s && !s.endsWith('.md')).map(cleanNotionSegment)
    const cleanedPath = [...segs, path.split(/[\\/]/).pop() ?? ''].join('/')
    files.push({ path: cleanedPath, text: await entry.async('string') })
  }
  // CSV 数据库页 v1 跳过：nonNoteFiles 已含；md 交给宽容解析（空文件自行计 skipped）
  return { ...(await parseMarkdownFiles(files)), nonNoteFiles }
}

/* ------------------------------ 行内 #标签提取（与 markdownImport 同规则） ------------------------------ */

function extractInlineTags(text: string): string[] {
  const found = new Set<string>()
  for (const line of text.split('\n')) {
    if (/^#{1,6}\s/.test(line)) continue
    for (const m of line.matchAll(/(?:^|[\s(（【])#([\p{L}\p{N}_\/-]{1,24})/gu)) found.add(m[1]!)
  }
  return [...found].slice(0, 5)
}

/* ------------------------------ 统一入口（按扩展名分发） ------------------------------ */

/** 入库统一走 markdownImport 的去重管线；本函数只做解析与分发 */
export async function importNoteAppData(file: File): Promise<ThirdpartyOutcome> {
  const name = file.name.toLowerCase()
  let parsed: SimpleParseResult & { nonNoteFiles?: number }
  let source: string
  if (name.endsWith('.enex')) {
    parsed = parseEnex(await file.text())
    source = 'enex'
  } else if (name.endsWith('.zip')) {
    parsed = await parseNotionZip(file)
    source = 'notion'
  } else if (name.endsWith('.html') || name.endsWith('.htm')) {
    const html = await file.text()
    parsed = parseFlomoHtml(html)
    source = 'flomo'
  } else {
    throw new Error('不支持的文件类型——支持 flomo 导出的 HTML、Notion 导出的 zip、Evernote/印象笔记导出的 .enex')
  }
  const r = await importMarkdownNotes(parsed.drafts)
  return { ...r, source, nonNoteFiles: parsed.nonNoteFiles ?? 0 }
}
