/**
 * 防偏差规则引擎（PRD 5.2 / 6.7 / 6.3 原则 3）。
 * 纯函数、零 UI 依赖；只负责"识别"，改写引导语在 content/copy.ts。
 * 设计约束：拦截只提示、不阻断（开发计划 §4）。
 */

export type DebiasKind =
  | 'blame'          // 追责他人："都是XX的错"
  | 'self-blame'     // 自我否定："我太蠢了"
  | 'empty-promise'  // 空洞承诺："下次注意"
  | 'hindsight'      // 后见之明："早知道就……"
  | 'excuse'         // 万能借口："价格太高"（课程 15 讲）

export interface DebiasHit {
  kind: DebiasKind
  /** 命中的原文片段 */
  match: string
}

/** 每类一组触发词；全部为"提示级"信号，允许误报（只提示不阻断） */
const RULES: { kind: DebiasKind; patterns: RegExp[] }[] = [
  {
    kind: 'blame',
    patterns: [
      /都是.{0,12}的错/,
      /全(怪|赖|是).{0,12}(造成|导致|的错|的问题)/,
      /(他|她|他们|她们|对方|领导|老板)(就是|根本|确实|真的)?(不行|太差|有问题|不给力)/,
    ],
  },
  {
    kind: 'self-blame',
    patterns: [
      /我(太|真的|实在)?(蠢|笨|差|不行|没用|垃圾)/,
      /我(就是|真的)不行/,
      /我这人(就是)?(不行|太差)/,
    ],
  },
  {
    kind: 'empty-promise',
    patterns: [
      /下次(注意|小心|一定|改进)/,
      /以后(注意|小心|一定|改进)/,
      /(更加|再)?(认真|细心|努力)(一)?点/,
      /(更加|再)努力/,
    ],
  },
  {
    kind: 'hindsight',
    patterns: [/早知道(就)?/, /当时要是/, /要是当初/, /如果重来(一遍)?我(一定|肯定)/],
  },
  {
    kind: 'excuse',
    patterns: [
      /(价格|成本)(太)?高(了)?(所以|，|。|$)/,
      /市场(不好|不行|环境差)/,
      /没(时间|精力)/,
      /运气(不好|太差)/,
    ],
  },
]

/** 扫描一段文本，返回全部命中的偏差信号（按出现顺序） */
export function scanDebias(text: string): DebiasHit[] {
  const hits: DebiasHit[] = []
  for (const rule of RULES) {
    for (const pattern of rule.patterns) {
      const found = text.match(pattern)
      if (found) hits.push({ kind: rule.kind, match: found[0] })
    }
  }
  return hits
}

/** 首个命中的引导语键（供 UI 去 content/copy.ts 取文案） */
export function firstDebias(text: string): DebiasKind | null {
  return scanDebias(text)[0]?.kind ?? null
}
