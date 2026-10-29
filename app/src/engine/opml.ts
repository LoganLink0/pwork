/**
 * OPML 信源互导（0.3 数据主权批，2026-10-29）：RSS 阅读器通用格式，
 * 与既有 JSON 导入导出并存——离开 PWORK 也能把订阅带去 Feedly/Inoreader 等。
 * 解析用浏览器原生 DOMParser（平台 XML 解析器），导出用 DOM 构建 + XMLSerializer，
 * 转义由平台处理，不手拼 XML 字符串。
 */
import type { Source } from '../types/models'

export interface OpmlEntry {
  name: string
  url: string
}

const OPML_NS = ''

/** 导出为 OPML 2.0 文本（只导未删除的活跃源） */
export function sourcesToOpml(sources: Source[]): string {
  const doc = document.implementation.createDocument(OPML_NS, 'opml')
  const opml = doc.documentElement
  opml.setAttribute('version', '2.0')
  const head = doc.createElement('head')
  const title = doc.createElement('title')
  title.textContent = 'PWORK 信源'
  head.appendChild(title)
  opml.appendChild(head)
  const body = doc.createElement('body')
  for (const s of sources) {
    if (s.deletedAt != null) continue
    const outline = doc.createElement('outline')
    outline.setAttribute('type', 'rss')
    outline.setAttribute('text', s.name)
    outline.setAttribute('xmlUrl', s.url)
    body.appendChild(outline)
  }
  opml.appendChild(body)
  const serialized = new XMLSerializer().serializeToString(doc)
  return `<?xml version="1.0" encoding="UTF-8"?>\n${serialized}`
}

/** 从 OPML 文本解析信源（取所有带 xmlUrl 的 outline；非 http/https 地址跳过） */
export function parseOpml(text: string): OpmlEntry[] {
  const doc = new DOMParser().parseFromString(text, 'application/xml')
  if (doc.querySelector('parsererror')) throw new Error('不是合法的 OPML/XML 文件')
  const outlines = Array.from(doc.getElementsByTagName('outline'))
  const out: OpmlEntry[] = []
  for (const o of outlines) {
    const url = o.getAttribute('xmlUrl')?.trim()
    if (!url) continue
    if (!/^https?:\/\//i.test(url)) continue
    const name = o.getAttribute('text')?.trim() || o.getAttribute('title')?.trim() || url
    out.push({ name, url })
  }
  return out
}
