import type { ReactNode } from 'react'

/**
 * 文本中的键位 token 渲染为 kbd 药丸框（与快捷键表同款）。
 * split 带捕获组：奇数下标即命中的键位，避免误伤普通英文。
 */
const KEY_TOKEN = /\b(N|Ctrl K|Esc)\b/

export function KbdText({ text }: { text: string }): ReactNode {
  const parts = text.split(KEY_TOKEN)
  return parts.map((p, i) => (i % 2 === 1 ? <kbd key={i}>{p}</kbd> : <span key={i}>{p}</span>))
}
