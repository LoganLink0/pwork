/**
 * 新手引导示例：「小林的周复盘」——一份完整、真实颗粒度的周复盘，
 * 与 Uber 增长飞轮静态图，供 Help 页与一键加载试用使用。
 */
import type { CldGraph, ClapSections } from '../types/models'

export const EXAMPLE_META = {
  who: '小林',
  title: '示例 · 小林的周复盘',
  background: '小林的目标是 6 月前考下架构师。这一周结束，她坐下来做了本周第一次像样的复盘。',
  thinkingQuestion: '留一道思考题给你：小林的下一次复盘，应该先看目标，还是先看结果？',
  summary: [
    '对比了 1 个目标：低于 1 项。差距已经摆上桌面——它们是接下来分析的入口，不是审判书。',
    '找到 1 条原因，其中 1 条在你可控或半可控的范围内——发力点就在这里。',
    '沉淀了 1 条认知更新，行动计划：开始 1 件、继续 1 件。归纳出的结论记得回头验证。',
  ],
} as const

/** Help 页展示 + 一键加载用的已填数据 */
export function buildExampleClap(): ClapSections {
  return {
    comparison: {
      goals: [{ text: '6 月前完成架构师学习，并约上考试', lockedAt: '', source: 'manual' }],
      results: [{ text: '学习进度约 60%，考试没有约', evidence: '学习 App 的进度页截图' }],
      gaps: [{ goalRef: 0, resultRef: 0, delta: 'down', good: false }],
    },
    logic: {
      causes: [
        {
          text: '学习计划太粗：只列了书单，没有拆到周',
          gapRef: 0,
          controllability: 'half',
          tool: '5why',
          depth: ['没有每周检查点，拖延无法被发现', '拖延积累后，学习变成了"下次再说"'],
          counterExample: '同样忙的项目周反而完成了任务——不是时间问题，是计划颗粒度问题',
        },
      ],
      cld: undefined,
    },
    acknowledge: {
      insights: [
        {
          text: '计划要拆到"每周可验收"的颗粒度，并配固定检查点',
          kind: 'inductive',
          verified: false,
          confidence: 2,
          checkPlan: '连续两周执行周日核对，看是否兑现',
        },
      ],
      doubleLoopNote: '',
      goalValid: true,
    },
    project: {
      actions: [
        {
          kind: 'start',
          text: '每周日晚核对下周学习清单',
          ifThen: '如果周日晚上 8 点，就花 15 分钟核对并调整学习计划',
          owner: '小林',
          due: '',
          confidence: 2,
        },
        { kind: 'continue', text: '保持工作日的晨间学习时段', confidence: 2 },
      ],
    },
  }
}

/** 进阶示例：Uber 增长飞轮（课程 10 讲），静态渲染用 */
export const EXAMPLE_UBER_CLD: CldGraph = {
  nodes: [
    { id: 'n_demand', label: '更多需求' },
    { id: 'n_driver', label: '更多司机' },
    { id: 'n_cover', label: '更多区域覆盖' },
    { id: 'n_wait', label: '更快接客' },
    { id: 'n_price', label: '更低价格' },
  ],
  edges: [
    { id: 'e1', from: 'n_driver', to: 'n_cover', polarity: 'enhance' },
    { id: 'e2', from: 'n_cover', to: 'n_wait', polarity: 'enhance' },
    { id: 'e3', from: 'n_wait', to: 'n_price', polarity: 'enhance' },
    { id: 'e4', from: 'n_price', to: 'n_demand', polarity: 'enhance' },
    { id: 'e5', from: 'n_demand', to: 'n_driver', polarity: 'enhance' },
  ],
  loops: [
    { id: 'loop_uber', nodeIds: ['n_driver', 'n_cover', 'n_wait', 'n_price', 'n_demand'], kind: 'reinforcing', label: 'Uber 增长飞轮' },
  ],
}
