/**
 * 文件文字提取：Word(.docx)/PDF/MD/TXT → 纯文本。
 * 提取结果必须向用户如实报告（成功字数 / 失败原因），调用方不得静默吞掉。
 */

export interface ExtractResult {
  ok: boolean
  text: string
  /** 失败原因（ok=false 时给出）；成功但 0 字也给提示（常见于扫描版 PDF） */
  error?: string
}

export async function extractMaterialChecked(file: File): Promise<ExtractResult> {
  try {
    const text = await extractMaterial(file)
    if (text.trim() === '') {
      return { ok: false, text: '', error: '没有提取到文字——如果是扫描版 PDF 或图片版 Word，请改用文字版文件，或直接复制粘贴内容' }
    }
    return { ok: true, text }
  } catch (e) {
    return { ok: false, text: '', error: e instanceof Error ? e.message : String(e) }
  }
}

export async function extractMaterial(file: File): Promise<string> {
  const lower = file.name.toLowerCase()
  if (lower.endsWith('.docx')) {
    const mod: { extractRawText(input: { arrayBuffer: ArrayBuffer }): Promise<{ value: string }> } =
      // @ts-expect-error mammoth 浏览器构建无类型声明
      await import('mammoth/mammoth.browser')
    const r = await mod.extractRawText({ arrayBuffer: await file.arrayBuffer() })
    return r.value ?? ''
  }
  if (lower.endsWith('.pdf')) {
    const pdfjs = await import('pdfjs-dist')
    const worker = await import('pdfjs-dist/build/pdf.worker.min.mjs?url')
    pdfjs.GlobalWorkerOptions.workerSrc = worker.default
    const doc = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise
    let out = ''
    for (let i = 1; i <= Math.min(doc.numPages, 60); i++) {
      const page = await doc.getPage(i)
      const tc = await page.getTextContent()
      out += tc.items.map((it) => ('str' in it ? it.str : '')).join(' ') + '\n'
    }
    await doc.cleanup()
    return out
  }
  // .txt / .md / 其他文本形态（.doc 老格式不支持，明确报错）
  if (lower.endsWith('.doc')) {
    throw new Error('不支持老版 .doc 格式——请另存为 .docx，或直接复制粘贴内容')
  }
  return file.text()
}
