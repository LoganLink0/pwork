/**
 * 采集配置与内容默认值（04 §4.2 兴趣域是评分锚点——你的经验物化点）。
 */

import type { CollectConfig } from '../types/models'

export const DEFAULT_COLLECT_CONFIG: CollectConfig = {
  interests: ['AI 应用', '独立开发', '前端工程化'],
  dislikes: ['融资', '八卦', '软文'],
  context: '我在做个人复盘工具与信息采集系统，关注能直接借鉴的产品与增长打法',
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
    }
  } catch {
    return { ...DEFAULT_COLLECT_CONFIG }
  }
}

export function saveCollectConfig(config: CollectConfig): void {
  localStorage.setItem(CONFIG_KEY, JSON.stringify(config))
}

/** 主题域（相关度评分依据之一；对应 04 §3.1 Source.domain） */
export const DOMAINS = [
  { key: 'ai', label: 'AI' },
  { key: 'indie', label: '独立开发' },
  { key: 'frontend', label: '前端' },
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

/**
 * 示例信源（导入后可改）：全部为原生 RSS，已在本机网络经 rss2json 转接实测可用（2026-08-31）。
 * 注意：rsshub.app 公共实例在大陆网络长期不可达，勿直接使用；RSSHub 路由建议自建或用可达镜像。
 */
export const SAMPLE_SOURCES: { name: string; url: string; domain: string; tier: 1 | 1.5 | 2 }[] = [
  { name: '阮一峰 · 网络日志', url: 'https://www.ruanyifeng.com/blog/atom.xml', domain: 'frontend', tier: 1 },
  { name: '少数派', url: 'https://sspai.com/feed', domain: 'tool', tier: 1.5 },
  { name: 'Hacker News 精选', url: 'https://hnrss.org/best', domain: 'ai', tier: 1.5 },
  { name: '奇客 Solidot', url: 'https://www.solidot.org/index.rss', domain: 'ai', tier: 1.5 },
  { name: 'GitHub Blog', url: 'https://github.blog/feed/', domain: 'tool', tier: 2 },
]
