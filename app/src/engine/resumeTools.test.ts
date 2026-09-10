import { describe, expect, it } from 'vitest'
import {
  buildDecodePrompt,
  buildDiagnosePrompt,
  buildRewritePrompt,
  decodeToText,
  diagnosisToText,
  parseDecode,
  parseDiagnosis,
} from './resumeTools'

describe('parseDecode（JD 解码 JSON）', () => {
  it('标准解析，空数组容忍', () => {
    const d = parseDecode('{"p0":["带团队"],"p1":["数据驱动"],"p2":[],"keywords":["跨部门推动"]}')
    expect(d.p0).toEqual(['带团队'])
    expect(d.p2).toEqual([])
    expect(d.keywords).toEqual(['跨部门推动'])
  })
  it('围栏容忍；全空报错', () => {
    const d = parseDecode('```json\n{"p0":["a"],"p1":[],"p2":[],"keywords":[]}\n```')
    expect(d.p0).toEqual(['a'])
    expect(() => parseDecode('{"p0":[],"p1":[],"p2":[],"keywords":[]}')).toThrow()
    expect(() => parseDecode('不会')).toThrow()
  })
})

describe('decodeToText / 匹配诊断', () => {
  it('解码表转文本形态', () => {
    const t = decodeToText({ p0: ['带 10 人团队'], p1: [], p2: ['英语'], keywords: ['数据说话'] })
    expect(t).toContain('P0 必须证明：')
    expect(t).toContain('- 带 10 人团队')
    expect(t).toContain('隐性能力词：数据说话')
  })
  it('parseDiagnosis：分数夹取到 0-5', () => {
    const d = parseDiagnosis('{"rows":[{"requirement":"带团队","evidence":"带过 8 人","score":9,"gap":""},{"requirement":"英语","evidence":"","score":-1,"gap":"需补"}],"summary":"整体匹配"}')
    expect(d.rows[0]!.score).toBe(5)
    expect(d.rows[1]!.score).toBe(0)
    expect(d.summary).toBe('整体匹配')
  })
  it('diagnosisToText：有证据出证据行，无证据出缺口行', () => {
    const t = diagnosisToText({
      rows: [
        { requirement: '带团队', evidence: '带过 8 人', score: 4, gap: '' },
        { requirement: '英语', evidence: '', score: 0, gap: '需补' },
      ],
      summary: 'ok',
    })
    expect(t).toContain('【4/5】带团队｜证据：带过 8 人')
    expect(t).toContain('【0/5】英语｜缺口：需补')
  })
})

describe('提示词组装', () => {
  it('岗位解码提示词含 JSON 格式与 JD 全文', () => {
    const p = buildDecodePrompt('负责产品规划')
    expect(p).toContain('"p0"')
    expect(p).toContain('负责产品规划')
  })
  it('匹配诊断提示词含解码表与素材', () => {
    const p = buildDiagnosePrompt('P0 必须证明：带团队', [{ title: '自检包', body: '带过 8 人团队' }])
    expect(p).toContain('【岗位解码表】')
    expect(p).toContain('带过 8 人团队')
  })
  it('改写提示词：无数字时占位不编造，解码表可选', () => {
    const p = buildRewritePrompt('组织过活动', 'P0 必须证明：带团队')
    expect(p).toContain('（数字待补）')
    expect(p).toContain('P0 必须证明：带团队')
    const p2 = buildRewritePrompt('组织过活动', null)
    expect(p2).not.toContain('【岗位解码表】')
  })
})
