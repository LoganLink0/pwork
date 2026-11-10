/**
 * Markdown 文件夹宽容导入（R1 批，2026-11-05）：Obsidian / Logseq / 思源导出的
 * md 文件夹 → 速记。宽容 = 不要求 PWORK frontmatter：任意 .md 都收，标题取
 * frontmatter title → H1 → 首行，标签取 frontmatter tags → 行内 #标签（去重、≤5 个），
 * 相对路径文件夹段转标签。正文原样进速记 body（Markdown 进 Markdown，零损失）。
 * 与「可读档案回导」分工：那条要求 PWORK frontmatter 的严格格式；本条对任意库宽容。
 */
import { db } from '../../../db/schema'
import { newId, deriveTitle } from '../../../db/repo'
import type { Note } from '../../../types/models'

/** 单次导入上限（与书签导入同口径） */
const IMPORT_CAP = 5000
/** 单文件正文上限：超长 md（多为导出异常或二进制误判）跳过计数 */
const MAX_FILE_CHARS = 500_000
/** 正文超过 5 万字符的文件照常导入但截断（速记非文档库，超长内容提示用户用原文件） */
const BODY_TRUNCATE = 50_000

export interface MarkdownDraft {
  title: string
  body: string
  tags: string[]
}

export interface MarkdownParseResult {
  drafts: MarkdownDraft[]
  /** 非 .md / 超长 / 空文件 */
  skipped: number
}

export interface MarkdownImportResult {
  imported: number
  /** 库内同内容或本批内重复 */
  duplicates: number
  skipped: number
}

interface FrontmatterLite {
  title?: string
  tags?: string[]
}

/** 宽容 frontmatter 提取：仅认 title 与 tags（字符串或数组），其余字段忽略；解析失败当无元数据。
 *  yaml 库动态加载——md 导入是低频操作，不值得让 yaml 进 Settings 页的首载依赖链 */
async function extractFrontmatter(text: string): Promise<{ meta: FrontmatterLite; rest: string }> {
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/)
  if (!m) return { meta: {}, rest: text }
  try {
    const { parse: parseYaml } = await import('yaml')
    const parsed = parseYaml(m[1]) as Record<string, unknown> | null
    if (!parsed || typeof parsed !== 'object') return { meta: {}, rest: text.slice(m[0].length) }
    const meta: FrontmatterLite = {}
    if (typeof parsed.title === 'string' && parsed.title.trim()) meta.title = parsed.title.trim()
    if (Array.isArray(parsed.tags)) meta.tags = parsed.tags.filter((t): t is string => typeof t === 'string' && t.trim() !== '').map((t) => t.trim())
    else if (typeof parsed.tags === 'string' && parsed.tags.trim())
      meta.tags = parsed.tags.split(/[\s,，#]+/).map((t) => t.trim()).filter(Boolean)
    return { meta, rest: text.slice(m[0].length) }
  } catch {
    return { meta: {}, rest: text }
  }
}

/** 行内 #标签：行首或空白后的 #标签（排除标题行的 # 与 URL 中的 #） */
function inlineTags(text: string): string[] {
  const found = new Set<string>()
  for (const line of text.split('\n')) {
    if (/^#{1,6}\s/.test(line)) continue // Markdown 标题不是标签
    for (const m of line.matchAll(/(?:^|[\s(（【])#([\p{L}\p{N}_\/-]{1,24})/gu)) found.add(m[1]!)
  }
  return [...found].slice(0, 5)
}

/** 文件（含相对路径）→ 速记草稿；返回 null 表示该文件跳过 */
async function parseMarkdownFile(path: string, text: string, rootLabel: string): Promise<MarkdownDraft | null> {
  if (text.length > MAX_FILE_CHARS) return null
  const trimmed = text.trim()
  if (!trimmed) return null
  const { meta, rest } = await extractFrontmatter(text)
  const body = rest.trim() ? rest.trimEnd() : (text.trim() || trimmed)
  // 标题：frontmatter title → H1 → 首行非空行
  let title = meta.title ?? ''
  if (!title) {
    const h1 = rest.match(/^#\s+(.+)$/m)
    if (h1) title = h1[1]!.trim().slice(0, 60)
  }
  const tags = [...new Set([...(meta.tags ?? []), ...inlineTags(rest), ...path.split(/[\\/]/).slice(0, -1).filter((seg) => seg && seg !== rootLabel)])].slice(0, 5)
  return { title: (title || deriveTitle(body) || '导入笔记').slice(0, 80), body: body.length > BODY_TRUNCATE ? `${body.slice(0, BODY_TRUNCATE)}\n\n（内容过长，已截断——原文见你的 Markdown 库）` : body, tags }
}

/** 解析一组 md 文件（相对路径携带文件夹层级） */
export async function parseMarkdownFiles(files: { path: string; text: string }[], rootLabel = ''): Promise<MarkdownParseResult> {
  const drafts: MarkdownDraft[] = []
  let skipped = 0
  for (const f of files) {
    const base = f.path.split(/[\\/]/).pop() ?? ''
    if (!/\.md$/i.test(base)) {
      skipped++
      continue
    }
    const d = await parseMarkdownFile(f.path, f.text, rootLabel)
    if (!d) {
      skipped++
      continue
    }
    drafts.push(d)
  }
  return { drafts, skipped }
}

/** 入库：按 body 全文去重（库内 + 批内），上限保护；直接写 notes 表（导入即明确意图） */
export async function importMarkdownNotes(drafts: MarkdownDraft[]): Promise<MarkdownImportResult> {
  const all = await db.notes.toArray()
  const seen = new Set(all.map((n) => n.body))
  const now = new Date().toISOString()
  let imported = 0
  let duplicates = 0
  let skipped = 0
  for (const d of drafts) {
    if (d.body && seen.has(d.body)) {
      duplicates++
      continue
    }
    if (imported >= IMPORT_CAP) {
      skipped += drafts.length - imported - duplicates
      break
    }
    seen.add(d.body)
    const note: Note = {
      id: newId('note'),
      title: d.title,
      body: d.body,
      tags: d.tags,
      links: { itemIds: [], reviewIds: [], taskIds: [] },
      source: 'manual',
      attachments: [],
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
      schemaVersion: 1,
    }
    await db.notes.put(note)
    imported++
  }
  return { imported, duplicates, skipped }
}
