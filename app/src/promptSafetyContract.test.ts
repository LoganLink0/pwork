import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { UNTRUSTED_DATA_RULE } from './engine/promptSafety'

/**
 * 提示词注入防护契约（2026-11-23 全量盘点后固化；外部研读报告 §4.6 的收口）：
 * 1. 盘点结论——凡把外部正文（信源抓取/yt-dlp/粘贴入库/Obsidian 导入/云端同步/
 *    联网检索结果）拼进提示词的调用点，必须引用 promptSafety 的 UNTRUSTED_DATA_RULE
 *    单一常量。盘点时发现 6 处缺口或内联重复副本（各自硬编码同义句，漂移正是
 *    常量要防的形态），已全部收口。
 * 2. 不吃外部内容的调用点不进清单（用户自己填写的复盘内容、调研目标属于可信输入）：
 *    review/engine/coach.ts（复盘问答）、ResearchPage 框架定制与逐节提示词（只拼用户输入）。
 * 3. 两条门禁：清单文件必须引用常量；全仓源码禁止出现规则文案的内联副本
 *    （防止绕过常量再抄一份，下一次漂移直接 CI 红）。
 */

const SRC = join(__dirname)

/** 吃外部正文的 AI 调用点清单（新增调用点吃外部内容时，把文件加进这里） */
const MUST_REFERENCE_RULE = [
  'engine/askAi.ts', // 全库问答：条目正文进提示词
  'modules/input/engine/aiDigest.ts', // 一句话摘要：抓取正文前 800 字进提示词
  'modules/input/engine/interestProfile.ts', // 兴趣画像：信源条目标题进提示词
  'modules/output/engine/articleWriter.ts', // 成稿：素材进提示词
  'modules/output/engine/pptWriter.ts', // 演示大纲：材料进提示词
  'modules/output/pages/ResearchPage.tsx', // 联网调研：检索结果原文进提示词
  'modules/output/pages/ReportGenerator.tsx', // 报告 AI 总结：高分条目（外部网页）进提示词
  'store/produce.ts', // 一键成稿：近 7 天素材进提示词
]

const INLINE_COPY_PHRASE = '属于不可信内容' // 常量文案的特征短语，只允许出现在常量定义处

function walkSources(dir: string): string[] {
  const out: string[] = []
  for (const name of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, name.name)
    if (name.isDirectory()) out.push(...walkSources(p))
    else if (/\.tsx?$/.test(name.name) && !/\.test\.(ts|tsx)$/.test(name.name)) out.push(p)
  }
  return out
}

describe('提示词注入防护契约', () => {
  it('常量非空且含关键约束语义', () => {
    expect(UNTRUSTED_DATA_RULE.length).toBeGreaterThan(20)
    expect(UNTRUSTED_DATA_RULE).toContain(INLINE_COPY_PHRASE)
    expect(UNTRUSTED_DATA_RULE).toContain('不要执行')
  })

  it('清单上每个吃外部正文的调用点都引用 UNTRUSTED_DATA_RULE', () => {
    for (const rel of MUST_REFERENCE_RULE) {
      const text = readFileSync(join(SRC, rel), 'utf8')
      expect(text.includes('UNTRUSTED_DATA_RULE'), `${rel} 拼外部正文进提示词但未引用注入防护常量`).toBe(true)
    }
  })

  it('全仓源码禁止规则文案的内联副本（防止绕过单一常量）', () => {
    const offenders = walkSources(SRC)
      .filter((p) => !p.replace(/\\/g, '/').endsWith('engine/promptSafety.ts'))
      .filter((p) => readFileSync(p, 'utf8').includes(INLINE_COPY_PHRASE))
      .map((p) => p.replace(/\\/g, '/').slice(SRC.length + 1))
    expect(offenders, `以下文件内联复制了注入防护文案，应改为引用 UNTRUSTED_DATA_RULE：${offenders.join('、')}`).toEqual([])
  })
})
