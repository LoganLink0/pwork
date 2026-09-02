/**
 * 数据模型 —— 与 PRD 7.2 的 JSON 模型一一对应。
 * 命名规则：Draft 表示未归档的向导草稿，Record 表示已入库记录。
 */

/** 复盘层级：个人 / 团队 / 组织 */
export type ReviewType = 'personal' | 'team' | 'org'

/** 场景键（PRD 4.2 场景矩阵） */
export type ScenarioKey =
  // 个人
  | 'daily' | 'weekly' | 'goal' | 'habit' | 'emotion' | 'decision'
  // 团队
  | 'aar' | 'project'
  // 组织（课程案例篇六大场景）
  | 'strategy' | 'business' | 'org' | 'process' | 'talent' | 'budget'

/** 差异符号：超出 / 低于 / 持平 / 新增 / 消失（课程 07、12 讲） */
export type Delta = 'up' | 'down' | 'zero' | 'new' | 'gone'

/** 可控性三级：可控 / 半可控 / 不可控（课程 07 讲实心 / 半实心 / 空心圆） */
export type Controllability = 'full' | 'half' | 'none'

/** 行动卡三分类：停下 / 继续 / 开始（课程 07 讲 Stop / Continue / Start） */
export type ActionKind = 'stop' | 'continue' | 'start'

/** 信心指数四档：没信心 / 不好说 / 有信心 / 非常有信心（课程 02、12 讲） */
export type Confidence = 0 | 1 | 2 | 3

/** 认知结论来源：归纳（只得出"可能"）/ 演绎（得出"确定"）（课程 09 讲） */
export type InsightKind = 'inductive' | 'deductive'

/** 分析工具键（课程 09–10 讲工具箱） */
export type ToolKey = 'none' | '5why' | 'logic-tree' | 'swot' | 'cld' | '4p' | 'bcg' | 'radar'

/* ------------------------------ CLAP 各环节 ------------------------------ */

export interface GoalItem {
  text: string
  /** 目标锁定时间：防止后见之明偏差改写"当初的目标" */
  lockedAt: string
  source: 'manual' | 'imported'
}

export interface ResultItem {
  text: string
  /** 佐证：原始记录 / 截图 / 数据引用 */
  evidence?: string
}

/* ------------------------------ 场景包数据（情绪复盘等） ------------------------------ */

/** 情绪复盘的情绪档案：细分词（情绪粒度）+ 强度 + 触发点 */
export interface EmotionCheck {
  words: string[]
  intensity: number
  trigger: string
}

export interface GapItem {
  goalRef: number
  resultRef: number
  delta: Delta
  /** 是否归入 GOOD（做得好）；false 归入 NEED（待提升） */
  good: boolean
  note?: string
  /** 会议模式收集的独立便利贴文本（个人模式为空，走 goal↔result 配对） */
  text?: string
}

export interface CauseItem {
  text: string
  gapRef: number
  controllability: Controllability
  evidence?: string
  /** 反例：对抗确认偏误的反向证据 */
  counterExample?: string
  tool: ToolKey
  /** 5Why 深挖链（课程 09 讲深挖式提问） */
  depth: string[]
}

/* ------------------------------ 因果循环图（CLD，课程 10 讲） ------------------------------ */

export interface CldNode {
  id: string
  label: string
  /** 根因标记："没它不行"由用户确认后打上 */
  rootCause?: boolean
  /** 白板自定义坐标（用户拖拽过则有值；否则走自动布局） */
  x?: number
  y?: number
}

/** 关系极性：增强（+）/ 减弱（−）/ 延迟（⏱）——油门/刹车/热水器 */
export type CldPolarity = 'enhance' | 'inhibit' | 'delay'

export interface CldEdge {
  id: string
  from: string
  to: string
  polarity: CldPolarity
}

/** 被用户命名并归档的回路：飞轮（增强）或恶性循环 */
export interface CldLoop {
  id: string
  nodeIds: string[]
  kind: 'reinforcing' | 'vicious'
  label: string
}

export interface CldGraph {
  nodes: CldNode[]
  edges: CldEdge[]
  loops: CldLoop[]
}

export function emptyCld(): CldGraph {
  return { nodes: [], edges: [], loops: [] }
}

export interface InsightItem {
  text: string
  kind: InsightKind
  /** 归纳性结论默认待验证（黑天鹅：归纳只得出"可能"） */
  verified: boolean
  confidence: Confidence
  /** 这条认知打算怎么验证 */
  checkPlan?: string
}

