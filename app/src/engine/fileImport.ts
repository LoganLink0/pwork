/**
 * 文件导入（外部数据 · 阶段二）：CSV/TSV/JSON → 数据块内容。
 * CSV/TSV 用 papaparse 解析（RFC4180 完整实现，含引号/转义/字段内换行；TSV 走 tab 分隔）。
 * 落点原则：文件进来变成数据块（输入第三通道），报告/PPT 自动引用——不硬塞进为网页设计的条目库。
 */
import Papa from 'papaparse'

/** 单行最多保留的字符数（超长截断，报告可读性优先） */
const MAX_LINE_CHARS = 400
/** 数据块最多保留的行数（数据块是片段不是全库导入） */
const MAX_LINES = 120

/** CSV/TSV 解析：返回非全空行（Papa 处理引号/CRLF/BOM） */
export function parseCsv(text: string, delimiter: ',' | '\t' = ','): string[][] {
  const r = Papa.parse<string[]>(text.replace(/^\uFEFF/, ''), {
    delimiter,
    skipEmptyLines: 'greedy',
  })
  return (r.data ?? []).map((row) => row.map((c) => String(c ?? '')))
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

/** CSV/TSV → 数据块内容：首行作表头，每行数据转 "表头: 值，表头: 值"；无表头（全空）退化为原样行 */
export function csvToBlockContent(text: string, delimiter: ',' | '\t' = ','): { content: string; totalRows: number; truncated: boolean } {
  const rows = parseCsv(text, delimiter).filter((r) => r.some((c) => c.trim() !== ''))
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
  if (lower.endsWith('.csv')) {
    const r = csvToBlockContent(text)
    return { ...r, note: `已解析 CSV：${r.totalRows} 行${r.truncated ? '（截断）' : ''}` }
  }
  if (lower.endsWith('.tsv')) {
    const r = csvToBlockContent(text, '\t')
    return { ...r, note: `已解析 TSV：${r.totalRows} 行${r.truncated ? '（截断）' : ''}` }
  }
  const lines = text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, MAX_LINES)
    .map(clip)
  return { content: lines.join('\n'), totalRows: lines.length, truncated: false, note: '按纯文本导入' }
}
