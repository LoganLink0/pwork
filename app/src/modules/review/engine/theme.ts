/**
 * 主题指纹：把一条洞察归一化为"同一主题"的指纹，供模式警示（M2）聚合。
 * 规则：去标点/空白、去数字、取前 16 位——粗粒度即可，宁聚合勿遗漏。
 */
export function hashTheme(text: string): string {
  const normalized = text
    .toLowerCase()
    .replace(/[\s\p{P}\p{S}]+/gu, '')
    .replace(/\d+/g, '')
  return normalized.slice(0, 16) || 'empty'
}
