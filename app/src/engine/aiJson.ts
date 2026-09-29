/**
 * AI 输出 JSON 的统一提取与修复（AIHOT llm.ts 三层防线的移植，2026-09-29）：
 * ① 剥 markdown 围栏 → ② 定位首尾括号（容忍 JSON 前后的杂文）→ ③ 修复字符串字面量内的裸控制字符。
 * 第三层最容易被漏：模型在中文长文里偶发裸 \x0b/\x1f 等控制字符，JSON.parse 必炸，
 * 一次成功的付费调用就废了。所有吃 AI JSON 的解析器都应走这里。
 */

export function extractAiJson(text: string): string {
  const stripped = text.replace(/```(?:json)?/gi, '').trim()
  const start = stripped.search(/[[{]/)
  if (start < 0) throw new Error('AI 输出中没有 JSON')
  const end = Math.max(stripped.lastIndexOf('}'), stripped.lastIndexOf(']'))
  if (end <= start) throw new Error('AI 输出中没有完整的 JSON')
  return repairControlChars(stripped.slice(start, end + 1))
}

/** 字符串字面量内的裸控制字符（U+0000–U+001F）转义为 \uXXXX；字面量外（token 间空白）原样保留 */
export function repairControlChars(json: string): string {
  let out = ''
  let inString = false
  let escaped = false
  for (const ch of json) {
    if (escaped) {
      out += ch
      escaped = false
      continue
    }
    if (ch === '\\') {
      out += ch
      escaped = true
      continue
    }
    if (ch === '"') {
      inString = !inString
      out += ch
      continue
    }
    if (inString && ch.charCodeAt(0) < 0x20) {
      out += `\\u${ch.charCodeAt(0).toString(16).padStart(4, '0')}`
      continue
    }
    out += ch
  }
  return out
}

export function parseAiJson<T>(text: string): T {
  return JSON.parse(extractAiJson(text)) as T
}
