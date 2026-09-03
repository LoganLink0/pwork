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

/**
 * 推荐信源包（2026-09-02）：按主题精选（AI/云计算/架构/数据治理/PM/政策），
 * 全部在本机网络逐个实测可达。与 SAMPLE_SOURCES 按地址去重，可安全重复导入。
 */
export const RECOMMENDED_SOURCES: { name: string; url: string; domain: string; tier: 1 | 1.5 | 2 }[] = [
  { name: 'AIHOT 精选', url: 'https://aihot.virxact.com/rss', domain: 'ai', tier: 1 },
  { name: '量子位', url: 'https://www.qbitai.com/feed', domain: 'ai', tier: 1 },
  { name: 'Latent Space', url: 'https://www.latent.space/feed', domain: 'ai', tier: 1.5 },
  { name: 'CNCF Blog', url: 'https://www.cncf.io/blog/feed/', domain: 'cloud', tier: 1.5 },
  { name: 'AWS News Blog', url: 'https://aws.amazon.com/blogs/aws/feed/', domain: 'cloud', tier: 1.5 },
  { name: 'Azure Blog', url: 'https://azure.microsoft.com/en-us/blog/feed/', domain: 'cloud', tier: 2 },
  { name: '美团技术团队', url: 'https://tech.meituan.com/feed', domain: 'arch', tier: 1 },
  { name: 'Martin Fowler', url: 'https://martinfowler.com/feed.atom', domain: 'arch', tier: 1.5 },
  { name: 'The New Stack', url: 'https://thenewstack.io/feed/', domain: 'arch', tier: 1.5 },
  { name: 'dbt Labs Blog', url: 'https://www.getdbt.com/blog/feed.xml', domain: 'data', tier: 1.5 },
  { name: '人人都是产品经理', url: 'https://www.woshipm.com/feed', domain: 'pm', tier: 1.5 },
  { name: "Rebel's Guide to Project Management", url: 'https://www.girlsguidetopm.com/feed/', domain: 'pm', tier: 2 },
  { name: '国家统计局 · 最新发布', url: 'https://www.stats.gov.cn/sj/zxfb/rss.xml', domain: 'policy', tier: 1 },
]
