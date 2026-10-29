/**
 * 采集配置与内容默认值（04 §4.2 兴趣域是评分锚点——你的经验物化点）。
 * 推荐信源目录（0.4-6 内容插件层）：数据在 ./source-catalog.json（社区可贡献——
 * PR 改数据文件，不碰代码），这里负责载入与读取防御（铁律 2）：字段类型校验、
 * URL 协议白名单、地址全局去重，坏行跳过不进目录。
 */
import catalogJson from './source-catalog.json'
import type { CollectConfig } from '../types/models'

export const DEFAULT_COLLECT_CONFIG: CollectConfig = {
  interests: ['AI 应用', '独立开发', '前端工程化'],
  dislikes: ['融资', '八卦', '软文'],
  // 通用默认（随安装包分发给任何人，不得含任何个人表述）——用户自己的上下文在设置页改
  context: '我关注可以直接借鉴的产品、工程与增长实践',
  topN: 10,
}

const CONFIG_KEY = 'pwork-collect-config'

export function loadCollectConfig(): CollectConfig {
  try {
    const v = localStorage.getItem(CONFIG_KEY)
    if (!v) return { ...DEFAULT_COLLECT_CONFIG }
    const parsed = JSON.parse(v) as Partial<CollectConfig>
    return {
      interests: Array.isArray(parsed.interests) ? parsed.interests : [...DEFAULT_COLLECT_CONFIG.interests],
      dislikes: Array.isArray(parsed.dislikes) ? parsed.dislikes : [...DEFAULT_COLLECT_CONFIG.dislikes],
      context: typeof parsed.context === 'string' ? parsed.context : DEFAULT_COLLECT_CONFIG.context,
      topN: parsed.topN ?? DEFAULT_COLLECT_CONFIG.topN,
      // 旧配置/旧备份可能带已退役的 weights 字段：读取时忽略（评分权重固定，见 rules.ts）
      relayBase: typeof parsed.relayBase === 'string' ? parsed.relayBase : '',
    }
  } catch {
    return { ...DEFAULT_COLLECT_CONFIG }
  }
}

export function saveCollectConfig(config: CollectConfig): void {
  localStorage.setItem(CONFIG_KEY, JSON.stringify(config))
  // 修改时间戳：记录级设备同步用它判断配置是否需要推送/是否被远端新配置覆盖（2026-10-19）
  localStorage.setItem('pwork-collect-config-at', new Date().toISOString())
}

/** 主题域（相关度评分依据之一；对应 04 §3.1 Source.domain）——含信源目录全部领域 */
export const DOMAINS = [
  { key: 'ai', label: 'AI' },
  { key: 'frontend', label: '前端' },
  { key: 'arch', label: '架构' },
  { key: 'cloud', label: '云计算' },
  { key: 'data', label: '数据' },
  { key: 'pm', label: '产品' },
  { key: 'policy', label: '政策' },
  { key: 'indie', label: '独立开发' },
  { key: 'career', label: '职业' },
  { key: 'finance', label: '财经' },
  { key: 'tool', label: '工具' },
  { key: 'other', label: '其他' },
] as const

export const DOMAIN_LABEL: Record<string, string> = Object.fromEntries(
  DOMAINS.map((d) => [d.key, d.label]),
)

export const TIER_LABEL: Record<number, string> = { 1: 'T1 核心源', 1.5: 'T1.5 优质源', 2: 'T2 观察源' }

/** tier → 默认权重映射（04 §3.1） */
export const TIER_WEIGHT: Record<number, number> = { 1: 1.0, 1.5: 0.7, 2: 0.4 }

/* --------------------- 信源目录（从 source-catalog.json 载入） --------------------- */

export interface CatalogEntry {
  name: string
  url: string
  domain: string
  tier: 1 | 1.5 | 2
}

/** 读取防御：单条目录项校验。返回 null = 坏行（跳过） */
function normalizeEntry(raw: unknown, domain: string): CatalogEntry | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  if (typeof r.name !== 'string' || !r.name.trim()) return null
  if (typeof r.url !== 'string' || !/^https?:\/\//.test(r.url)) return null
  if (r.tier !== 1 && r.tier !== 1.5 && r.tier !== 2) return null
  return { name: r.name.trim(), url: r.url, domain, tier: r.tier }
}

function loadCatalog(): { domains: { domain: string; sources: CatalogEntry[] }[]; recommended: CatalogEntry[] } {
  const raw = catalogJson as { recommended?: unknown; domains?: unknown }
  const domains: { domain: string; sources: CatalogEntry[] }[] = []
  const byName = new Map<string, CatalogEntry>()
  const seen = new Set<string>()
  if (Array.isArray(raw.domains)) {
    for (const g of raw.domains) {
      if (!g || typeof g !== 'object') continue
      const domain = (g as Record<string, unknown>).domain
      if (typeof domain !== 'string') continue
      const list = (g as Record<string, unknown>).sources
      if (!Array.isArray(list)) continue
      const sources: CatalogEntry[] = []
      for (const item of list) {
        const entry = normalizeEntry(item, domain)
        if (!entry || seen.has(entry.url)) continue // 坏行 / 重复地址跳过
        seen.add(entry.url)
        sources.push(entry)
        if (!byName.has(entry.name)) byName.set(entry.name, entry)
      }
      if (sources.length > 0) domains.push({ domain, sources })
    }
  }
  // 首页快捷导入包：按名称引用（单一事实——清单在 JSON 的 recommended 数组维护）
  const recommended = Array.isArray(raw.recommended)
    ? (raw.recommended.filter((n): n is string => typeof n === 'string').map((n) => byName.get(n)).filter((e): e is CatalogEntry => Boolean(e)))
    : []
  return { domains, recommended }
}

const catalog = loadCatalog()

/** 完整可选目录：首访引导与信源页共用的挑选清单（按领域分组） */
export const SOURCE_CATALOG: { domain: string; sources: CatalogEntry[] }[] = catalog.domains

/** 推荐信源包（首页快捷入口一键导入）：跨领域精选，从完整目录按名单引用 */
export const RECOMMENDED_SOURCES: CatalogEntry[] = catalog.recommended
