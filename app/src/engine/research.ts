/**
 * 调研任务引擎（第一性原理版，2026-10-13）：
 * 单元是「调研任务」——输入目标 → 拿调研框架 → 逐节提示词（复制出去问任何 AI/搜索引擎，
 * 或配置了网关直接问）→ 把发现贴回来 → 出稿。
 *
 * 框架双层来源：内置模板（无 AI 也完整可用）+ AI 按目标定制（走网关/BYOK）；
 * 发现以数据块存储、按节标题关联——存储细节不进用户词汇（不出现"数据块"）。
 * 提示词分两类，诚实边界：给外部 AI/搜索的（可能联网）与本机网关直问的（仅模型已有知识 + 已贴材料）。
 */

export type ResearchType = 'company' | 'position' | 'free'

export interface FrameworkSection {
  heading: string
  questions: string[]
  /** 去哪查：来源建议 */
  sources: string[]
}

export interface ResearchFramework {
  type: ResearchType
  target: string
  sections: FrameworkSection[]
  generatedBy: 'template' | 'ai'
}

export const RESEARCH_TYPES: { id: ResearchType; name: string; hint: string; placeholder: string }[] = [
  { id: 'company', name: '公司调研', hint: '合作 / 售前 / 求职前，摸清一家公司', placeholder: '公司名，如：宁德时代' },
  { id: 'position', name: '岗位调研', hint: '摸清一个岗位要什么，定制简历与面试', placeholder: '公司 + 岗位，如：某公司 高级产品经理' },
  { id: 'free', name: '自由主题', hint: '任何需要系统化搜集信息的问题', placeholder: '主题或问题，如：电池回收产业链' },
]

const TEMPLATES: Record<ResearchType, FrameworkSection[]> = {
  company: [
    {
      heading: '一、公司画像',
      questions: ['成立时间、注册资本、所在地、组织形态？', '规模多大（员工数 / 营收量级）？', '创始人/核心团队背景？'],
      sources: ['官网「关于我们」', '企查查 / 天眼查', '招聘页（规模与扩张信号）'],
    },
    {
      heading: '二、业务与商业模式',
      questions: ['主营业务线有哪些？', '客户是谁、怎么收费（商业模式）？', '靠什么赚钱、哪块最赚钱？'],
      sources: ['官网产品页', '招股书 / 年报 / 融资新闻', '行业媒体（36氪 / 晚点等）'],
    },
    {
      heading: '三、行业位置与竞品',
      questions: ['所在行业规模与增速？', '主要竞品是谁、差异化在哪？', '这家公司处于什么位置（份额/口碑）？'],
      sources: ['行业研究报告', '竞品官网对比', '第三方点评 / 社区讨论'],
    },
    {
      heading: '四、近期动态与信号',
      questions: ['近 12 个月有什么大事（融资 / 发布 / 人事 / 负面）？', '在招岗位透露什么方向？', '官方博客/公众号最近在说什么？'],
      sources: ['新闻搜索（近一年）', '官方公众号 / 博客', '招聘网站在招列表'],
    },
    {
      heading: '五、痛点与切入判断',
      questions: ['它可能有什么业务痛点？', '与我的目标（合作/求职/销售）的切入点在哪？', '最值得接触的人和路径？'],
      sources: ['以上调研的综合判断', '身边可触达的人脉'],
    },
  ],
  position: [
    {
      heading: '一、岗位画像',
      questions: ['这个岗位日常做什么、核心 KPI 是什么？', '在团队/业务里的位置和汇报关系？', '不同公司的同类岗位要求差异？'],
      sources: ['多份招聘 JD 对比（3–5 份）', '团队介绍页 / 面试官背景', '职业社区（脉脉 / 一亩三分地等）'],
    },
    {
      heading: '二、雇主看重什么',
      questions: ['JD 里反复出现的关键词（硬技能/工具/资格）？', '显性要求之外的软素质暗示？', '什么经历类型最被强调？'],
      sources: ['JD 措辞逐句分析', '面经 / 面试分享', '在职者访谈'],
    },
    {
      heading: '三、公司背景',
      questions: ['公司业务与这个岗位的关系（为什么招人）？', '该业务线是核心还是边缘？', '团队近期动向？'],
      sources: ['公司官网 / 新闻', '招股书业务分部', '岗位发布时间与刷新频率'],
    },
    {
      heading: '四、匹配差距',
      questions: ['现有背景 vs 岗位要求的逐条对照？', '最硬的差距是什么？', '哪些差距可以在简历措辞里补、哪些必须实补？'],
      sources: ['自己现有简历', 'JD 关键词清单'],
    },
    {
      heading: '五、简历与面试动作',
      questions: ['哪段经历应该前置、怎么量化？', '要补什么关键词、删什么？', '大概率被问到的公司与行业问题？'],
      sources: ['以上对照结论', '目标公司近一年新闻'],
    },
  ],
  free: [
    {
      heading: '一、背景与界定',
      questions: ['这个主题/问题具体指什么？边界在哪？', '为什么现在值得调研？', '关键术语和口径？'],
      sources: ['百科 / 官方定义', '综述文章'],
    },
    {
      heading: '二、关键事实与数据',
      questions: ['核心数据有哪些（规模/增速/价格）？', '主要参与者/利益方是谁？', '时间线上的关键节点？'],
      sources: ['行业报告 / 统计口径', '新闻检索', '公司公告'],
    },
    {
      heading: '三、不同立场与争论',
      questions: ['主流观点与反对观点各是什么？', '各方利益与偏见？', '不确定性最大的地方？'],
      sources: ['多来源交叉验证', '社区/专业讨论'],
    },
    {
      heading: '四、结论与行动建议',
      questions: ['对我要做的决策，最相关的 3 条结论？', '还缺什么信息、去哪补？', '下一步动作？'],
      sources: ['以上综合', '自己的一手验证'],
    },
  ],
}

