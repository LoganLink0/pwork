/**
 * 简历辅导服务工作流（08 服务手册八步 SOP 的产品化）：
 * 自检包生成（SOP①）→ 岗位解码（②）→ 访谈追问（③）→ 匹配诊断（④）→ 条目改写与简历稿（⑤⑥）→ 交付核对（⑦）→ 面试衔接（⑧可选）。
 * 本文件只放纯数据与纯函数；页面在 CaseWorkbench。
 */
import type { CaseFile } from '../types'

/* ------------------------------ SOP① 自检包（客户填写模板） ------------------------------ */

export interface SelfCheckTable {
  title: string
  /** 竖表：一行一个字段（字段名 + 填写提示） */
  kind: 'vertical'
  rows: { label: string; hint?: string }[]
}

export interface SelfCheckGridTable {
  title: string
  /** 横表：表头 + 若干空行 */
  kind: 'grid'
  header: string[]
  rows: number
  hint: string[]
}

export type SelfCheckSection = (SelfCheckTable | SelfCheckGridTable) & { hint: string[] }

export const SELF_CHECK_SECTIONS: SelfCheckSection[] = [
  {
    title: '表一 · 基本盘',
    kind: 'vertical',
    hint: ['"现公司那句话"最关键：不是公司介绍，是"我在这个公司做什么"的一句话定位。', '薪酬写结构不写绝对值也可以（如"底薪 40% 提成 60%"）。', '带人就是管理能力的硬证据；不带人就写日常协作里的团队角色。'],
    rows: [
      { label: '姓名 / 联系方式', hint: '投递前再填，先匿名' },
      { label: '年龄 / 城市' },
      { label: '现公司', hint: '公司名 + 一句话说清它做什么、行业地位' },
      { label: '现岗位 / 年限' },
      { label: '薪酬结构', hint: '底薪 + 提成/奖金，写结构不写绝对值也行' },
      { label: '汇报对象 / 团队规模' },
    ],
  },
  {
    title: '表二 · 业绩数据（近 3 年）',
    kind: 'grid',
    header: ['年度', '指标（quota）', '完成情况', '团队排名', '最拿得出手的一单'],
    rows: 3,
    hint: ['排名写"前 20%"比"第 3 名"更好——自带团队规模信息。', '完成率超过 100% 就写实际数字（117% 好过 100%）。', '最好的一单写客户行业 + 金额 + 签约周期。'],
  },
  {
    title: '表三 · 客户与案例库（挑 3 个代表案例）',
    kind: 'grid',
    header: ['', '案例 1', '案例 2', '案例 3'],
    rows: 5,
    hint: ['挑哪 3 个：金额最大的 + 最难的 + 最代表目标岗位方向的。', '"你负责的部分"最关键：写清楚你是推动者、方案设计者还是拍板者。', '"最大的困难"是面试的主角——简历写结果，面试讲过程。'],
  },
  {
    title: '表四 · 能力自评（1-5 分 + 一个证据）',
    kind: 'grid',
    header: ['能力', '自评', '支撑证据（一句话）'],
    rows: 6,
    hint: ['自评不用谦虚也不用吹：3 分 = 正常水平，4 分 = 强项，5 分 = 被同事认可的核心标签。', '证据必须是一句话的事实，不是形容。', '敢于给自己打 2 分——诚实的短板比虚假的全面更可信。'],
  },
  {
    title: '表五 · 目标与恐惧点',
    kind: 'vertical',
    hint: ['目标越具体，简历越锋利："投更大的公司"不如"投有自研产品的 AI 公司做大客户销售"。', '恐惧点是面试准备的靶子：最怕被问的问题，就是简历里要提前埋好答案的地方。', '"不想写进简历的内容"也写出来，顾问帮你判断能否回避、有无风险。'],
    rows: [
      { label: '目标行业 / 公司类型' },
      { label: '目标岗位' },
      { label: '招聘链接（如有）' },
      { label: '最担心的面试问题（3 个）' },
      { label: '不想写进简历的内容' },
    ],
  },
]

const GRID_ROW_LABELS: Record<string, string[]> = {
  '表三 · 客户与案例库（挑 3 个代表案例）': ['客户行业 / 规模', '你负责的部分', '单子金额 / 周期', '最大的困难', '结果与证据'],
  '表四 · 能力自评（1-5 分 + 一个证据）': ['获客 / 线索开发', '需求挖掘', '方案与演示', '谈判与成交', '回款与客户维护', '跨部门协调'],
}

export interface SelfCheckMeta {
  caseName?: string
  clientName?: string
  targetRole?: string
}

