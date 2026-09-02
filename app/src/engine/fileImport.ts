/**
 * 文件导入（外部数据 · 阶段二）：CSV/JSON → 数据块内容。
 * 零新依赖：CSV 按 RFC4180 子集手写解析（引号/转义引号/字段内逗号换行/CRLF）。
 * 落点原则：文件进来变成数据块（输入第三通道），报告/PPT 自动引用——不硬塞进为网页设计的条目库。
 */

/** 单行最多保留的字符数（超长截断，报告可读性优先） */
const MAX_LINE_CHARS = 400
/** 数据块最多保留的行数（数据块是片段不是全库导入） */
const MAX_LINES = 120

/** RFC4180 子集解析：双引号包裹、"" 转义、字段内逗号/换行、\r\n 与 \n */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false
  let i = 0
  const s = text.replace(/^\uFEFF/, '') // 去 BOM
  while (i < s.length) {
    const ch = s[i]!
    if (inQuotes) {
      if (ch === '"') {
        if (s[i + 1] === '"') {
          field += '"'
          i += 2
          continue
        }
        inQuotes = false
        i += 1
        continue
      }
      field += ch
      i += 1
      continue
    }
    if (ch === '"') {
      inQuotes = true
      i += 1
      continue
    }
    if (ch === ',') {
      row.push(field)
      field = ''
      i += 1
      continue
    }
    if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && s[i + 1] === '\n') i += 1
      row.push(field)
      field = ''
      if (row.length > 1 || row[0] !== '') rows.push(row)
      row = []
      i += 1
      continue
    }
    field += ch
    i += 1
  }
  row.push(field)
  if (row.length > 1 || row[0] !== '') rows.push(row)
  return rows
}

function clip(line: string): string {
  return line.length > MAX_LINE_CHARS ? line.slice(0, MAX_LINE_CHARS) + '…' : line
}

/** 一对"键: 值"行：各字段拼进一行，值里的换行变空格 */
function rowToLine(cells: string[], headers: string[] | null): string {
  const parts = cells.map((c, idx) => {
    const v = c.replace(/\s*\n\s*/g, ' ').trim()
    const h = headers?.[idx]
    return h ? `${h}: ${v}` : v
  })
  return clip(parts.filter(Boolean).join('，'))
}

/** CSV → 数据块内容：首行作表头，每行数据转 "表头: 值，表头: 值"；无表头（全空）退化为原样行 */
export function csvToBlockContent(text: string): { content: string; totalRows: number; truncated: boolean } {
  const rows = parseCsv(text).filter((r) => r.some((c) => c.trim() !== ''))
  if (rows.length === 0) return { content: '', totalRows: 0, truncated: false }
  const headers = rows[0]!.every((h) => h.trim() === '') ? null : rows[0]!.map((h) => h.trim())
  const dataRows = headers ? rows.slice(1) : rows
  const totalRows = dataRows.length
  const kept = dataRows.slice(0, MAX_LINES)
  const lines = kept.map((r) => rowToLine(r, headers))
  const truncated = totalRows > MAX_LINES
  if (truncated) lines.push(`（已截断：共 ${totalRows} 行，仅保留前 ${MAX_LINES} 行——数据块是片段，全量数据留在源系统）`)
  return { content: lines.join('\n'), totalRows, truncated }
}

/** JSON → 数据块内容：对象数组（每对象一行 k: v）；单对象（kv 行）；字符串数组（逐行） */
export function jsonToBlockContent(text: string): { content: string; totalRows: number; truncated: boolean } {
  const data = JSON.parse(text) as unknown
  if (Array.isArray(data)) {
    if (data.every((x) => typeof x === 'string')) {
      const lines = (data as string[]).slice(0, MAX_LINES).map((x) => clip(x.replace(/\s*\n\s*/g, ' ')))
      return { content: lines.join('\n'), totalRows: data.length, truncated: data.length > MAX_LINES }
    }
    const lines = (data as Record<string, unknown>[]).slice(0, MAX_LINES).map((obj) => {
      const kv = Object.entries(obj)
        .filter(([, v]) => v !== null && v !== undefined && v !== '')
        .map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : String(v)}`)
      return clip(kv.join('，'))
    })
    return { content: lines.join('\n'), totalRows: data.length, truncated: data.length > MAX_LINES }
  }
  if (data && typeof data === 'object') {
    const lines = Object.entries(data as Record<string, unknown>)
      .filter(([, v]) => v !== null && v !== undefined && v !== '')
      .map(([k, v]) => clip(`${k}: ${typeof v === 'object' ? JSON.stringify(v) : String(v)}`))
    return { content: lines.join('\n'), totalRows: lines.length, truncated: false }
  }
  throw new Error('JSON 需要是对象、对象数组或字符串数组')
}

/** 按扩展名分派：.json 走 JSON，.csv/.tsv 走 CSV；其余（.txt 等）按纯文本逐行——纯文本没有表头语义 */
export function fileToBlockContent(filename: string, text: string): { content: string; totalRows: number; truncated: boolean; note: string } {
  const lower = filename.toLowerCase()
  if (lower.endsWith('.json')) {
    const r = jsonToBlockContent(text)
    return { ...r, note: `已解析 JSON：${r.totalRows} 行${r.truncated ? '（截断）' : ''}` }
  }
  if (lower.endsWith('.csv') || lower.endsWith('.tsv')) {
    const r = csvToBlockContent(text)
    return { ...r, note: `已解析 CSV：${r.totalRows} 行${r.truncated ? '（截断）' : ''}` }
  }
  const lines = text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, MAX_LINES)
    .map(clip)
  return { content: lines.join('\n'), totalRows: lines.length, truncated: false, note: '按纯文本导入' }
}
