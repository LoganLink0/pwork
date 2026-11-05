/**
 * 偏好中心（R15 批，2026-11-05）：让工具适应用户的三项阅读偏好——
 * 界面字号缩放、正文阅读行宽、界面字体。存 localStorage（与主题同款机制），
 * 应用方式 = 写 CSS 变量到 documentElement（tokens.css 的 --fs-* 已 calc 化读取）。
 * 渲染前应用避免闪屏（main.tsx 与主题同位调用）。
 */

export type FontScale = 0.9 | 1 | 1.1 | 1.25 | 1.5
export type ReadingWidth = 'narrow' | 'standard' | 'wide'
export type FontFamilyPref = 'system' | 'serif' | 'mono'

export interface Prefs {
  fontScale: FontScale
  readingWidth: ReadingWidth
  fontFamily: FontFamilyPref
}

const KEY = 'pwork-prefs'

export const DEFAULT_PREFS: Prefs = { fontScale: 1, readingWidth: 'standard', fontFamily: 'system' }

export const FONT_SCALE_OPTIONS: { value: FontScale; label: string }[] = [
  { value: 0.9, label: '小 90%' },
  { value: 1, label: '标准 100%' },
  { value: 1.1, label: '大 110%' },
  { value: 1.25, label: '特大 125%' },
  { value: 1.5, label: '超大 150%' },
]

export const READING_WIDTH_OPTIONS: { value: ReadingWidth; label: string; px: number | null }[] = [
  { value: 'narrow', label: '紧凑', px: 680 },
  { value: 'standard', label: '标准', px: 820 },
  { value: 'wide', label: '全宽', px: null },
]

export const FONT_FAMILY_OPTIONS: { value: FontFamilyPref; label: string; stack: string | null }[] = [
  { value: 'system', label: '系统默认', stack: null },
  { value: 'serif', label: '衬线阅读', stack: 'Georgia, "Source Han Serif SC", "Noto Serif SC", SimSun, serif' },
  { value: 'mono', label: '等宽', stack: '"Cascadia Mono", "JetBrains Mono", Consolas, "Microsoft YaHei", monospace' },
]

export function loadPrefs(): Prefs {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return { ...DEFAULT_PREFS }
    const p = JSON.parse(raw) as Partial<Prefs>
    const scaleOk = FONT_SCALE_OPTIONS.some((o) => o.value === p.fontScale)
    const widthOk = READING_WIDTH_OPTIONS.some((o) => o.value === p.readingWidth)
    const familyOk = FONT_FAMILY_OPTIONS.some((o) => o.value === p.fontFamily)
    return {
      fontScale: scaleOk ? (p.fontScale as FontScale) : DEFAULT_PREFS.fontScale,
      readingWidth: widthOk ? (p.readingWidth as ReadingWidth) : DEFAULT_PREFS.readingWidth,
      fontFamily: familyOk ? (p.fontFamily as FontFamilyPref) : DEFAULT_PREFS.fontFamily,
    }
  } catch {
    return { ...DEFAULT_PREFS }
  }
}

export function savePrefs(prefs: Prefs): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(prefs))
  } catch {
    /* 存储不可用时仅当次生效 */
  }
}

const FAMILY_STACKS: Record<FontFamilyPref, string | null> = Object.fromEntries(
  FONT_FAMILY_OPTIONS.map((o) => [o.value, o.stack]),
) as Record<FontFamilyPref, string | null>

const WIDTH_PX: Record<ReadingWidth, number | null> = Object.fromEntries(
  READING_WIDTH_OPTIONS.map((o) => [o.value, o.px]),
) as Record<ReadingWidth, number | null>

/** 应用到文档根：--font-scale（tokens 的 --fs-* calc 读取）+ --reading-width + 字体族覆盖 */
export function applyPrefs(prefs: Prefs): void {
  const root = document.documentElement
  root.style.setProperty('--font-scale', String(prefs.fontScale))
  const width = WIDTH_PX[prefs.readingWidth]
  if (width != null) root.style.setProperty('--reading-width', `${width}px`)
  else root.style.removeProperty('--reading-width')
  const stack = FAMILY_STACKS[prefs.fontFamily]
  if (stack) root.style.setProperty('--font-body-override', stack)
  else root.style.removeProperty('--font-body-override')
}

/** 加载并应用（启动路径用） */
export function initPrefs(): Prefs {
  const prefs = loadPrefs()
  applyPrefs(prefs)
  return prefs
}

/** 合并写入（设置页改动 → 应用 + 持久化） */
export function applyAndSavePrefs(patch: Partial<Prefs>): Prefs {
  const next = { ...loadPrefs(), ...patch }
  applyPrefs(next)
  savePrefs(next)
  return next
}
