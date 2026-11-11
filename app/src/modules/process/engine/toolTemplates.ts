/**
 * 外部工具的文本模板层（阶段二 2.4）：占位符填充 + URL 安全校验。
 * 占位符：{selected}=用户当前文本；{title}=条目/速记标题；{noteId}/{itemId}=实体 id。
 * 无上下文时占位符置空不报错（验收③）。
 * 安全面两条硬边界（测试锁死）：
 * ① 打开地址只放行 http/https 与白名单自定义协议（obsidian://——OS 注册协议由系统分发，
 *    非页面执行面）；javascript:/data:/file: 一律拒绝；
 * ② {selected} 逐占位符先编码再替换：用户文本的 & 等字符不逃逸出参数位，模板其余部分不受影响。
 */

export interface CallVars {
  selected?: string
  title?: string
  noteId?: string
  itemId?: string
}

const PLACEHOLDERS = ['{selected}', '{title}', '{noteId}', '{itemId}'] as const

/** 地址协议白名单：http/https + 明确列入的自定义协议 */
const URL_ALLOWED_SCHEMES = ['http', 'https', 'obsidian']

function schemeOf(url: string): string {
  const m = url.trim().match(/^([a-z][a-z0-9+.-]*):/i)
  return m ? m[1].toLowerCase() : ''
}

/** 模板填充：占位符替换为变量值，无上下文的占位符置空 */
export function fillTemplate(template: string, vars: CallVars): string {
  const val = (v: string | undefined) => (typeof v === 'string' ? v : '')
  return template
    .replaceAll('{selected}', val(vars.selected))
    .replaceAll('{title}', val(vars.title))
    .replaceAll('{noteId}', val(vars.noteId))
    .replaceAll('{itemId}', val(vars.itemId))
}

/**
 * 模板 → 可打开的地址；不安全模板返回 null（调用方如实提示，不静默降级）。
 * 逐占位符先编码再替换；最终形态再过协议白名单。
 */
export function buildCallUrl(template: string, vars: CallVars): string | null {
  let out = template
  out = out.replaceAll('{selected}', encodeURIComponent(vars.selected ?? ''))
  out = out.replaceAll('{title}', encodeURIComponent(vars.title ?? ''))
  out = out.replaceAll('{noteId}', encodeURIComponent(vars.noteId ?? ''))
  out = out.replaceAll('{itemId}', encodeURIComponent(vars.itemId ?? ''))
  const scheme = schemeOf(out)
  if (!URL_ALLOWED_SCHEMES.includes(scheme)) return null
  return out
}

/** 模板是否含指定占位符（工具定义自检/界面提示用） */
export function hasPlaceholder(template: string, which: (typeof PLACEHOLDERS)[number]): boolean {
  return template.includes(which)
}

/** 模板里实际用到的占位符清单（工具页提示「这条会带什么」） */
export function usedPlaceholders(template: string): string[] {
  return PLACEHOLDERS.filter((p) => template.includes(p))
}