/** 自检包 Markdown（发客户用；客户可用 Word/WPS 打开或另存） */
export function selfCheckPackMarkdown(meta: SelfCheckMeta = {}): string {
  const metaLines = [
    '> | 用途 | 客户自助梳理经历与素材——你填得越具体，简历改得越准 |',
    '> | 填写原则 | 宁可多写后删，不要空着；数字凭记忆先填，不用翻旧账 |',
    meta.caseName ? `> | 案例 | ${meta.caseName} |` : null,
    meta.clientName ? `> | 客户 | ${meta.clientName} |` : null,
    meta.targetRole ? `> | 目标岗位 | ${meta.targetRole} |` : null,
  ].filter(Boolean)
  const head = ['# 自检包（简历辅导 · 前置材料）', '', ...metaLines, ''].join('\n')
  const body = SELF_CHECK_SECTIONS.map((s) => {
    let md = `## ${s.title}\n\n`
    if (s.kind === 'vertical') {
      md += '| 项目 | 内容 |\n|---|---|\n'
      md += s.rows.map((r) => `| ${r.label}${r.hint ? `（${r.hint}）` : ''} | |`).join('\n')
    } else {
      md += `| ${s.header.join(' | ')} |\n|${s.header.map(() => '---').join('|')}|\n`
      const labels = GRID_ROW_LABELS[s.title]
      md += Array.from({ length: s.rows }, (_, i) => `| ${labels?.[i] ?? ''} |${s.header.slice(1).map(() => ' |').join('')}`).join('\n')
    }
    md += `\n\n**填写指导**\n${s.hint.map((h) => `- ${h}`).join('\n')}\n`
    return md
  }).join('\n---\n\n')
  return `${head}\n${body}---\n\n*填完后把整份发回给顾问；所有内容仅用于简历定制。*\n`
}

/** 自检包 Word（.docx）：真实表格，客户可直接填写 */
export async function exportSelfCheckPackDocx(meta: SelfCheckMeta = {}): Promise<string> {
  const { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType, Table, TableRow, TableCell, WidthType } = await import('docx')
  const cell = (text: string, opts: { width?: number; bold?: boolean; fill?: string } = {}) =>
    new TableCell({
      width: opts.width ? { size: opts.width, type: WidthType.PERCENTAGE } : undefined,
      shading: opts.fill ? { fill: opts.fill } : undefined,
      children: [new Paragraph({ children: [new TextRun({ text, bold: opts.bold, size: 20 })] })],
    })
  const row = (cells: ReturnType<typeof cell>[]) => new TableRow({ children: cells })

  const children: (InstanceType<typeof Paragraph> | InstanceType<typeof Table>)[] = [
    new Paragraph({ heading: HeadingLevel.TITLE, alignment: AlignmentType.CENTER, children: [new TextRun({ text: '自检包（简历辅导 · 前置材料）', bold: true })] }),
    new Paragraph({
      children: [
        new TextRun({
          text: `案例：${meta.caseName ?? '—'}${meta.clientName ? ` · 客户：${meta.clientName}` : ''}${meta.targetRole ? ` · 目标岗位：${meta.targetRole}` : ''}`,
          size: 20,
        }),
      ],
    }),
    new Paragraph({ children: [new TextRun({ text: '填写原则：宁可多写后删，不要空着；数字凭记忆先填，不用翻旧账。', size: 20 })] }),
  ]
  for (const s of SELF_CHECK_SECTIONS) {
    children.push(new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun({ text: s.title, bold: true })] }))
    if (s.kind === 'vertical') {
      children.push(
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: s.rows.map((r) =>
            row([cell(`${r.label}${r.hint ? `（${r.hint}）` : ''}`, { width: 38, bold: true, fill: 'f2f0ec' }), cell('')]),
          ),
        }),
      )
    } else {
      const labels = GRID_ROW_LABELS[s.title]
      children.push(
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [
            row(s.header.map((h) => cell(h, { bold: true, fill: 'f2f0ec' }))),
            ...Array.from({ length: s.rows }, (_, i) => row(s.header.map((_, c) => cell(c === 0 ? (labels?.[i] ?? '') : '')))),
          ],
        }),
      )
    }
    children.push(new Paragraph({ children: [new TextRun({ text: `填写指导：${s.hint.join(' ')}`, size: 18 })] }))
  }
  children.push(new Paragraph({ children: [new TextRun({ text: '填完后把整份发回给顾问；所有内容仅用于简历定制。', size: 18 })] }))

  const doc = new Document({ sections: [{ children }] })
  const blob = await Packer.toBlob(doc)
  const name = meta.clientName || meta.caseName || '客户'
  const filename = `PWORK-自检包-${name.replace(/[\\/:*?"<>|]/g, '_').slice(0, 30)}.docx`
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
  return filename
}

