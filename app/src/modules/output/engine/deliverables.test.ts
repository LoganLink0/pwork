import { describe, expect, it } from 'vitest'
import { parseDecodeBlock, parseDiagnosisBlock, renderDecodeReportHtml, renderDiagnosisReportHtml } from './deliverables'

const DECODE_TEXT = `JD 原文：
负责对公客户信贷业务拓展，带团队完成业绩指标。

P0 必须证明：
- 对公信贷业务经验
- 带团队完成业绩

P1 潜力项：
- 数字化工具落地

P2 加分项：
- 银行从业资格

隐性能力词：跨部门推动、数据说话`

const DIAG_TEXT = `匹配度诊断（逐条对照）
【5/5】对公信贷业务经验｜证据：XX 分行对公客户经理 3 年
【4/5】带团队完成业绩｜证据：带 8 人团队，年度完成率 110%
【0/5】数字化工具落地｜缺口：素材中未体现

总体结论：业务匹配度高，数字化是短板。`

describe('parseDecodeBlock', () => {
  it('解析 JD 原文与三层清单、能力词', () => {
    const d = parseDecodeBlock(DECODE_TEXT)
    expect(d.jd).toContain('对公客户信贷业务拓展')
    expect(d.p0).toEqual(['对公信贷业务经验', '带团队完成业绩'])
    expect(d.p1).toEqual(['数字化工具落地'])
    expect(d.p2).toEqual(['银行从业资格'])
    expect(d.keywords).toEqual(['跨部门推动', '数据说话'])
  })
})

describe('parseDiagnosisBlock', () => {
  it('解析分数行（证据/缺口两种形态）与总结', () => {
    const d = parseDiagnosisBlock(DIAG_TEXT)
    expect(d.rows[0]).toEqual({ requirement: '对公信贷业务经验', evidence: 'XX 分行对公客户经理 3 年', score: 5, gap: '' })
    expect(d.rows[2]).toEqual({ requirement: '数字化工具落地', evidence: '', score: 0, gap: '素材中未体现' })
    expect(d.summary).toBe('业务匹配度高，数字化是短板。')
  })
})

describe('报告渲染', () => {
  const decode = parseDecodeBlock(DECODE_TEXT)
  const diagnosis = parseDiagnosisBlock(DIAG_TEXT)
  const meta = { clientName: 'XX 银行 · 对公客户经理', date: '2026-09-03' }

  it('解码报告：三层齐全 + 使用说明 + HTML 转义', () => {
    const html = renderDecodeReportHtml({ ...meta, ...decode, p0: ['<b>对公</b>信贷'] })
    expect(html).toContain('岗位解码报告')
    expect(html).toContain('P0 · 必须证明')
    expect(html).toContain('&lt;b&gt;对公&lt;/b&gt;信贷')
    expect(html).toContain('怎么用这份报告')
  })
  it('诊断报告：表格行、统计与转义', () => {
    const html = renderDiagnosisReportHtml({ ...meta, ...diagnosis, rows: [{ ...diagnosis.rows[0]!, requirement: '<x>' }] })
    expect(html).toContain('岗位匹配度诊断报告')
    expect(html).toContain('共 1 条要求')
    expect(html).toContain('&lt;x&gt;')
    expect(html).toContain('5/5')
  })
})
