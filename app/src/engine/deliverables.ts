/**
 * 交付物模板（07 场景包 · 简历辅导线）：
 * 把案例工具产出的岗位解码表 / 匹配度诊断数据块，渲染成可直接交付客户的正式报告（自包含 HTML，打印即 PDF）。
 * 版式依据 08 手册：岗位解码报告（约 2 页）、匹配度诊断报告（逐条对照表格）。
 */

export interface DecodeReportData {
  clientName: string
  date: string
  p0: string[]
  p1: string[]
  p2: string[]
  keywords: string[]
}

export interface DiagnosisReportData {
  clientName: string
  date: string
  rows: { requirement: string; evidence: string; score: number; gap: string }[]
  summary: string
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

const BASE_CSS = `
  * { box-sizing: border-box }
  body { color:#211e1a; font-family:-apple-system,"PingFang SC","Microsoft YaHei",sans-serif; margin:0; padding:36px 22px; background:#fff }
  .wrap { max-width:800px; margin:0 auto }
  h1 { font-size:26px; margin:0 0 6px }
  .meta { color:#66625a; font-size:13px; margin-bottom:24px }
  h2 { font-size:17px; border-left:3px solid #e8833a; padding-left:10px; margin:26px 0 10px }
  ul { margin:6px 0; padding-left:22px }
  li { margin:7px 0; line-height:1.75; font-size:14.5px }
  .lead { background:#faf9f7; border-radius:8px; padding:12px 16px; font-size:14px; line-height:1.8 }
  .chips span { display:inline-block; border:1px solid #e6c8b2; background:#fdf3ec; color:#a34e12; border-radius:999px; padding:3px 12px; margin:3px 6px 3px 0; font-size:13px }
  .hint { color:#97928a; font-size:12px; line-height:1.7 }
  table { width:100%; border-collapse:collapse; font-size:13.5px }
  th { background:#211e1a; color:#fff; text-align:left; padding:8px 10px; font-weight:600 }
  td { border-bottom:1px solid #e6e4df; padding:8px 10px; vertical-align:top; line-height:1.6 }
  .s5 { color:#2f7d52; font-weight:700 }
  .s3 { color:#b0500f; font-weight:700 }
  .s0 { color:#b8443a; font-weight:700 }
  .foot { margin-top:34px; color:#97928a; font-size:11px; text-align:center }
  @media print { body { padding:0 } }
`

function page(title: string, body: string): string {
  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<style>${BASE_CSS}</style>
</head>
<body>
<div class="wrap">
${body}
<div class="foot">PWORK · 简历辅导场景包 · 打印或另存为 PDF 交付</div>
</div>
</body>
</html>`
}

/* ------------------------------ 解码表数据块 → 结构化 ------------------------------ */

export interface DecodeBlockData {
  jd: string
  p0: string[]
  p1: string[]
  p2: string[]
  keywords: string[]
}

/** 解析岗位解码数据块的文本内容（decodeJD 保存的格式） */
export function parseDecodeBlock(text: string): DecodeBlockData {
  const jdMatch = text.match(/^JD 原文：\n([\s\S]*?)(?:\n\n|$)/m)
  const section = (name: string) => {
    const m = text.match(new RegExp(`${name}：\\n([\\s\\S]*?)(?:\\n\\n|$)`))
    return m ? m[1].split('\n').map((l) => l.replace(/^[-·]\s*/, '').trim()).filter(Boolean) : []
  }
  const kw = text.match(/隐性能力词：(.+)/)
  return {
    jd: jdMatch?.[1]?.trim() ?? '',
    p0: section('P0 必须证明'),
    p1: section('P1 潜力项'),
    p2: section('P2 加分项'),
    keywords: kw ? kw[1].split(/[、,，]/).map((x) => x.trim()).filter(Boolean) : [],
  }
}

/* ------------------------------ 诊断数据块 → 结构化 ------------------------------ */

export interface DiagnosisBlockData {
  rows: DiagnosisReportData['rows']
  summary: string
}

/** 解析匹配度诊断数据块的文本内容（diagnosisToText 保存的格式） */
export function parseDiagnosisBlock(text: string): DiagnosisBlockData {
  const rows: DiagnosisBlockData['rows'] = []
  for (const line of text.split('\n')) {
    const m = line.match(/^【(\d)\/5】(.+)$/)
    if (!m) continue
    const rest = m[2]!
    const score = Number(m[1])
    const evSplit = rest.split('｜证据：')
    const gapSplit = rest.split('｜缺口：')
    if (evSplit.length === 2) rows.push({ requirement: evSplit[0]!.trim(), evidence: evSplit[1]!.trim(), score, gap: '' })
    else if (gapSplit.length === 2) rows.push({ requirement: gapSplit[0]!.trim(), evidence: '', score, gap: gapSplit[1]!.trim() })
    else rows.push({ requirement: rest.trim(), evidence: '', score, gap: '' })
  }
  const summary = text.match(/总体结论：([\s\S]*?)(?:\n|$)/)?.[1]?.trim() ?? ''
  return { rows, summary }
}

/* ------------------------------ 报告渲染 ------------------------------ */

export function renderDecodeReportHtml(d: DecodeReportData): string {
  const list = (items: string[]) => `<ul>${items.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>`
  const body = `
<h1>岗位解码报告</h1>
<div class="meta">对象：${esc(d.clientName)} ｜ 日期：${esc(d.date)}</div>
<div class="lead">本报告把目标岗位的招聘要求拆成三层：<b>P0 必须证明</b>（缺了直接淘汰）、<b>P1 潜力项</b>（体现成长空间）、<b>P2 加分项</b>，并提取了 JD 没有明说、但面试官实际看重的隐性能力词。简历与面试准备，以此为准。</div>
<h2>P0 · 必须证明</h2>
${list(d.p0.length ? d.p0.map((x) => x) : ['（未解码出内容）'])}
<h2>P1 · 潜力项</h2>
${list(d.p1.length ? d.p1 : ['（未解码出内容）'])}
<h2>P2 · 加分项</h2>
${list(d.p2.length ? d.p2 : ['（未解码出内容）'])}
<h2>隐性能力词</h2>
<div class="chips">${d.keywords.length ? d.keywords.map((k) => `<span>${esc(k)}</span>`).join('') : '（未提取到）'}</div>
<h2>怎么用这份报告</h2>
<div class="hint">
1. 对照每一条 P0，在简历里准备对应的<b>量化证据</b>——没有证据的经历，要么补，要么调整表述；<br>
2. P1 用于面试中展示潜力，不必全部写进简历；<br>
3. 隐性能力词是简历用语的"翻译词典"——把你的经历改写成这些词的语言。
</div>`
  return page(`岗位解码报告 · ${d.clientName}`, body)
}

export function renderDiagnosisReportHtml(d: DiagnosisReportData): string {
  const full = d.rows.filter((r) => r.score >= 4).length
  const gap = d.rows.filter((r) => r.score <= 2).length
  const scoreCls = (n: number) => (n >= 4 ? 's5' : n >= 3 ? 's3' : 's0')
  const rows = d.rows
    .map(
      (r) => `<tr>
<td>${esc(r.requirement)}</td>
<td>${r.evidence ? esc(r.evidence) : '<span class="s0">未找到证据</span>'}</td>
<td class="${scoreCls(r.score)}">${r.score}/5</td>
<td>${esc(r.gap || (r.score >= 4 ? '优势项，面试重点讲' : '需要补充证据或调整表达'))}</td>
</tr>`,
    )
    .join('')
  const body = `
<h1>岗位匹配度诊断报告</h1>
<div class="meta">对象：${esc(d.clientName)} ｜ 日期：${esc(d.date)}</div>
<div class="lead">${esc(d.summary || '逐条对照岗位要求与现有材料的匹配情况。')}</div>
<table>
<tr><th style="width:34%">岗位要求</th><th style="width:30%">现有证据</th><th style="width:10%">匹配</th><th>缺口与建议</th></tr>
${rows}
</table>
<div class="lead" style="margin-top:18px">
<b>统计</b>：共 ${d.rows.length} 条要求 ｜ 优势（4 分以上）${full} 条 ｜ 缺口（2 分以下）${gap} 条。<br>
<b>下一步</b>：缺口项按"可补证据 → 补量化结果；确实没有 → 面试用可迁移能力补位"处理，不虚构。
</div>`
  return page(`岗位匹配度诊断报告 · ${d.clientName}`, body)
}

/** 在新窗口打开报告（用户自行打印或另存 PDF） */
export function openReport(html: string): void {
  const w = window.open('', '_blank')
  if (!w) throw new Error('浏览器拦截了新窗口——请允许弹出窗口后重试')
  w.document.write(html)
  w.document.close()
  w.focus()
}
