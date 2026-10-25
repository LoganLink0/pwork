/**
 * 采集配置与内容默认值（04 §4.2 兴趣域是评分锚点——你的经验物化点）。
 */

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

/**
 * 推荐信源包（首页快捷入口一键导入）：按主题精选的核心源（2026-09-02 首版 13 个，全部实测可达）。
 * 完整可选目录见 SOURCE_CATALOG（2026-10-25 扩充，新源同样逐个实测；超时/403 的不入库）。
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

/**
 * 信源目录（2026-10-25）：更广领域、可选订阅——首访引导与信源页共用的挑选清单。
 * 全部原生 RSS 且逐个实测可达（curl 200 + 响应体为 feed）；与已存信源按地址去重，可安全重复导入。
 * 预选 = 各领域 tier 1 源（合理起点，用户可自由增减）。
 */
export interface CatalogEntry {
  name: string
  url: string
  domain: string
  tier: 1 | 1.5 | 2
}

export const SOURCE_CATALOG: { domain: string; sources: CatalogEntry[] }[] = [
  {
    domain: 'ai',
    sources: [
      { name: 'AIHOT 精选', url: 'https://aihot.virxact.com/rss', domain: 'ai', tier: 1 },
      { name: '量子位', url: 'https://www.qbitai.com/feed', domain: 'ai', tier: 1 },
      { name: '机器之心', url: 'https://www.jiqizhixin.com/rss', domain: 'ai', tier: 1 },
      { name: 'Latent Space', url: 'https://www.latent.space/feed', domain: 'ai', tier: 1.5 },
      { name: 'Simon Willison', url: 'https://simonwillison.net/atom/everything/', domain: 'ai', tier: 1.5 },
      { name: 'TechCrunch AI', url: 'https://techcrunch.com/category/artificial-intelligence/feed/', domain: 'ai', tier: 1.5 },
      { name: 'The Decoder', url: 'https://the-decoder.com/feed/', domain: 'ai', tier: 1.5 },
      { name: '雷锋网', url: 'https://www.leiphone.com/feed/', domain: 'ai', tier: 1.5 },
      { name: 'HackerNoon', url: 'https://hackernoon.com/feed', domain: 'ai', tier: 2 },
      { name: 'Ars Technica AI', url: 'https://arstechnica.com/ai/feed/', domain: 'ai', tier: 2 },
    ],
  },
  {
    domain: 'frontend',
    sources: [
      { name: '阮一峰 · 网络日志', url: 'https://www.ruanyifeng.com/blog/atom.xml', domain: 'frontend', tier: 1 },
      { name: '张鑫旭 · 鑫空间', url: 'https://www.zhangxinxu.com/wordpress/feed/', domain: 'frontend', tier: 1.5 },
      { name: 'CSS-Tricks', url: 'https://css-tricks.com/feed/', domain: 'frontend', tier: 1.5 },
      { name: 'Smashing Magazine', url: 'https://www.smashingmagazine.com/feed/', domain: 'frontend', tier: 1.5 },
      { name: 'freeCodeCamp', url: 'https://www.freecodecamp.org/news/rss/', domain: 'frontend', tier: 1.5 },
      { name: 'Josh W. Comeau', url: 'https://www.joshwcomeau.com/rss.xml', domain: 'frontend', tier: 1.5 },
      { name: 'Kent C. Dodds', url: 'https://kentcdodds.com/rss.xml', domain: 'frontend', tier: 2 },
    ],
  },
  {
    domain: 'arch',
    sources: [
      { name: '美团技术团队', url: 'https://tech.meituan.com/feed', domain: 'arch', tier: 1 },
      { name: 'Martin Fowler', url: 'https://martinfowler.com/feed.atom', domain: 'arch', tier: 1.5 },
      { name: 'The New Stack', url: 'https://thenewstack.io/feed/', domain: 'arch', tier: 1.5 },
      { name: 'InfoQ 中文', url: 'https://www.infoq.cn/feed', domain: 'arch', tier: 1.5 },
      { name: 'InfoQ 国际', url: 'https://feed.infoq.com/', domain: 'arch', tier: 1.5 },
      { name: 'Netflix 技术博客', url: 'https://netflixtechblog.com/feed', domain: 'arch', tier: 2 },
      { name: '开源中国', url: 'https://www.oschina.net/news/rss', domain: 'arch', tier: 2 },
    ],
  },
  {
    domain: 'cloud',
    sources: [
      { name: 'CNCF Blog', url: 'https://www.cncf.io/blog/feed/', domain: 'cloud', tier: 1.5 },
      { name: 'AWS News Blog', url: 'https://aws.amazon.com/blogs/aws/feed/', domain: 'cloud', tier: 1.5 },
      { name: 'Kubernetes Blog', url: 'https://kubernetes.io/feed.xml', domain: 'cloud', tier: 1.5 },
      { name: 'Azure Blog', url: 'https://azure.microsoft.com/en-us/blog/feed/', domain: 'cloud', tier: 2 },
    ],
  },
  {
    domain: 'data',
    sources: [
      { name: 'dbt Labs Blog', url: 'https://www.getdbt.com/blog/feed.xml', domain: 'data', tier: 1.5 },
      { name: 'Towards Data Science', url: 'https://towardsdatascience.com/feed', domain: 'data', tier: 1.5 },
      { name: 'ClickHouse Blog', url: 'https://clickhouse.com/rss.xml', domain: 'data', tier: 2 },
    ],
  },
  {
    domain: 'pm',
    sources: [
      { name: '人人都是产品经理', url: 'https://www.woshipm.com/feed', domain: 'pm', tier: 1.5 },
      { name: "Lenny's Newsletter", url: 'https://www.lennysnewsletter.com/feed', domain: 'pm', tier: 1.5 },
      { name: "Rebel's Guide to Project Management", url: 'https://www.girlsguidetopm.com/feed/', domain: 'pm', tier: 2 },
      { name: 'Product Talk', url: 'https://www.producttalk.org/feed/', domain: 'pm', tier: 2 },
    ],
  },
  {
    domain: 'policy',
    sources: [{ name: '国家统计局 · 最新发布', url: 'https://www.stats.gov.cn/sj/zxfb/rss.xml', domain: 'policy', tier: 1 }],
  },
  {
    domain: 'indie',
    sources: [{ name: 'Product Hunt', url: 'https://www.producthunt.com/feed', domain: 'indie', tier: 1.5 }],
  },
  {
    domain: 'career',
    sources: [
      { name: 'dev.to', url: 'https://dev.to/feed', domain: 'career', tier: 1.5 },
      { name: 'HN 招聘帖', url: 'https://hnrss.org/jobs', domain: 'career', tier: 1.5 },
    ],
  },
  {
    domain: 'finance',
    sources: [
      { name: '华尔街见闻', url: 'https://dedicated.wallstreetcn.com/rss.xml', domain: 'finance', tier: 1 },
      { name: '36氪', url: 'https://36kr.com/feed', domain: 'finance', tier: 1.5 },
    ],
  },
  {
    domain: 'tool',
    sources: [
      { name: '小众软件', url: 'https://www.appinn.com/feed/', domain: 'tool', tier: 1 },
      { name: '少数派', url: 'https://sspai.com/feed', domain: 'tool', tier: 1.5 },
      { name: 'Hacker News 精选', url: 'https://hnrss.org/best', domain: 'tool', tier: 1.5 },
      { name: '奇客 Solidot', url: 'https://www.solidot.org/index.rss', domain: 'tool', tier: 1.5 },
      { name: 'Lifehacker', url: 'https://lifehacker.com/feed/rss', domain: 'tool', tier: 2 },
      { name: 'GitHub Blog', url: 'https://github.blog/feed/', domain: 'tool', tier: 2 },
      { name: '异次元软件世界', url: 'https://www.iplaysoft.com/feed', domain: 'tool', tier: 2 },
    ],
  },
]

