/**
 * Double Check 前五维的清单文案（PRD 附录 B，个人复盘语境改写）。
 * 第六维"环节质量"由 engine/doublecheck 自动生成。
 */

export interface DCDimension {
  key: 'preparation' | 'atmosphere' | 'state' | 'efficiency'
  title: string
  items: string[]
}

export const DC_DIMENSIONS: DCDimension[] = [
  {
    key: 'preparation',
    title: '准备',
    items: ['回顾所需的资料和数据，开始前已经备齐', '没有在现场花大量时间翻找记录'],
  },
  {
    key: 'atmosphere',
    title: '氛围',
    items: ['这次复盘是在学习，不是在追责', '结论指向事，而不是指向人', '结论跟着数据和逻辑走，而不是跟着声量走'],
  },
  {
    key: 'state',
    title: '状态',
    items: ['引导/记录/陈述/设问，该在状态的都在状态', '对自己追问时，没有蜻蜓点水', '陈述做到了信息真实、逻辑扎实'],
  },
  {
    key: 'efficiency',
    title: '效率',
    items: ['先说结论，再讲过程', '单一事项没有无限膨胀', '没有绕着同一个圈子反复讨论'],
  },
]

export const DC_COPY = {
  title: 'Double Check：给复盘本身做一次复盘',
  hint: '复盘是一个无限迭代的过程——检验复盘过程本身，才能让下一次更好。勾选你认可的描述，环节质量由系统自动自检。',
  confidenceLabel: '这次复盘结束时，你对接下来行动的信心',
  save: '保存检验结果',
  saved: '检验结果已保存。下次复盘的准备清单，会参考这次的改进点。',
  auditTitle: '环节质量（系统自检）',
  passMark: '✓',
  failMark: '！',
} as const
