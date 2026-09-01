/**
 * 归档小结自动生成（PRD 5.3 F2 / 课程文风三段式收尾）。
 * 语气规范见 content/copy.ts —— 教练式、不评判、带数字。
 */
import type { Delta, ReviewRecord } from '../types/models'

const DELTA_LABEL: Record<Delta, string> = {
  up: '超出',
  down: '低于',
  zero: '持平',
  new: '新增',
  gone: '消失',
}

const KIND_LABEL = { stop: '停下', continue: '继续', start: '开始' } as const

/** 由 CLAP 四环节数据生成 3 条小结；数据不足时给出诚实的占位句而非编造 */
export function generateSummary(review: ReviewRecord): string[] {
  const { comparison, logic, acknowledge, project } = review.clap
  const out: string[] = []

  // ① 对比：目标与结果的全貌（先给数字，再给一句话）
  if (comparison.gaps.length > 0) {
    const byDelta = groupCount(comparison.gaps.map((g) => g.delta))
    const parts = (['up', 'down', 'zero', 'new', 'gone'] as Delta[])
      .filter((d) => byDelta.has(d))
      .map((d) => `${DELTA_LABEL[d]} ${byDelta.get(d)} 项`)
    out.push(
      `这次对比了 ${comparison.goals.length} 个目标：${parts.join('，')}。` +
        (byDelta.get('down') || byDelta.get('gone')
          ? '差距已经摆上桌面——它们是接下来分析的入口，不是审判书。'
          : '结果不错，别忘了把做对的原因也归档，它们和教训一样值钱。'),
    )
  } else {
    out.push('目标与结果还没有形成对比记录，下一次试试先把目标锁定，再回来看结果。')
  }

  // ② 逻辑：可控性视角的关键原因（NEED 优先可控，GOOD 优先外因）
  const causes = logic.causes
  if (causes.length > 0) {
    const controllable = causes.filter((c) => c.controllability !== 'none')
    out.push(
      controllable.length > 0
        ? `找到 ${causes.length} 条原因，其中 ${controllable.length} 条在你可控或半可控的范围内——发力点就在这里。`
        : `找到 ${causes.length} 条原因，目前都标为不可控。试着再挖一层：环境由哪些环节组成？总有一个环节离你更近。`,
    )
  } else {
    out.push('原因分析还没有展开，下次从"哪条差距最刺眼"开始追问为什么。')
  }

  // ③ 认知 + 规划：认知更新了几条、行动落了几件
  const insights = acknowledge.insights
  const actions = project.actions
  if (insights.length > 0 || actions.length > 0) {
    const actionParts = (['stop', 'continue', 'start'] as const)
      .map((k) => ({ k, n: actions.filter((a) => a.kind === k).length }))
      .filter(({ n }) => n > 0)
      .map(({ k, n }) => `${KIND_LABEL[k]} ${n} 件`)
    out.push(
      `沉淀了 ${insights.length} 条认知更新，行动计划：${actionParts.join('、') || '还没定'}。` +
        (insights.some((i) => i.kind === 'inductive')
          ? '其中归纳出的结论记得回头验证——它只是"可能"，还不是"确定"。'
          : ''),
    )
  } else {
    out.push('还没有产出认知更新和行动卡——复盘最后一定要落到一件明天就能做的事上。')
  }

  return out.slice(0, 3)
}

function groupCount<T>(items: T[]): Map<T, number> {
  const map = new Map<T, number>()
  for (const item of items) map.set(item, (map.get(item) ?? 0) + 1)
  return map
}
