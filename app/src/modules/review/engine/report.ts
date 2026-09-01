/**
 * 月度 HTML 报告（PRD ⑦ 报告与导出 / M4）。
 * 自包含单文件 HTML（内联纸感样式，打印/转 PDF 友好）——复盘的"经营分析月报"。
 */
import { SCENARIO_LABEL } from '../content/copy'
import type { ActionItem, InsightRecord, ReviewRecord } from '../types/models'

export interface MonthInput {
  /** 月份，格式 YYYY-MM */
  month: string
  reviews: ReviewRecord[]
  insights: InsightRecord[]
  actions: ActionItem[]
}

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

export function buildMonthlyReport({ month, reviews, insights, actions }: MonthInput): string {
  const inMonth = reviews.filter((r) => r.createdAt.startsWith(month))
  const closedActions = actions.filter((a) => a.status === 'done')
  const closureRate = actions.length ? Math.round((closedActions.length / actions.length) * 100) : 0
  const monthInsights = insights.filter((i) => i.createdAt.startsWith(month))

  const reviewBlocks = inMonth
    .map(
      (r) => `
  <article class="review">
    <h3>${esc(r.title)} <small>${SCENARIO_LABEL[r.scenario]} · ${r.status === 'archived' ? '已归档' : '进行中'}</small></h3>
    ${r.summary.length ? `<ol class="summary">${r.summary.map((s) => `<li>${esc(s)}</li>`).join('')}</ol>` : '<p class="muted">（无小结）</p>'}
    ${r.clap.project.actions.length ? `<p class="muted">行动卡 ${r.clap.project.actions.length} 张</p>` : ''}
  </article>`,
    )
    .join('\n')

  const insightList = monthInsights.length
    ? `<ul>${monthInsights.map((i) => `<li>${esc(i.text)} <small>【${i.kind === 'inductive' ? '归纳·待验证' : '演绎·确定'}】</small></li>`).join('')}</ul>`
    : '<p class="muted">本月没有新的认知更新。</p>'

  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>复盘月报 · ${esc(month)}</title>
<style>
  body { font-family: -apple-system, 'PingFang SC', 'Microsoft YaHei', sans-serif; color: #2b2926; background: #faf8f3; max-width: 760px; margin: 0 auto; padding: 32px 20px 64px; line-height: 1.75; }
  h1 { border-bottom: 3px solid #e8965a; padding-bottom: 8px; }
  h3 { margin-bottom: 4px; }
  small { color: #a39d92; font-weight: normal; }
  .stats { display: flex; gap: 12px; flex-wrap: wrap; margin: 16px 0 32px; }
  .stat { background: #fffdf8; border: 1px solid #e5e0d5; border-radius: 999px; padding: 4px 14px; font-size: 14px; }
  .review { background: #fffdf8; border: 1px solid #e5e0d5; border-radius: 10px; padding: 12px 18px; margin-bottom: 16px; }
  .summary { margin: 8px 0; }
  .muted { color: #a39d92; font-size: 14px; }
  footer { margin-top: 48px; color: #a39d92; font-size: 12px; border-top: 1px dashed #e5e0d5; padding-top: 12px; }
  @media print { body { background: #fff; } }
</style>
</head>
<body>
<h1>复盘月报 · ${esc(month)}</h1>
<div class="stats">
  <span class="stat"><strong>${inMonth.length}</strong> 份复盘</span>
  <span class="stat"><strong>${monthInsights.length}</strong> 条认知更新</span>
  <span class="stat"><strong>${closureRate}%</strong> 行动闭环率（累计）</span>
</div>
<h2>复盘档案</h2>
${reviewBlocks || '<p class="muted">本月还没有复盘档案——下个月，从一件小事开始。</p>'}
<h2>本月认知更新</h2>
${insightList}
<footer>导出自 复盘工作台 · ${esc(new Date().toISOString().slice(0, 10))} · 数据保存在你的浏览器本地</footer>
</body>
</html>`
}