export interface ActionDraft {
  kind: ActionKind
  text: string
  /** 执行意图：如果 X 就 Y（Gollwitzer） */
  ifThen?: string
  owner?: string
  due?: string
  okr?: { o: string; kr: string }
  confidence: Confidence
}

/* ------------------------------ 分析工具（SWOT / 逻辑树） ------------------------------ */

/** SWOT 四象限：每格一条一个字符串 */
export interface SwotQuadrants {
  s: string[]
  w: string[]
  o: string[]
  t: string[]
}

export interface SwotItem {
  id: string
  text: string
}

/** 逻辑树：MECE 逐层分解（课程 06/09 讲） */
export interface ToolTreeNode {
  id: string
  text: string
  children: ToolTreeNode[]
}

export function emptySwot(): SwotQuadrants {
  return { s: [], w: [], o: [], t: [] }
}

export interface ClapSections {
  comparison: {
    goals: GoalItem[]
    results: ResultItem[]
    gaps: GapItem[]
    /** 情绪复盘专属：情绪档案 */
    emotion?: EmotionCheck
  }
  logic: { causes: CauseItem[]; cld?: CldGraph; swot?: SwotQuadrants; tree?: ToolTreeNode[] }
  acknowledge: { insights: InsightItem[]; doubleLoopNote: string; goalValid: boolean }
  project: { actions: ActionDraft[] }
}

/* ------------------------------ 会议（M3） ------------------------------ */

/** 三角法六角色（课程 05 讲） */
export interface MeetingRoles {
  facilitator: string
  host: string
  discipline: string
  recorder: string
  presenter: string
  questioner: string
}

export interface MeetingMeta {
  roles: MeetingRoles
  minutes: string
  anonymous: boolean
  /** 当前阶段：0 会前 / 1 破冰 / 2 事实比较 / 3 分析原因 / 4 洞察规律 / 5 制定计划 / 6 归档 */
  phase: number
  /** 事实比较：便利贴是否已亮牌（先写后亮） */
  collected: boolean
  /** 会前资料清单已勾选项 */
  checklist: string[]
}

export function defaultMeeting(): MeetingMeta {
  return {
    roles: { facilitator: '', host: '', discipline: '', recorder: '', presenter: '', questioner: '' },
    minutes: '',
    anonymous: false,
    phase: 0,
    collected: false,
    checklist: [],
  }
}

/* --------------------------- Double Check（M2） --------------------------- */

export interface DoubleCheckState {
  /** 六维：准备 / 氛围 / 状态 / 效率 / 信心 / 环节质量 */
  preparation: string[]
  atmosphere: string[]
  state: string[]
  efficiency: string[]
  confidence: Confidence
  clapAudit: string[]
}

/* ------------------------------ 记录实体 ------------------------------ */

export interface ReviewRecord {
  id: string
  type: ReviewType
  scenario: ScenarioKey
  templateId: string
  title: string
  createdAt: string
  updatedAt: string
  /** 向导是否已归档（Double Check 通过前为 in-progress） */
  status: 'in-progress' | 'archived'
  /** 3 分钟快答版 */
  quick: boolean
  clap: ClapSections
  /** 挂载的速记（输入第三语义：速记 → 复盘素材；反向写 note.links.reviewIds） */
  noteIds?: string[]
  meeting?: MeetingMeta
  doubleCheck?: DoubleCheckState
  summary: string[]
  thinkingQuestion?: string
}

export interface ActionItem {
  id: string
  reviewId: string
  kind: ActionKind
  text: string
  ifThen?: string
  owner?: string
  due?: string
  status: 'open' | 'done' | 'dropped'
  /** W3 桥接：任务库 TaskItem 的 ID 引用（任务库是行动项状态的 SSOT，02 铁律 4） */
  taskId?: string
  closedAt: string | null
}

export interface InsightRecord {
  id: string
  reviewId: string
  text: string
  tags: string[]
  kind: InsightKind
  verified: boolean
  /** 主题指纹：相同主题多次出现时触发模式警示 */
  patternGroup: string
  /** 沉淀时间（回访周期的锚点） */
  createdAt: string
  /** 间隔重复回访记录 */
  revisit: { at: string; stillValid: boolean }[]
}

/** 全量导出 / 导入的包裹格式 */
export interface BackupBundle {
  version: 1
  exportedAt: string
  reviews: ReviewRecord[]
  actions: ActionItem[]
  insights: InsightRecord[]
}

export function emptyClap(): ClapSections {
  return {
    comparison: { goals: [], results: [], gaps: [] },
    logic: { causes: [] },
    acknowledge: { insights: [], doubleLoopNote: '', goalValid: true },
    project: { actions: [] },
  }
}
