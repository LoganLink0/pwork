/**
 * 规则评分（与 app engine/rules.ts 同公式同维度；worker 侧独立实现，零共享依赖）。
 * C2 云端的降级链：LLM 失败/熔断 → 本文件照常分发（aiBy='rules'，04 §5）。
 * 所有评分附 ≤30 字理由（可解释性红线）。
 */

export interface WorkerSource {
  id: string
  name: string
  url: string
  domain: string
  tier: number
  weight: number
  active: number
}

export interface RuleScore {
  total: number
  source: number
  novelty: number
  relevance: number
  utility: number
  reason: string
  tags: string[]
}

const UTILITY_WORDS = ['开源', '发布', '教程', '实践', '工具', '方法论', '案例', '复盘', '免费', 'api', '模板']

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n))
}

export function hitInterests(text: string, interests: string[]): string[] {
  const lower = text.toLowerCase()
  return interests.filter((i) => i.trim() && lower.includes(i.trim().toLowerCase()))
}

export function prefilterByRules(title: string, summary: string, dislikes: string[]): { pass: boolean; reason: string } {
  const text = `${title} ${summary}`.toLowerCase()
  const hit = dislikes.find((d) => d.trim() && text.includes(d.trim().toLowerCase()))
  if (hit) return { pass: false, reason: `命中屏蔽词「${hit}」` }
  if (title.replace(/\s+/g, '').length < 6) return { pass: false, reason: '标题过短' }
  return { pass: true, reason: '' }
}

export function scoreByRules(
  source: WorkerSource,
  title: string,
  summary: string,
  domainCountToday: number,
  interests: string[],
): RuleScore {
  const text = `${title} ${summary}`
  const s = clamp01(source.weight)
  const novelty = domainCountToday >= 5 ? 0.6 : 1
  const hits = hitInterests(text, interests)
  const relevance = hits.length === 0 ? 0.2 : clamp01(0.34 * hits.length)
  const lower = text.toLowerCase()
  const utilityHits = UTILITY_WORDS.filter((w) => lower.includes(w)).length
  const utility = utilityHits === 0 ? 0.3 : clamp01(0.4 + 0.3 * (utilityHits - 1))
  const total = Math.round(100 * (0.3 * s + 0.25 * novelty + 0.25 * relevance + 0.2 * utility))
  const parts = [
    `源${s.toFixed(1)}`,
    novelty === 1 ? '新信息' : '同域密集',
    hits.length ? `兴趣×${hits.length}` : '兴趣弱',
    utilityHits ? `工具×${utilityHits}` : null,
  ].filter((p): p is string => p !== null)
  return {
    total,
    source: s,
    novelty,
    relevance,
    utility,
    reason: parts.join('·').slice(0, 30),
    tags: [...new Set([...hits, source.domain])].slice(0, 5),
  }
}

/** fingerprint：与 app engine/fingerprint.ts 同逻辑（规范化 URL + 归一化标题，FNV-1a） */
export function normalizeUrl(raw: string): string {
  let url = raw.trim()
  try {
    const u = new URL(url)
    const drop: string[] = []
    u.searchParams.forEach((_v, k) => {
      if (/^(utm_|spm|from|ref|source|share_|tt_)/i.test(k)) drop.push(k)
    })
    drop.forEach((k) => u.searchParams.delete(k))
    u.protocol = 'https:'
    u.hostname = u.hostname.toLowerCase()
    if (u.pathname.length > 1 && u.pathname.endsWith('/')) u.pathname = u.pathname.slice(0, -1)
    url = u.toString()
  } catch {
    url = url.replace(/\s+/g, '')
  }
  return url
}

export function normalizeTitle(title: string): string {
  return title
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\s\u3000]+/g, '')
    .replace(/[\p{P}\p{S}]+/gu, '')
    .slice(0, 80)
}

function hash(s: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0).toString(36)
}

export function fingerprintOf(url: string, title: string): string {
  return `${hash(normalizeUrl(url))}_${hash(normalizeTitle(title))}`
}
