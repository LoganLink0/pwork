/**
 * 复盘档案 → Markdown（归档四件套结构，PRD 5.3 / 课程 11 讲）。
 * 纯函数，便于单测；下载由 UI 层完成。
 */
import { CONFIDENCE_LABEL, CONTROL_LABEL, DELTA_LABEL, MEETING, SCENARIO_LABEL } from '../content/copy'
import { cyclePathLabel } from './cld'
import type { ReviewRecord } from '../types/models'

const GOOD_MARK = '✓'

export function reviewToMarkdown(r: ReviewRecord): string {
  const c = r.clap
  const lines: string[] = []

  lines.push(`# ${r.title}`)
  lines.push('')
  lines.push(`> ${SCENARIO_LABEL[r.scenario]} · ${r.quick ? '3分钟快答' : '完整版'} · 创建于 ${fmt(r.createdAt)}`)
  lines.push('')

  // 一、对比
  lines.push('## 一、对比：目标与结果')
  lines.push('')
  if (c.comparison.goals.length) {
    lines.push('**目标**')
    for (const g of c.comparison.goals) lines.push(`- ${g.text || '（未填写）'}`)
    lines.push('')
  }
  if (c.comparison.results.length) {
    lines.push('**结果**')
    for (const x of c.comparison.results) {
      lines.push(`- ${x.text || '（未填写）'}${x.evidence ? `（佐证：${x.evidence}）` : ''}`)
    }
    lines.push('')
  }
  if (c.comparison.gaps.length) {
    lines.push('| 差异 | 目标 ↔ 结果 | 归类 |')
    lines.push('|---|---|---|')
    for (const gap of c.comparison.gaps) {
      const d = DELTA_LABEL[gap.delta]
      const goal = c.comparison.goals[gap.goalRef]?.text ?? ''
      const result = c.comparison.results[gap.resultRef]?.text ?? ''
      lines.push(`| ${d.mark} ${d.name} | ${esc(goal)} ↔ ${esc(result)} | ${gap.good ? GOOD_MARK + ' ' : ''}${gap.good ? '做得好' : '待提升'} |`)
    }
    lines.push('')
  }

  // 二、逻辑
  lines.push('## 二、逻辑：原因分析')
  lines.push('')
  if (c.logic.causes.length) {
    for (const cause of c.logic.causes) {
      const ctl = CONTROL_LABEL[cause.controllability]
      lines.push(`- ${ctl.mark} ${ctl.name}｜${cause.text || '（未填写）'}`)
      for (const [i, why] of cause.depth.entries()) {
        if (why.trim()) lines.push(`  - 为什么${'一'.repeat(i + 1)}层：${why}`)
      }
      if (cause.counterExample?.trim()) lines.push(`  - 反例：${cause.counterExample}`)
    }
    lines.push('')
  } else {
    lines.push('（未展开原因分析）')
    lines.push('')
  }

  // 因果循环图
  const cld = c.logic.cld
  if (cld && (cld.nodes.length > 0 || cld.loops.length > 0)) {
    const labelOf = (id: string) => cld.nodes.find((n) => n.id === id)?.label ?? id
    const mark = (p: string) => (p === 'enhance' ? '→ +' : p === 'inhibit' ? '→ −' : '→ ⏱')
    lines.push('### 因果循环图')
    lines.push('')
    if (cld.nodes.length) {
      lines.push(
        `**节点**：${cld.nodes
          .map((nd) => (nd.rootCause ? `★${nd.label}（根因）` : nd.label))
          .join('、')}`,
      )
      lines.push('')
    }
    if (cld.edges.length) {
      for (const edge of cld.edges) {
        lines.push(`- ${labelOf(edge.from)} ${mark(edge.polarity)} ${labelOf(edge.to)}`)
      }
      lines.push('')
    }
    if (cld.loops.length) {
      for (const loop of cld.loops) {
        const kind = loop.kind === 'reinforcing' ? '🟢 飞轮' : '🔴 恶性循环'
        lines.push(`- ${kind}「${loop.label}」：${cyclePathLabel(loop.nodeIds, labelOf)}`)
      }
      lines.push('')
    }
  }

  // 三、认知
  lines.push('## 三、认知更新')
  lines.push('')
  if (c.acknowledge.insights.length) {
    for (const ins of c.acknowledge.insights) {
      const tag = ins.kind === 'inductive' ? '归纳·待验证' : '演绎·确定'
      const plan = ins.checkPlan?.trim() ? `（验证方式：${ins.checkPlan}）` : ''
      lines.push(`- 【${tag}】${ins.text || '（未填写）'}${plan}`)
    }
  } else {
    lines.push('（没有产出认知更新）')
  }
  lines.push('')
  lines.push(
    `**双环检视**——${WIZARD_DOUBLE_LOOP(r)}${c.acknowledge.doubleLoopNote ? `：${c.acknowledge.doubleLoopNote}` : ''}`,
  )
  lines.push('')

  // 四、规划
  lines.push('## 四、行动计划')
  lines.push('')
  if (c.project.actions.length) {
    for (const a of c.project.actions) {
      const kind = { stop: '⛔ 停下', continue: '✅ 继续', start: '🚀 开始' }[a.kind]
      const parts = [
        kind,
        a.text || '（未填写）',
        a.ifThen?.trim() ? `｜执行意图：${a.ifThen}` : '',
        a.owner?.trim() ? `｜负责人 ${a.owner}` : '',
        a.due ? `｜期限 ${a.due}` : '',
        `｜信心：${CONFIDENCE_LABEL[a.confidence]}`,
      ]
      lines.push(`- ${parts.filter(Boolean).join(' ')}`)
    }
  } else {
    lines.push('（没有行动卡——复盘最后一定要落到一件明天就能做的事上）')
  }
  lines.push('')

  // 小结 + 思考题
  if (r.summary.length) {
    lines.push('## 小结')
    lines.push('')
    for (const [i, s] of r.summary.entries()) lines.push(`${i + 1}. ${s}`)
    lines.push('')
  }
  if (r.thinkingQuestion) {
    lines.push('## 思考题')
    lines.push('')
    lines.push(r.thinkingQuestion)
    lines.push('')
  }

  // 会议记录（团队复盘会）
  if (r.meeting) {
    lines.push('## 会议记录')
    lines.push('')
    const roles = MEETING.roles
      .map((role) => `${role.name}：${r.meeting!.roles[role.key] || '—'}`)
      .join(' ｜ ')
    lines.push(`> ${roles}`)
    lines.push('')
    lines.push(r.meeting.minutes || '（记录人还没填）')
    lines.push('')
  }

  lines.push('---')
  lines.push(`*导出自 复盘工作台 · ${fmt(new Date().toISOString())}*`)
  return lines.join('\n')
}

function WIZARD_DOUBLE_LOOP(r: ReviewRecord): string {
  return r.clap.acknowledge.goalValid ? '当初的目标本身成立，方向没有问题' : '当初的目标本身需要调整'
}

function esc(s: string): string {
  return s.replace(/\|/g, '｜')
}

function fmt(iso: string): string {
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}
