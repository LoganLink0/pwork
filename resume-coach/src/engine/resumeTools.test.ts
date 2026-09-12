import { describe, expect, it } from 'vitest'
import { buildDiagnosePrompt, buildDecodePrompt, buildRewritePrompt } from './resumeTools'

/** 提示词契约：材料超长必须截断（控制思考型模型延迟），单件不超过 3000 字 */

describe('诊断提示词的长度契约', () => {
  it('单件材料超 3000 字会被截断，多件材料各自保留', () => {
    const long = '长'.repeat(5000)
    const p = buildDiagnosePrompt('P0：3 年经验', [
      { title: '超长自检包', body: long },
      { title: '短材料', body: '存款 8000 万' },
    ])
    expect(p).toContain('【材料1：超长自检包】')
    expect(p).toContain('【材料2：短材料】')
    expect(p).toContain('存款 8000 万')
    // 截断后整体长度有上限（解码表 + 两件材料头部）
    expect(p.length).toBeLessThan(12000)
    expect(p).not.toContain('长'.repeat(3001))
  })

  it('解码与改写提示词正常带上下文', () => {
    expect(buildDecodePrompt('岗位职责：对公客户经理')).toContain('岗位职责')
    const rw = buildRewritePrompt('负责营销', 'P0：3 年经验')
    expect(rw).toContain('负责营销')
    expect(rw).toContain('P0：3 年经验')
    expect(buildRewritePrompt('负责营销', null)).toContain('负责营销')
  })
})
