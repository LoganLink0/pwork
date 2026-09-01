/**
 * Double Check · 环节质量自检（PRD 附录 B 第 6 维，课程 12 讲）。
 * 前五维（准备/氛围/状态/效率/信心）由用户勾选；本模块自动生成第六维"环节质量"——
 * 用 CLAP 各环节的验收条款回查这份档案，工具即清单（课程："在做复盘中学习怎么做复盘"）。
 */
import { checkSmart } from './smart'
import type { ReviewRecord } from '../types/models'

export interface AuditItem {
  label: string
  pass: boolean
}

export function clapAudit(r: ReviewRecord): AuditItem[] {
  const c = r.clap
  const items: AuditItem[] = []

  // —— 对比（C）
  items.push({
    label: '每个目标都有对应的结果与差异标注',
    pass:
      c.comparison.goals.length > 0 &&
      c.comparison.results.length > 0 &&
      c.comparison.gaps.length > 0,
  })
  if (!r.quick) {
    const smartOk = c.comparison.goals.filter((g) => {
      const s = checkSmart(g.text)
      return [s.specific, s.measurable, s.timeBound].filter(Boolean).length >= 2
    })
    items.push({
      label: '目标基本符合 SMART（具体/可衡量/有期限，至少两项达标）',
      pass: c.comparison.goals.length > 0 && smartOk.length === c.comparison.goals.length,
    })
  }

  // —— 逻辑（L）
  items.push({
    label: '至少有一条可控或半可控的原因——发力点明确',
    pass: c.logic.causes.some((x) => x.controllability !== 'none'),
  })

  // —— 认知（A）
  items.push({
    label: '认知更新已区分归纳/演绎，归纳结论默认待验证',
    pass: c.acknowledge.insights.length > 0,
  })
  if (!r.quick) {
    const inductive = c.acknowledge.insights.filter((i) => i.kind === 'inductive')
    items.push({
      label: '归纳出的结论都写了验证方式',
      pass: c.acknowledge.insights.length > 0 && inductive.every((i) => (i.checkPlan ?? '').trim() !== ''),
    })
  }
  items.push({
    label: '双环检视：若目标需要调整，写明了调整方向',
    pass: c.acknowledge.goalValid || c.acknowledge.doubleLoopNote.trim() !== '',
  })

  // —— 规划（P）
  items.push({
    label: '每张行动卡都有执行意图（如果…就…）',
    pass: c.project.actions.length > 0 && c.project.actions.every((a) => (a.ifThen ?? '').trim() !== ''),
  })
  if (!r.quick) {
    items.push({
      label: '每张行动卡都有期限',
      pass: c.project.actions.length > 0 && c.project.actions.every((a) => !!a.due),
    })
  }

  return items
}
