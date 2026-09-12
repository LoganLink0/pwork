import { describe, expect, it } from 'vitest'
import {
  buildInterviewPrompt,
  DELIVERABLE_CHECKLIST,
  selfCheckPackMarkdown,
  sopProgress,
  SELF_CHECK_SECTIONS,
  type SelfCheckSection,
} from './resumeWorkflow'
import type { CaseFile } from '../types'

const file = (name: string, kind: CaseFile['kind']): CaseFile => ({
  id: `f_${name}`,
  caseId: 'c1',
  name,
  kind,
  text: '',
  createdAt: '2026-09-12T00:00:00.000Z',
  updatedAt: '2026-09-12T00:00:00.000Z',
  deletedAt: null,
  schemaVersion: 1,
})

describe('自检包生成（SOP①）', () => {
  it('五张表齐全，客户信息注入头部', () => {
    const md = selfCheckPackMarkdown({ caseName: '张三 · XX银行信贷岗', clientName: '张三', targetRole: '信贷岗' })
    for (const s of SELF_CHECK_SECTIONS) expect(md).toContain(`## ${s.title}`)
    expect(md).toContain('客户 | 张三')
    expect(md).toContain('目标岗位 | 信贷岗')
    expect(md).toContain('案例 | 张三 · XX银行信贷岗')
  })

  it('竖表含字段与提示，横表行数与行标签正确', () => {
    const md = selfCheckPackMarkdown()
    // 表二：表头 + 3 行
    expect(md).toContain('| 年度 | 指标（quota） | 完成情况 | 团队排名 | 最拿得出手的一单 |')
    // 表三：行标签来自 GRID_ROW_LABELS
    expect(md).toContain('| 你负责的部分 |')
    expect(md).toContain('| 结果与证据 |')
    // 表四：六个能力行
    expect(md).toContain('| 获客 / 线索开发 |')
    expect(md).toContain('| 跨部门协调 |')
    // 竖表：表五的目标岗位字段
    expect(md).toContain('最担心的面试问题（3 个）')
  })

  it('表三/表四这类横表在数据里带行标签定义（导 Word 时补行首）', () => {
    const gridTables = SELF_CHECK_SECTIONS.filter((s: SelfCheckSection) => s.kind === 'grid')
    expect(gridTables).toHaveLength(3) // 表二/表三/表四
  })
})

describe('访谈追问（SOP③）', () => {
  it('提示词带解码表与材料，无材料时明示', () => {
    const p1 = buildInterviewPrompt('P0：3 年经验', [{ name: '自检包', text: '业绩 210 万' }])
    expect(p1).toContain('P0：3 年经验')
    expect(p1).toContain('【自检包】')
    expect(buildInterviewPrompt('P0', [])).toContain('暂无其他材料')
  })
})

describe('交付物核对清单（SOP⑦）', () => {
  it('简历修改服务共 7 件，与手册一致', () => {
    expect(DELIVERABLE_CHECKLIST).toHaveLength(7)
    expect(DELIVERABLE_CHECKLIST.map((d) => d.id)).toEqual([
      'resume-final', 'diagnosis', 'quantified', 'star', 'portfolio', 'update-guide', 'copyright',
    ])
  })
})

describe('八步进度推导（纯函数）', () => {
  it('空案例全部未完成；第八步标记可选', () => {
    const steps = sopProgress([], [])
    expect(steps).toHaveLength(8)
    expect(steps.every((s) => !s.done)).toBe(true)
    expect(steps[7]!.optional).toBe(true)
  })

  it('材料/过程文档/简历稿版本数逐项点亮；⑦由核对清单决定；⑧看话术卡', () => {
    const base = [
      file('自检包 2026/9/1', 'checklist'),
      file('岗位解码表 · 2026-09-01', 'doc'),
      file('访谈追问清单 · 2026-09-02', 'doc'),
      file('匹配度诊断 · 2026-09-03', 'doc'),
      file('简历稿 · 9/1 10:00', 'resumeDraft'),
    ]
    const partial = sopProgress(base, [])
    expect(partial.filter((s) => s.done).map((s) => s.id)).toEqual(['s1', 's2', 's3', 's4', 's5'])
    // s6：两版才亮
    const twoFiles = [...base, file('简历稿 · 9/3 18:00', 'resumeDraft')]
    expect(sopProgress(twoFiles, []).find((s) => s.id === 's6')!.done).toBe(true)
    // s7：核对清单全勾
    const allIds = DELIVERABLE_CHECKLIST.map((d) => d.id)
    expect(sopProgress(twoFiles, allIds).find((s) => s.id === 's7')!.done).toBe(true)
    // s8：话术卡材料
    expect(sopProgress([...twoFiles, file('面试话术卡', 'other')], allIds).find((s) => s.id === 's8')!.done).toBe(true)
  })
})
