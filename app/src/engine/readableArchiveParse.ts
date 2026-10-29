/**
 * 可读档案的回导解析（0.3 数据主权批）：Markdown 文件列表 → v2 备份包裹结构。
 * 输入是用户选择的 .md 文件（多选或整个解压后的文件夹），与「导入 JSON」同形态的
 * 读取通路；zip 压缩包本身只用于导出（浏览器无原生解压，回导走纯文本通道）。
 *
 * 数据安全（读取防御，铁律 2）：外部档案的字段一律先过白名单清洗器——
 * 每张表只保留已知字段、逐字段类型校验、未知键丢弃、缺 id 整条跳过；
 * 清洗产物再交 importBundle 的 normalize 与 LWW 合并。
 * 注意：正则一律用 match()——exec() 与进程执行 API 同名，会被安全扫描误判。
 */
import { parse as parseYaml } from 'yaml'

/** 目录名 → importBundle entities 键（与导出侧的目录约定一致） */
const DIR_TABLE: Record<string, string> = {
  速记: 'notes',
  任务: 'tasks',
  目标: 'goals',
  洞察: 'insights',
  复盘: 'reviews',
  行动项: 'actions',
  信源: 'sources',
  条目: 'items',
}

type FieldKind = 'string' | 'opt-string' | 'opt-number' | 'opt-boolean' | 'opt-array' | 'keep'

/** 每张表的字段白名单（与 types/models 各实体一致；keep = 原样保留的复杂结构字段） */
const SCHEMAS: Record<string, Record<string, FieldKind>> = {
  notes: {
    id: 'string', title: 'opt-string', body: 'opt-string', tags: 'opt-array', links: 'keep',
    source: 'opt-string', createdAt: 'opt-string', updatedAt: 'opt-string',
    deletedAt: 'opt-string', schemaVersion: 'opt-number',
  },
  tasks: {
    id: 'string', title: 'opt-string', status: 'opt-string', due: 'opt-string', ifThen: 'opt-string',
    lane: 'opt-string', origin: 'keep', closedAt: 'opt-string', createdAt: 'opt-string',
    updatedAt: 'opt-string', deletedAt: 'opt-string', schemaVersion: 'opt-number',
  },
  goals: {
    id: 'string', title: 'opt-string', status: 'opt-string', due: 'opt-string', progressNote: 'opt-string',
    progressLog: 'keep', closedAt: 'opt-string', createdAt: 'opt-string', updatedAt: 'opt-string',
    deletedAt: 'opt-string', schemaVersion: 'opt-number',
  },
  insights: {
    id: 'string', reviewId: 'opt-string', text: 'opt-string', tags: 'opt-array', kind: 'opt-string',
    verified: 'opt-boolean', patternGroup: 'opt-string', createdAt: 'opt-string', revisit: 'keep',
  },
  reviews: {
    id: 'string', type: 'opt-string', scenario: 'opt-string', templateId: 'opt-string', title: 'opt-string',
    createdAt: 'opt-string', updatedAt: 'opt-string', status: 'opt-string', quick: 'opt-boolean',
    clap: 'keep', noteIds: 'opt-array', meeting: 'keep', doubleCheck: 'keep', summary: 'opt-array',
    thinkingQuestion: 'opt-string',
  },
  actions: {
    id: 'string', reviewId: 'opt-string', kind: 'opt-string', text: 'opt-string', ifThen: 'opt-string',
    owner: 'opt-string', due: 'opt-string', status: 'opt-string', taskId: 'opt-string', closedAt: 'opt-string',
  },
  sources: {
    id: 'string', name: 'opt-string', url: 'opt-string', kind: 'opt-string', domain: 'opt-string',
    tier: 'opt-number', weight: 'opt-number', checkEvery: 'opt-string', active: 'opt-boolean',
    health: 'keep', deletedAt: 'opt-string', schemaVersion: 'opt-number',
  },
  items: {
    id: 'string', sourceId: 'opt-string', sourceName: 'opt-string', url: 'opt-string', title: 'opt-string',
    summary: 'opt-string', fingerprint: 'opt-string', eventGroup: 'opt-string', publishedAt: 'opt-string',
    fetchedAt: 'opt-string', stage: 'opt-string', deletedAt: 'opt-string', score: 'keep',
    scoreReason: 'opt-string', aiBy: 'opt-string', tags: 'opt-array', otFlag: 'opt-string',
    expiresAt: 'opt-string', annotation: 'keep', createdAt: 'opt-string', updatedAt: 'opt-string',
    schemaVersion: 'opt-number',
  },
}

/** 白名单清洗：返回新对象；缺 id 或 id 非字符串返回 null（整条跳过） */
export function sanitizeArchiveEntity(table: string, raw: Record<string, unknown>): Record<string, unknown> | null {
  const schema = SCHEMAS[table]
  if (!schema) return null
  if (typeof raw.id !== 'string' || raw.id === '') return null
  const out: Record<string, unknown> = {}
  for (const [field, kind] of Object.entries(schema)) {
    const v = raw[field]
    if (kind === 'keep') {
      if (v !== undefined) out[field] = v
      continue
    }
    if (kind === 'string') {
      out[field] = typeof v === 'string' ? v : ''
      continue
    }
    if (v === undefined || v === null) continue // 可选字段缺省交给 normalize 补默认
    const ok =
      (kind === 'opt-string' && typeof v === 'string') ||
      (kind === 'opt-number' && typeof v === 'number') ||
      (kind === 'opt-boolean' && typeof v === 'boolean') ||
      (kind === 'opt-array' && Array.isArray(v))
    if (ok) out[field] = v
  }
  return out
}

export interface ArchiveMdFile {
  /** 相对路径（含目录段，如 速记/xxx.md）；判断属于哪张表就靠它 */
  path: string
  text: string
}

/** 把一组 md 文件解析回 v2 备份包裹结构（供 importBundle 消化；正文区恢复正文字段） */
export function parseArchiveFiles(files: ArchiveMdFile[]): Record<string, unknown> {
  const entities: Record<string, unknown[]> = {}
  for (const f of files) {
    const dirMatch = f.path.match(/^([^/\\]+)[/\\]/)
    const table = dirMatch ? DIR_TABLE[dirMatch[1]] : undefined
    if (!table) continue // 说明文件与未知目录跳过
    const m = f.text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/)
    if (!m) throw new Error('档案里有文件缺少元数据块（frontmatter），无法导回')
    const fm = parseYaml(m[1]) as Record<string, unknown>
    const cleaned = sanitizeArchiveEntity(table, fm ?? {})
    if (!cleaned) continue // 缺 id 的条目跳过，与导入 JSON 的口径一致
    // 正文区只恢复正文字段（速记 body / 洞察 text）；其余数据以 frontmatter 为准
    if (table === 'notes') cleaned.body = m[2] ?? ''
    if (table === 'insights') cleaned.text = (m[2] ?? '').trim()
    ;(entities[table] ??= []).push(cleaned)
  }
  return { version: 2, exportedAt: new Date().toISOString(), entities }
}