/* ------------------------------ SOP③ 访谈追问清单 ------------------------------ */

export const INTERVIEW_SYSTEM_PROMPT =
  '你是简历辅导顾问。根据岗位解码表和客户已有材料，生成一份访谈追问清单：按解码表里的 P0/P1 要求和隐性能力词逐项列问题，找出材料里没证据的经历。每条追问要具体（能问出数字、场景、结果的问法），材料已覆盖的不要重复问。输出 Markdown 列表，按"必须问清 / 建议追问"分组。不编造客户的经历。'

export function buildInterviewPrompt(decodeText: string, materials: { name: string; text: string }[]): string {
  const mats = materials.length ? materials.map((m) => `【${m.name}】\n${m.text.slice(0, 1500)}`).join('\n\n') : '（暂无其他材料——追问要覆盖全部 P0 要求的取证）'
  return `岗位解码表：\n${decodeText}\n\n客户已有材料：\n${mats}\n\n请生成访谈追问清单。`
}

/** 简历稿等自由文本 → Word（.docx）：'# '为一级标题、'## '为二级标题，其余逐行成段 */
export async function exportTextDocx(title: string, text: string): Promise<string> {
  const { Document, Packer, Paragraph, TextRun, HeadingLevel } = await import('docx')
  const paras = text.split('\n').map((line) => {
    if (line.startsWith('## ')) return new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun({ text: line.slice(3), bold: true })] })
    if (line.startsWith('# ')) return new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun({ text: line.slice(2), bold: true })] })
    return new Paragraph({ children: [new TextRun({ text: line })] })
  })
  const doc = new Document({ sections: [{ children: [new Paragraph({ heading: HeadingLevel.TITLE, children: [new TextRun({ text: title, bold: true })] }), ...paras] }] })
  const blob = await Packer.toBlob(doc)
  const filename = `PWORK-${title.replace(/[\\/:*?"<>|]/g, '_').slice(0, 40)}.docx`
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
  return filename
}

/* ------------------------------ SOP⑦ 交付物核对清单 ------------------------------ */

export interface DeliverableItem {
  id: string
  label: string
  hint: string
}

/** 简历修改服务交付物（08 手册 §四（二）），顺序即建议产出顺序 */
export const DELIVERABLE_CHECKLIST: DeliverableItem[] = [
  { id: 'resume-final', label: '简历终稿', hint: 'Word + PDF，一页/两页——核心交付' },
  { id: 'diagnosis', label: '匹配度诊断报告', hint: '逐条对照 JD 打分，说明缺口与优势' },
  { id: 'quantified', label: '量化成果清单', hint: '5 个以上数字成果，简历和面试都用' },
  { id: 'star', label: '项目 STAR 库', hint: '2-3 个完整故事，面试用' },
  { id: 'portfolio', label: '能力证据作品集清单 + 脱敏指南', hint: '指导客户整理可展示的实物证据' },
  { id: 'update-guide', label: '简历更新指南', hint: '投不同岗位时的微调方法（模板库有现成件）' },
  { id: 'copyright', label: '版权与使用声明', hint: '防转卖，明确使用范围（模板库有现成件）' },
]

/* ------------------------------ 八步进度推导（纯函数） ------------------------------ */

export interface SopStep {
  id: string
  label: string
  done: boolean
  optional?: boolean
}

export function sopProgress(files: CaseFile[], checkedDeliverables: string[]): SopStep[] {
  const drafts = files.filter((f) => f.kind === 'resumeDraft')
  return [
    { id: 's1', label: '自检包', done: files.some((f) => f.kind === 'checklist') },
    { id: 's2', label: '岗位解码', done: files.some((f) => f.kind === 'doc' && f.name.includes('岗位解码表')) },
    { id: 's3', label: '访谈追问', done: files.some((f) => f.kind === 'doc' && f.name.includes('访谈追问')) },
    { id: 's4', label: '匹配诊断', done: files.some((f) => f.kind === 'doc' && f.name.includes('匹配度诊断')) },
    { id: 's5', label: '简历初稿', done: drafts.length >= 1 },
    { id: 's6', label: '反馈迭代', done: drafts.length >= 2 },
    { id: 's7', label: '终稿交付', done: DELIVERABLE_CHECKLIST.every((d) => checkedDeliverables.includes(d.id)) },
    { id: 's8', label: '面试衔接', done: files.some((f) => f.name.includes('话术卡')), optional: true },
  ]
}
