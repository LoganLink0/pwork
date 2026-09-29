import { describe, expect, it } from 'vitest'
import { extractAiJson, parseAiJson, repairControlChars } from './aiJson'

/** AI 输出 JSON 提取契约：围栏/前后杂文/字符串内裸控制字符——每一层都是真实模型行为 */

describe('aiJson（AIHOT 三层防线移植）', () => {
  it('剥围栏 + 定位首尾括号（容忍 JSON 前后杂文）', () => {
    expect(parseAiJson('```json\n{"pass":true}\n```')).toEqual({ pass: true })
    expect(parseAiJson('好的，结果如下：\n{"total": 88}\n以上是评分，希望有帮助。')).toEqual({ total: 88 })
    expect(parseAiJson('[1, 2, 3] 后面跟着解释')).toEqual([1, 2, 3])
  })

  it('字符串字面量内的裸控制字符被修复（此前 JSON.parse 必炸）', () => {
    const raw = '{"reason": "第一段\x0b第二段", "n": 1}'
    expect(() => JSON.parse(raw)).toThrow() // 复现问题
    expect(parseAiJson(raw)).toEqual({ reason: '第一段\x0b第二段', n: 1 })
    // 修复只动字符串内部：token 之间的换行/制表符原样保留
    expect(parseAiJson('{\n  "a": 1,\r\n  "b": 2\n}')).toEqual({ a: 1, b: 2 })
  })

  it('转义序列不受影响（\\" 与 \\\\ 后的字符不被误判）', () => {
    expect(repairControlChars('{"q": "他说\\"好\\"\\\\n结束"}')).toBe('{"q": "他说\\"好\\"\\\\n结束"}')
    expect(parseAiJson('{"q": "他说\\"好\\""}')).toEqual({ q: '他说"好"' })
  })

  it('无 JSON / 无尾括号时报可读错误', () => {
    expect(() => extractAiJson('抱歉，我不会。')).toThrow('没有 JSON')
    expect(() => extractAiJson('{"broken": ')).toThrow('完整的 JSON')
  })
})
