import { describe, expect, it } from 'vitest'
import { extractMaterialChecked } from './fileExtract'

/** 文件提取的反馈契约：成功报字数、失败给原因、扫描件/老格式有具体指引——上传反馈依赖这些分支 */

const fileOf = (name: string, content: string) => new File([content], name, { type: 'text/plain' })

describe('extractMaterialChecked（上传反馈契约）', () => {
  it('txt/md 提取成功，返回全文', async () => {
    const r = await extractMaterialChecked(fileOf('自检包.txt', '表一基本盘：现公司为区域性银行。'))
    expect(r.ok).toBe(true)
    expect(r.error).toBeUndefined()
    expect(r.text).toContain('区域性银行')
  })

  it('提取结果为空白时判定为失败，给出扫描件指引而非静默（PDF 空内容走同一分支）', async () => {
    const r = await extractMaterialChecked(fileOf('空白.txt', '   \n  '))
    expect(r.ok).toBe(false)
    expect(r.error).toContain('扫描版')
  })

  it('老 .doc 格式明确报不支持并指引另存', async () => {
    const r = await extractMaterialChecked(fileOf('旧简历.doc', '内容无所谓'))
    expect(r.ok).toBe(false)
    expect(r.error).toContain('.docx')
  })
})