/** 内置模板生成框架（无 AI 的完整路径） */
export function buildFramework(type: ResearchType, target: string): ResearchFramework {
  return { type, target, sections: structuredClone(TEMPLATES[type]), generatedBy: 'template' }
}

export function typeName(type: ResearchType): string {
  return RESEARCH_TYPES.find((t) => t.id === type)?.name ?? '自由主题'
}

/** 单节提示词：拿到任何 AI / 搜索引擎都能直接用 */
export function buildSectionPrompt(fw: ResearchFramework, section: FrameworkSection): string {
  const lines = [
    `我正在做${typeName(fw.type)}，调研对象是「${fw.target}」。当前聚焦：${section.heading.replace(/^[一二三四五六七八九十]+、/, '')}。`,
    '',
    '请回答以下问题：',
    ...section.questions.map((q, i) => `${i + 1}. ${q}`),
    '',
    '要求：优先给可核实的具体事实（数字、时间、机构名）；不确定的明确标注「未核实」；分点作答，用简体中文；最后列出你的信息来源。',
  ]
  return lines.join('\n')
}

/* ---------------------- AI 定制框架（可选增强，走网关/BYOK） ---------------------- */

export const FRAMEWORK_SYSTEM_PROMPT =
  '你是资深商业调研顾问。根据用户的调研目标设计调研框架：4-6 个维度，每个维度 2-4 个具体问题、2-3 条去哪查的来源建议。问题必须具体可回答（能落到数字/事实），不要空泛。只输出 JSON，格式：{"sections":[{"heading":"一、…","questions":["…"],"sources":["…"]}]}'

export function buildFrameworkUserPrompt(type: ResearchType, target: string): string {
  const extra =
    type === 'company'
      ? '视角偏商业合作/求职摸底：公司画像、商业模式、行业位置、近期动态、切入判断。'
      : type === 'position'
        ? '视角偏求职定制：岗位画像、雇主看重什么、公司背景、匹配差距、简历与面试动作。'
        : '自由主题：背景界定、关键事实、不同立场、结论与行动。'
  return `调研类型：${typeName(type)}\n调研目标：${target}\n${extra}\n请给出定制化的调研框架（JSON）。`
}

/** AI 框架结果的最小校验与规整（字段缺失/类型不对时抛错，由调用方落回模板） */
export function normalizeAiFramework(raw: unknown, type: ResearchType, target: string): ResearchFramework {
  const sections = (raw as { sections?: unknown }).sections
  if (!Array.isArray(sections) || sections.length < 3) throw new Error('AI 框架节数不足')
  const norm: FrameworkSection[] = sections.map((s) => {
    const sec = s as { heading?: unknown; questions?: unknown; sources?: unknown }
    if (typeof sec.heading !== 'string' || !sec.heading.trim()) throw new Error('AI 框架节缺标题')
    return {
      heading: sec.heading.trim(),
      questions: Array.isArray(sec.questions) ? sec.questions.filter((q): q is string => typeof q === 'string' && !!q.trim()) : [],
      sources: Array.isArray(sec.sources) ? sec.sources.filter((x): x is string => typeof x === 'string' && !!x.trim()) : [],
    }
  })
  return { type, target, sections: norm, generatedBy: 'ai' }
}

/* ---------------------- 发现的存取约定（数据块为实现层） ---------------------- */

const FW_KEY = (profileId: string) => `pwork-research-fw:${profileId}`

export function saveFramework(profileId: string, fw: ResearchFramework): void {
  localStorage.setItem(FW_KEY(profileId), JSON.stringify(fw))
}

export function loadFramework(profileId: string): ResearchFramework | null {
  try {
    const v = localStorage.getItem(FW_KEY(profileId))
    if (!v) return null
    const fw = JSON.parse(v) as ResearchFramework
    if (!Array.isArray(fw.sections) || !fw.target) return null
    return fw
  } catch {
    return null
  }
}
