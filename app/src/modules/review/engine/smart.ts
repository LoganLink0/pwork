/**
 * SMART 目标内联检查（PRD 2.5 目标设定理论 / 5.3 F2）。
 * M0 先做 Specific / Measurable / Time-bound 三项启发式；
 * Relevant / Attainable 由后续的"对齐战略（Align）"提示承担。
 */

export interface SmartResult {
  specific: boolean
  measurable: boolean
  timeBound: boolean
  /** 未达标项的改写提示 */
  hints: string[]
}

const TIME_WORDS =
  /(今天|明天|本周|下周|本月|下月|这周|月底|年底|年底前|[0-9一二两三四五六七八九十]+\s*[天周月日小时]|季度|[Qq][1-4]|\d{4}[-/年]|\d{1,2}[-/月]|\d{1,2}[日号]之前|之前|以前)/

/** 可量化：阿拉伯数字 / 百分号 / 倍数（中文序数词如"一遍"不算——避免误报） */
const NUMBER = /\d|%|％|倍/

/** "增强客户服务意识"式空泛表述的反例特征：全是抽象名词，无数字无期限 */
export function checkSmart(goal: string): SmartResult {
  const text = goal.trim()
  const measurable = NUMBER.test(text)
  const timeBound = TIME_WORDS.test(text)
  const specific =
    text.length >= 8 && !/^(提高|提升|增强|改善|加强|优化|做好?)(.){0,6}$/.test(text)

  const hints: string[] = []
  if (!specific) hints.push('把"做什么"说具体：动作 + 对象，别用"提高/加强"开头一笔带过。')
  if (!measurable) hints.push('加一个数字：多少、百分之几、几次——结果才可对比。')
  if (!timeBound) hints.push('加一个期限：哪一天之前？没有截止点的目标只是愿望。')

  return { specific, measurable, timeBound, hints }
}
