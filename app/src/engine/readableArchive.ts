/**
 * 全库人类可读导出与回导（0.3 数据主权批，2026-10-29）。
 *
 * 与备份包裹的分工：JSON 备份面向"丢库后原样恢复"（机器对机器），
 * 这套面向"带走"——zip 里每个实体一个 Markdown 文件（frontmatter 元数据 +
 * 正文），任何编辑器/Obsidian 直接可读；同一格式可原样导回（导出格式即迁移格式）。
 *
 * 无损约定：速记正文与洞察正文放 Markdown 正文区（Obsidian 阅读友好），
 * 其余字段全部在 frontmatter；回导时正文区只用于恢复正文/正文字段，
 * 其余数据一律以 frontmatter 为准——roundtrip 测试锁字段全等。
 */
import JSZip from 'jszip'
import { stringify as stringifyYaml } from 'yaml'
import type { Goal, Item, Note, Source, TaskItem } from '../types/models'
import type { ActionItem, InsightRecord, ReviewRecord } from '../modules/review/types/models'

export interface ArchiveInput {
  notes: Note[]
  tasks: TaskItem[]
  goals: Goal[]
  insights: InsightRecord[]
  reviews: ReviewRecord[]
  actions: ActionItem[]
  sources: Source[]
  items: Item[]
}

/** 文件名安全化：路径/保留字符与空白折成连字符，截 40 字 */
function safeName(s: string): string {
  const cleaned = s.replace(/[\\/:*?"<>|#]+/g, '-').replace(/\s+/g, ' ').trim()
  return (cleaned || '未命名').slice(0, 40)
}

const idTag = (id: string) => id.slice(-8)

function mdFile(frontmatter: object, body: string): string {
  return `---\n${stringifyYaml(frontmatter)}---\n${body}`
}

/** 正文区只放正文本身——回导时正文区会原样恢复为 body，不能混入标题等其他内容 */
function noteBody(n: Note): string {
  return n.body
}

function taskBody(t: TaskItem): string {
  const due = t.due ?? '无期限'
  const status = t.status === 'done' ? '已完成' : t.status === 'dropped' ? '已搁置' : '进行中'
  return `# ${t.title}\n\n- 期限：${due}\n- 状态：${status}${t.ifThen ? `\n- 执行意图：${t.ifThen}` : ''}\n`
}

function goalBody(g: Goal): string {
  const lines = [`# ${g.title}`, '', `- 状态：${g.status === 'active' ? '进行中' : g.status === 'done' ? '已达成' : '已放弃'}`]
  if (g.due) lines.push(`- 期限：${g.due}`)
  if (g.progressLog?.length) lines.push('', '## 进度轨迹', ...g.progressLog.map((p) => `- ${p.at} ${p.note}`))
  return lines.join('\n')
}

function reviewBody(r: ReviewRecord): string {
  return [`# ${r.title}`, '', ...r.summary.map((s) => `- ${s}`)].join('\n')
}

function itemBody(i: Item): string {
  const lines = [`# ${i.title}`, '', `- 来源：${i.sourceName}`, `- 链接：${i.url}`]
  if (i.summary) lines.push('', i.summary)
  if (i.annotation?.notes) lines.push('', `> 批注：${i.annotation.notes}`)
  return lines.join('\n')
}

/** 单条记录 → { 文件相对路径, Markdown 内容 }；archive（zip）与 vault 镜像共用同一格式（防漂移） */
export function recordMarkdown(table: string, raw: unknown): { file: string; content: string } | null {
  switch (table) {
    case 'notes': {
      const n = raw as Note
      return { file: `速记/${safeName(n.title || n.body.slice(0, 20))}-${idTag(n.id)}.md`, content: mdFile({ ...n, body: undefined }, noteBody(n)) }
    }
    case 'tasks': {
      const t = raw as TaskItem
      return { file: `任务/${t.due ?? '无期限'}-${safeName(t.title)}-${idTag(t.id)}.md`, content: mdFile(t, taskBody(t)) }
    }
    case 'goals': {
      const g = raw as Goal
      return { file: `目标/${safeName(g.title)}-${idTag(g.id)}.md`, content: mdFile(g, goalBody(g)) }
    }
    case 'insights': {
      const i = raw as InsightRecord
      return { file: `洞察/${i.createdAt.slice(0, 10)}-${idTag(i.id)}.md`, content: mdFile({ ...i, text: undefined }, i.text) }
    }
    case 'reviews': {
      const r = raw as ReviewRecord
      return { file: `复盘/${r.createdAt.slice(0, 10)}-${safeName(r.title)}-${idTag(r.id)}.md`, content: mdFile(r, reviewBody(r)) }
    }
    case 'actions': {
      const a = raw as ActionItem
      return { file: `行动项/${a.status}-${safeName(a.text.slice(0, 30))}-${idTag(a.id)}.md`, content: mdFile(a, `# ${a.text}\n`) }
    }
    case 'sources': {
      const s = raw as Source
      return { file: `信源/${safeName(s.name)}-${idTag(s.id)}.md`, content: mdFile(s, `# ${s.name}\n\n${s.url}\n`) }
    }
    case 'items': {
      const i = raw as Item
      return { file: `条目/${(i.fetchedAt ?? i.createdAt).slice(0, 10)}-${safeName(i.title)}-${idTag(i.id)}.md`, content: mdFile(i, itemBody(i)) }
    }
    default:
      return null
  }
}

/** 导出为 zip（Uint8Array，调用方负责落盘/下载） */
export async function buildReadableArchive(data: ArchiveInput): Promise<Uint8Array> {
  const zip = new JSZip()
  zip.file('README.md', [
    '# PWORK 可读档案', '',
    `导出时间：${new Date().toISOString()}`, '',
    '每个文件 = 一条数据：头部元数据块（frontmatter）保存全部字段，正文供人阅读。', '',
    '导回方法：设置 → 数据 → 导入可读档案，选择本压缩包即可；相同内容按修改时间新者为准。',
    '本档案覆盖速记/任务/目标/洞察/复盘/行动项/信源/条目；采集偏好与外部数据块在「全量导出」的 JSON 备份里。',
  ].join('\n'))
  for (const [table, rows] of Object.entries(data)) {
    for (const row of rows) {
      const md = recordMarkdown(table, row)
      if (md) zip.file(md.file, md.content)
    }
  }
  return zip.generateAsync({ type: 'uint8array' })
}
