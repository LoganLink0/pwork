/**
 * 工作台核心类型（PRD §6.2）。
 * 铁律 1：每个实体必备稳定 ID、createdAt、updatedAt、schemaVersion。
 * 铁律 2：字段只增不删，读取侧对可选字段做防御（见 db/repo.ts normalizeNote）。
 */

/** 跨模块 ID 引用（铁律 4：只引用，不拷贝内容） */
export interface NoteLinks {
  /** 采集信息条目（W2 起可用） */
  itemIds: string[]
  /** 复盘档案（W3 起可用） */
  reviewIds: string[]
  /** 任务库任务（W3 起可用） */
  taskIds: string[]
}

/** 任务来源（溯源引用；任务库是行动项的 SSOT，02 铁律 4） */
export type TaskOriginKind = 'review' | 'note' | 'item' | 'manual' | 'bid' | 'bid'

/**
 * 任务三分类车道（用户三问分诊法，客观事实取代主观重要/紧急）：
 * 1 = 今日窗口（今天不完成窗口消失，不可逆损失）
 * 2 = 阻塞链路（缺我的输出链路卡住，非我不可）
 * 3 = 可绕开（可委派/推迟/删除）
 * 到期日到达时任何车道自动升为 1（窗口到了就是到了）
 */
export type TaskLane = 1 | 2 | 3

/**
 * 周趋势快照（输出 O1 增补）：每次生成报告时写入一行，
 * 攒出环比与趋势——商业报告的"较上期 ±X pp"全靠它。
 */
export interface ReportSnapshot {
  id: string
  /** 本地日 'YYYY-MM-DD'（每日一条，重复生成覆盖） */
  day: string
  closureRate: number
  closedCount: number
  openCount: number
  overdueCount: number
  goalsActive: number
  insightsCount: number
  notesCount: number
  createdAt: string
}

/**
 * 外部数据块（输出扩展）：从工作台之外带来的结构化片段
 * （业务指标、系统导出的周数据等）。行内 "键: 值" 形态渲染为指标行，
 * 其余行为普通文本。报告/朗读/PPT 管线自动并入——数据从输入侧进管线，输出不做旁路。
 */
export interface DataBlock {
  id: string
  title: string
  content: string
  /** 归属的调研对象（输入第三通道的对象档案；空 = 未归类） */
  profileId?: string
  /** 用途：internal 自己用 / client 给客户——决定哪些材料可进入对外交付 */
  usage?: 'internal' | 'client'
  /** 云端推送数据的源 id（/api/ingest），用于增量拉取去重；手动创建无此字段 */
  extId?: string
  updatedAt: string
  deletedAt: string | null
  schemaVersion: number
}
/**
 * 调研对象（输入第三通道的对象档案）：一家公司、一个客户……材料（数据块）挂在它下面，
 * 分析产出（报告撰写）从它取材料。07 场景包"对象档案"的最小实装。
 */
export interface Profile {
  id: string
  name: string
  /** 自由标签：客户 / 目标公司 / 供应商……不做枚举限制 */
  kind: string
  note?: string
  createdAt: string
  updatedAt: string
  deletedAt: string | null
  schemaVersion: number
}

/**
 * 目标 Goal —— 工作台目标模块拥有（02 §3 字段所有权表）；复盘向导只读引用（C-2 最小形态，
 * 2026-08-31 决议：最小实体先行，完整管理页随处理模块评估）
 */
export interface Goal {
  id: string
  title: string
  status: 'active' | 'done' | 'dropped'
  due?: string
  /** W5 预填用：最近一次进度快照（自由文本，随记录更新） */
  progressNote?: string
  /** 进度轨迹（追加不改写；progressNote 恒等于最后一条）——字段只增不删（02 铁律 2） */
  progressLog?: { at: string; note: string }[]
  closedAt: string | null
  createdAt: string
  updatedAt: string
  deletedAt: string | null
  schemaVersion: number
}

/** 任务 TaskItem —— 壳（工作区）拥有，W3 起为行动项 SSOT（PRD §6.2） */
export interface TaskItem {
  id: string
  title: string
  status: 'todo' | 'done' | 'dropped'
  /** 'YYYY-MM-DD' 本地日期（逾期判断） */
  due?: string
  /** 若来自复盘行动项，保留 if-then 执行意图 */
  ifThen?: string
  /** 分诊车道（缺省 3=可绕开；due 到期日自动升为 1 显示） */
  lane?: TaskLane
  origin: { kind: TaskOriginKind; refId: string | null }
  closedAt: string | null
  createdAt: string
  updatedAt: string
  deletedAt: string | null
  schemaVersion: number
}

