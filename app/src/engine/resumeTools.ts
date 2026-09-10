/**
 * 简历辅导案例工具（07 场景包 · 第一个实装包）：
 * 岗位解码（JD → P0/P1/P2 + 能力词）、匹配度诊断（解码表 × 客户素材逐条打分）、条目改写（STAR/量化）。
 * 方法论依据：简历修改服务标准手册（岗位导向、经历证据化、需求-能力映射、成果导向、诚实优化）。
 * 分工与全项目一致：AI 只产出结构化 JSON，解析与保存由确定性代码完成。
 */

export interface JobDecode {
  p0: string[]
  p1: string[]
  p2: string[]
  keywords: string[]
}

export interface MatchRow {
  requirement: string
  evidence: string
  score: number
  gap: string
}

export interface MatchDiagnosis {
  rows: MatchRow[]
  summary: string
}

export const DECODE_SYSTEM_PROMPT =
  '你是资深 HR 总监，负责拆解招聘 JD。只输出严格合法的 JSON，不要任何多余文字。材料里没有的不要编造；推断的内容在句尾加（推断）。'

export function buildDecodePrompt(jd: string): string {
  return [
    '请拆解以下招聘 JD，输出岗位解码表 JSON：',
    '{"p0":["必须证明的经历/能力，缺了直接淘汰"],"p1":["体现潜力的经历/能力"],"p2":["加分项"],"keywords":["JD 背后的隐性能力词"]}',
    '要求：',
    '1) 每条一句话，动词开头，可被简历经历直接对照；',
    '2) keywords 是 JD 没有明说、但 HR 隐性看重的能力词（如"跨部门推动""数据说话"）；',
    '3) p0 一般 2-4 条，p1 一般 2-4 条。',
    '',
    'JD 全文：',
    jd,
  ].join('\n')
}

export function parseDecode(text: string): JobDecode {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start < 0 || end <= start) throw new Error('AI 没有返回 JSON，请重试')
  const data = JSON.parse(text.slice(start, end + 1)) as Partial<JobDecode>
  const arr = (v: unknown) => (Array.isArray(v) ? v.map((x) => String(x)).filter(Boolean) : [])
  const result: JobDecode = { p0: arr(data.p0), p1: arr(data.p1), p2: arr(data.p2), keywords: arr(data.keywords) }
  if (result.p0.length === 0 && result.p1.length === 0) throw new Error('解码结果为空，请重试或检查 JD 是否完整')
  return result
}

/** 解码表 → 可存入数据块的文本形态（也作为匹配诊断的输入） */
export function decodeToText(d: JobDecode): string {
  const L: string[] = []
  if (d.p0.length) L.push(`P0 必须证明：\n${d.p0.map((x) => `- ${x}`).join('\n')}`)
  if (d.p1.length) L.push(`P1 潜力项：\n${d.p1.map((x) => `- ${x}`).join('\n')}`)
  if (d.p2.length) L.push(`P2 加分项：\n${d.p2.map((x) => `- ${x}`).join('\n')}`)
  if (d.keywords.length) L.push(`隐性能力词：${d.keywords.join('、')}`)
  return L.join('\n\n')
}

export const DIAGNOSE_SYSTEM_PROMPT =
  '你是资深简历顾问，负责把客户素材与岗位要求逐条对照打分。只使用素材中出现的事实，素材里没有的证据不要编造。只输出严格合法的 JSON，不要任何多余文字。'

export function buildDiagnosePrompt(decodeText: string, materials: { title: string; body: string }[]): string {
  const parts = materials.map((m, i) => `【材料${i + 1}：${m.title}】\n${m.body.slice(0, 3000)}`)
  return [
    '以下是岗位解码表和客户素材。请逐条对照解码表中的每条要求（P0/P1/P2/能力词），在客户素材中寻找证据，输出匹配度诊断 JSON：',
    '{"rows":[{"requirement":"解码表中的原要求","evidence":"客户素材中对应的证据原文（没有就写空字符串）","score":0到5的整数,"gap":"缺口说明（满分类写可强化的方向）"}],"summary":"两三句总体结论"}',
    '要求：',
    '1) 每条解码要求（含能力词）都要有一行，不要合并；',
    '2) score：5=证据充分，3=部分相关，0=素材中完全没有；',
    '3) 只输出 JSON。',
    '',
    '【岗位解码表】',
    decodeText,
    '',
    '【客户素材】',
    ...parts,
  ].join('\n')
}

export function parseDiagnosis(text: string): MatchDiagnosis {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start < 0 || end <= start) throw new Error('AI 没有返回 JSON，请重试')
  const data = JSON.parse(text.slice(start, end + 1)) as Partial<MatchDiagnosis>
  if (!Array.isArray(data.rows) || data.rows.length === 0) throw new Error('诊断结果为空，请重试')
  const rows: MatchRow[] = data.rows.map((r) => ({
    requirement: String(r?.requirement ?? ''),
    evidence: String(r?.evidence ?? ''),
    score: Math.max(0, Math.min(5, Number(r?.score) || 0)),
    gap: String(r?.gap ?? ''),
  }))
  return { rows, summary: String(data.summary ?? '') }
}

/** 诊断表 → 可存入数据块的文本形态 */
export function diagnosisToText(d: MatchDiagnosis): string {
  const lines = d.rows.map((r) => {
    const ev = r.evidence ? `｜证据：${r.evidence}` : r.gap ? `｜缺口：${r.gap}` : ''
    return `【${r.score}/5】${r.requirement}${ev}`
  })
  return [`匹配度诊断（逐条对照）`, ...lines, '', `总体结论：${d.summary}`].join('\n')
}

export const REWRITE_SYSTEM_PROMPT =
  '你是资深简历顾问，负责把原始经历描述改写成有竞争力的简历条目。只依据给出的原始内容，不编造没有的事实。直接输出改写后的条目，不要解释。'

export function buildRewritePrompt(raw: string, decodeText: string | null): string {
  return [
    '请把下面的原始经历描述，改写成简历条目：',
    '要求：',
    '1) 用"问题-行动-结果"结构，必须有具体结果；原始内容没有数字时，用（数字待补）占位，不要编造；',
    '2) 用岗位语言表达（对齐下面的岗位解码表，如无则用通用职场语言）；',
    '3) 输出 1-3 条，每条一行，不要解释。',
    decodeText ? `【岗位解码表】\n${decodeText}` : '',
    `【原始描述】\n${raw}`,
  ]
    .filter(Boolean)
    .join('\n')
}

/** 解码表/诊断表的文本 → 存为数据块时的默认标题 */
export function caseBlockTitle(kind: 'decode' | 'diagnosis'): string {
  const d = new Date()
  const stamp = `${d.getMonth() + 1}月${d.getDate()}日`
  return kind === 'decode' ? `岗位解码表 · ${stamp}` : `匹配度诊断 · ${stamp}`
}
