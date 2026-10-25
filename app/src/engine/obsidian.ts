/**
 * Obsidian 日报导出（04 §6.2 格式，C1/C2 单向：本地生成 md，用户粘贴/下载到 vault）。
 * 字段所有权：状态/评分归工作台，批注/星级归 vault——双向同步按所有权合并（C3/Tauri 后双向）。
 */
import type { Item } from '../types/models'
import { fmtLocal } from './datetime'

const OT_MARK: Record<NonNullable<Item['otFlag']>, string> = {
  opportunity: '🎯机会',
  threat: '⚠威胁',
  trend: '📈趋势',
}

/** YAML 列表项：源名含逗号/方括号会破坏 frontmatter 结构，包引号防拆 */
const yamlStr = (s: string) => `"${s.replace(/"/g, '\\"')}"`

/** md 链接文本与 URL 的最小转义：中括号拆链接、圆括号拆地址 */
const mdText = (s: string) => s.replace(/\[/g, '\\[').replace(/\]/g, '\\]')
const mdUrl = (s: string) => s.replace(/[()]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0')}`)

/** 生成 vault 日报 md（`信息日报/YYYY-MM-DD.md`） */
export function obsidianDaily(itemList: Item[], dateLocal: string): string {
  const sources = [...new Set(itemList.map((i) => i.sourceName))]
  const lines: string[] = [
    '---',
    `date: ${dateLocal}`,
    `count: ${itemList.length}`,
    `sources: [${sources.map(yamlStr).join(', ')}]`,
    '---',
    '',
  ]
  if (itemList.length === 0) {
    lines.push('> 今日无条目。', '')
    return lines.join('\n')
  }
  itemList.forEach((it, i) => {
    const ot = it.otFlag ? ` ｜ ${OT_MARK[it.otFlag]}` : ''
    const url = /^https?:\/\//i.test(it.url) ? it.url : ''
    lines.push(url ? `### ${i + 1}. [${mdText(it.title)}](${mdUrl(url)})` : `### ${i + 1}. ${mdText(it.title)}`)
    lines.push(`来源：${it.sourceName} ｜ ${it.tags.map((t) => `#${t}`).join(' ')}${ot}`)
    if (it.summary) lines.push(it.summary)
    lines.push(`> 我的想法：`)
    lines.push('')
  })
  lines.push('---')
  lines.push(`*导出自 PWORK · ${fmtLocal(new Date().toISOString())}*`)
  return lines.join('\n')
}