/** 速记 —— 输入模块拥有（PRD §6.2） */
export interface Note {
  id: string
  /** 可选；默认取正文首行 */
  title: string
  /** Markdown 正文 */
  body: string
  tags: string[]
  links: NoteLinks
  /** quick = 全局速记浮层；manual = 页面内新建 */
  source: 'quick' | 'manual'
  createdAt: string
  updatedAt: string
  /** 软删除标记（铁律 3）；null = 未删除 */
  deletedAt: string | null
  schemaVersion: number
}

/** 全工作台统一导出包裹（铁律 4 / 02 §4）：{ version, exportedAt, entities }。
 * v1 = 仅 notes；v2 = W3 起全量（notes/sources/items/collectConfig/reviews/actions/insights/tasks）。
 * 导入侧同时接受 FUPAN v1 旧格式（reviews/actions/insights 在顶层）。 */
export interface ExportBundle {
  version: number
  exportedAt: string
  entities: {
    notes: Note[]
    /** W2 起：信源清单（Curated，随全量备份） */
    sources?: Source[]
    /** W2 起：条目（仅 scored/kept 的 Curated 层；raw/discarded 不备份，04 §3.4） */
    items?: Item[]
    /** W2 起：采集配置（兴趣域等；非凭据，随备份） */
    collectConfig?: CollectConfig
    /** W3 起：回路模块（Curated 全量） */
    reviews?: unknown[]
    actions?: unknown[]
    insights?: unknown[]
    tasks?: TaskItem[]
  }
}

/* ==================== 信息采集（W2 · C1，04 文档 §3） ==================== */

/** 信源 Source —— 一等公民（04 §3.1） */
export interface Source {
  id: string
  name: string
  /** C1 只有 rss（转接后可直 fetch 的 URL：RSSHub 路由 / rss2json / CORS 开放源） */
  kind: 'rss'
  /** 实际抓取地址 */
  url: string
  /** 主题域：相关度评分依据之一 */
  domain: string
  /** 1 / 1.5 / 2（AIHOT 式分级） */
  tier: 1 | 1.5 | 2
  /** 默认 = tier 映射(1.0/0.7/0.4)，可手工微调 */
  weight: number
  /** C1 无定时（手动抓取）；字段为 C2 Cron 预留 */
  checkEvery: '6h' | 'daily' | 'weekly'
  active: boolean
  /** failStreak ≥ 3 自动置 active=false 并告警（死源静默污染数据是最常见死法） */
  health: { failStreak: number; lastOkAt: string | null; lastError: string | null }
  createdAt: string
  updatedAt: string
  deletedAt: string | null
  schemaVersion: number
}

/** 评分四维（04 §4.1；C1 为规则近似值，aiBy='rules'） */
export interface ScoreBreakdown {
  total: number
  source: number
  novelty: number
  relevance: number
  utility: number
}

/** 用户标注 —— 内嵌于 Item，不单独建实体（04 §3.3）；永久保留层 */
export interface ItemAnnotation {
  notes: string
  /** 0–5 星，反馈回流评分权重 */
  stars: number
  keepForever: boolean
  /** W3 起可挂复盘档案 */
  linkedReviewId: string | null
}

/** 信息条目 Item —— 核心实体（04 §3.2） */
export interface Item {
  id: string
  sourceId: string
  sourceName: string
  url: string
  title: string
  /** 摘要（C1 取原文首段/描述，≤200 字截断；AI 摘要 C2 接入） */
  summary: string
  /** 规范化 URL + 归一化标题 的哈希 → 去重主键 */
  fingerprint: string
  /** 可选：多源同事件聚合键（C2 起用） */
  eventGroup: string | null
  publishedAt: string | null
  fetchedAt: string
  stage: 'raw' | 'prefiltered' | 'scored' | 'kept' | 'discarded'
  /** 软删除（铁律 3）：删除后 14 天 TTL 清理时物理移除；列表/日报/报告均过滤 */
  deletedAt?: string
  score: ScoreBreakdown
  /** ≤30 字评分理由（可解释性红线，04 §5） */
  scoreReason: string
  /** 本条由谁处理（降级追溯）：C1 恒为 rules */
  aiBy: 'rules'
  tags: string[]
  /** 回路联动：进 O/T 候选池（W4 消费；C1 可手动标记） */
  otFlag: 'opportunity' | 'threat' | 'trend' | null
  /** raw/discarded 层 TTL（14 天）；scored/kept 为 Curated 无 TTL */
  expiresAt: string | null
  annotation: ItemAnnotation
  createdAt: string
  updatedAt: string
  schemaVersion: number
}

/** 采集配置 —— 兴趣域是评分的锚点（04 §4.2），存 localStorage（非凭据，随备份导出） */
export interface CollectConfig {
  interests: string[]
  dislikes: string[]
  context: string
  /** 每日 Top N 硬顶：产品设计不是用户设置（04 §8） */
  topN: number
}
