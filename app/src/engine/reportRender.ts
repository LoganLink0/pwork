/**
 * 报告渲染器（输出 O1）：ReportData → Markdown / 独立 HTML。
 * 纯函数；HTML 自包含（内联 v3 同源配色），可直接发送或存 vault。
 */
import type { ReportData } from './reportData'

const MODE_LABEL = { weekly: '周报', monthly: '月报' } as const

export function reportTitle(d: ReportData): string {
  return `PWORK ${MODE_LABEL[d.mode]}（${d.rangeLabel}）`
}

export function reportToMarkdown(d: ReportData): string {
  const L: string[] = []
  L.push(`# ${reportTitle(d)}`)
  L.push('')
  L.push(`> 生成于 ${d.today} · 数据来自本机工作台，ID 引用零拷贝`)
  L.push('')
  L.push('## 一、任务')
  L.push('')
  L.push(`- 已闭环 **${d.tasks.closed.length}** 项 · 闭环率 **${d.tasks.closureRate}%** · 未闭环 ${d.tasks.openCount} 项（逾期 ${d.tasks.overdueCount}）`)
  for (const t of d.tasks.closed.slice(0, 5)) L.push(`  - ✅ ${t.title}`)
  if (d.tasks.openCount === 0 && d.tasks.closed.length === 0) L.push('  - （本期没有任务记录）')
  L.push('')
  L.push('## 二、目标进展')
  L.push('')
  if (d.goals.active.length === 0) L.push('- （没有进行中的目标）')
  for (const g of d.goals.active) {
    L.push(`- ◎ ${g.title}${g.due ? `（期限 ${g.due}）` : ''}${g.progressNote ? `　进度：${g.progressNote}` : ''}`)
  }
  if (d.goals.doneInRange > 0) L.push(`- 本期达成目标 ${d.goals.doneInRange} 个 🎉`)
  L.push('')
  L.push('## 三、本周洞察')
  L.push('')
  if (d.insights.length === 0) L.push('- （本期没有新洞察卡）')
  for (const i of d.insights) L.push(`- 💡 ${i.text}`)
  L.push('')
  L.push('## 四、外部环境（高分条目）')
  L.push('')
  if (d.topItems.length === 0) L.push('- （本期没有高分信息条目）')
  for (const it of d.topItems) {
    L.push(`- [${it.title}](${it.url})（评分 ${it.score} · ${it.sourceName}）`)
  }
  L.push('')
  L.push('## 五、复盘与信号')
  L.push('')
  L.push(`- 本期复盘 ${d.reviews.count} 次${d.reviews.titles.length ? `：${d.reviews.titles.join('、')}` : ''}`)
  L.push(`- 录入速记 ${d.notesCount} 条`)
  for (const s of d.signals) L.push(`- ⚡ ${s.message}`)
  L.push('')
  L.push('---')
  L.push(`*PWORK 自动成稿 · ${reportTitle(d)}*`)
  return L.join('\n')
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function stat(v: string, label: string): string {
  return `<div class="stat"><div class="num">${esc(v)}</div><div class="lbl">${esc(label)}</div></div>`
}

export function reportToHtml(d: ReportData): string {
  const title = reportTitle(d)
  const taskItems = d.tasks.closed.slice(0, 8).map((t) => `<li>✅ ${esc(t.title)}</li>`).join('')
  const goalItems = d.goals.active
    .map((g) => `<li>◎ ${esc(g.title)}${g.due ? `（${esc(g.due)}）` : ''}</li>`)
    .join('')
  const insightItems = d.insights.map((i) => `<li>💡 ${esc(i.text)}</li>`).join('')
  const itemItems = d.topItems
    .map((i) => `<li><a href="${esc(i.url)}">${esc(i.title)}</a>（评分 ${i.score} · ${esc(i.sourceName)}）</li>`)
    .join('')
  const signalHtml = d.signals.length
    ? `<div class="notice">⚡ ${d.signals.map((s) => esc(s.message)).join('；')}</div>`
    : ''

  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<style>
  body { background:#f5f4f1; color:#211e1a; font-family:-apple-system,"PingFang SC","Microsoft YaHei",sans-serif; margin:0; padding:40px 20px; }
  .wrap { max-width:860px; margin:0 auto; }
  h1 { font-size:28px; margin:0 0 4px; }
  .sub { color:#66625a; font-size:14px; margin-bottom:28px; }
  .stats { display:flex; gap:16px; flex-wrap:wrap; margin-bottom:28px; }
  .stat { background:#fff; border:1px solid #e6e4df; border-radius:10px; padding:14px 22px; min-width:120px; }
  .num { font-size:24px; font-weight:700; }
  .lbl { font-size:12px; color:#97928a; }
  h2 { font-size:18px; border-left:3px solid #e8833a; padding-left:10px; margin:30px 0 10px; }
  li { margin:6px 0; line-height:1.7; }
  a { color:#a34e12; }
  .card { background:#fff; border:1px solid #e6e4df; border-radius:12px; padding:20px 24px; }
  .notice { border-left:3px solid #e8833a; background:#faf9f7; padding:10px 14px; border-radius:0 6px 6px 0; font-size:14px; margin-top:10px; }
  .foot { margin-top:36px; color:#97928a; font-size:12px; text-align:center; }
</style>
</head>
<body>
<div class="wrap">
  <h1>${esc(title)}</h1>
  <div class="sub">PWORK 自动成稿 · 生成于 ${esc(d.today)}</div>
  <div class="stats">
    ${stat(d.tasks.closureRate + '%', '任务闭环率')}
    ${stat(String(d.tasks.closed.length), '本期闭环')}
    ${stat(String(d.goals.active.length), '进行中目标')}
    ${stat(String(d.insights.length), '新增洞察')}
  </div>
  <div class="card">
    <h2>任务</h2>
    <ul>${taskItems || '<li>（本期没有任务记录）</li>'}</ul>
    <h2>目标进展</h2>
    <ul>${goalItems || '<li>（没有进行中的目标）</li>'}</ul>
    ${d.goals.doneInRange ? `<p>本期达成目标 ${d.goals.doneInRange} 个 🎉</p>` : ''}
    <h2>本周洞察</h2>
    <ul>${insightItems || '<li>（本期没有新洞察卡）</li>'}</ul>
    <h2>外部环境（高分条目）</h2>
    <ul>${itemItems || '<li>（本期没有高分信息条目）</li>'}</ul>
    <h2>复盘与信号</h2>
    <p>本期复盘 ${d.reviews.count} 次 · 录入速记 ${d.notesCount} 条</p>
    ${signalHtml}
  </div>
  <div class="foot">PWORK 自动成稿 · 数据来自本机工作台</div>
</div>
</body>
</html>`
}
