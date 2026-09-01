import { describe, expect, it } from 'vitest'
import { checkSmart } from './smart'

describe('SMART 目标检查', () => {
  it('空泛目标（课程 08 讲反例）三项全不过', () => {
    const r = checkSmart('增强客户服务意识')
    expect(r.specific).toBe(false)
    expect(r.measurable).toBe(false)
    expect(r.timeBound).toBe(false)
    expect(r.hints.length).toBe(3)
  })

  it('合格目标（数字 + 期限）通过', () => {
    const r = checkSmart('一个季度内，把客户满意度提升至95%')
    expect(r.measurable).toBe(true)
    expect(r.timeBound).toBe(true)
    expect(r.specific).toBe(true)
    expect(r.hints).toEqual([])
  })

  it('有动作但缺数字与期限，只提示缺失项', () => {
    const r = checkSmart('把客户响应流程重新梳理一遍')
    expect(r.measurable).toBe(false)
    expect(r.timeBound).toBe(false)
    expect(r.hints.length).toBe(2)
  })

  it('空字符串安全处理', () => {
    const r = checkSmart('')
    expect(r.measurable).toBe(false)
    expect(r.timeBound).toBe(false)
  })
})
