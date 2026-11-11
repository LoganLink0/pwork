import { readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { APP_ACTIONS, actionById, wheelActionForKind } from '../engine/actions'

/**
 * 插件化契约测试（阶段二 2.6）：清单断言——模块目录完备性、注册表路径指向、
 * 动作注册表字段完备（网关端点跨层一致见 gatewayContract.test.ts）。
 * 结构漂移在 CI 即被拦下，不用等走查。
 */

const SRC = join(__dirname, '..')

/** 四模块目录清单：每个模块必须 pages + components 自包含 */
const MODULES = ['review', 'process', 'input', 'output'] as const

describe('模块目录完备性', () => {
  it('四模块目录各含 pages/ 与 components/（或引擎）', () => {
    for (const m of MODULES) {
      const dir = join(SRC, 'modules', m)
      expect(hasDir(join(dir, 'pages')), `modules/${m}/pages 缺失`).toBe(true)
      const hasComp = hasDir(join(dir, 'components')) || hasDir(join(dir, 'engine'))
      expect(hasComp, `modules/${m} 应含 components 或 engine`).toBe(true)
    }
  })

  it('注册表里四模块的路由懒加载全部指向 modules/ 路径', () => {
    const src = readFileSync(join(SRC, 'registry.tsx'), 'utf8')
    const modulePages = [/pages\/Process/, /pages\/ProcessToolPage/, /pages\/Notes/, /pages\/NoteEditor/, /pages\/Digest/, /pages\/Sources/, /pages\/Items/, /pages\/InputBlocks/, /pages\/Output/, /pages\/ReportGenerator/, /pages\/ReadOutLoud/, /pages\/DataCard/, /pages\/PptWriter/, /pages\/ArticleDraftPage/, /pages\/ResearchPage/]
    for (const re of modulePages) {
      const line = src.split('\n').find((l) => re.test(l) && l.includes('import('))
      expect(line?.includes('./modules/'), `模块页应从 modules/ 加载：${line?.trim() ?? `缺引用 ${re}`}`).toBe(true)
    }
    // 不允许回潮：注册表不得再从根 pages/ 加载已模块化的页面
    for (const legacy of ['./pages/Process', './pages/Notes', './pages/Digest', './pages/Sources', './pages/Items', './pages/Output', './pages/ReportGenerator']) {
      expect(src.includes(`'${legacy}'`), `注册表出现旧路径回潮：${legacy}`).toBe(false)
    }
  })

  it('回路模块与四模块并列存在（目录化不吞既有模块）', () => {
    expect(hasDir(join(SRC, 'modules', 'review'))).toBe(true)
    expect(hasDir(join(SRC, 'modules', 'process'))).toBe(true)
    expect(hasDir(join(SRC, 'modules', 'input'))).toBe(true)
    expect(hasDir(join(SRC, 'modules', 'output'))).toBe(true)
  })
})

function hasDir(p: string): boolean {
  try {
    return statSync(p).isDirectory()
  } catch {
    return false
  }
}

describe('动作注册表契约（2.3 建立的清单，此处跨入口断言）', () => {
  it('每条动作都有运行所需的完整字段；轮盘映射动作存在', () => {
    expect(APP_ACTIONS.length).toBeGreaterThanOrEqual(6)
    for (const a of APP_ACTIONS) {
      expect(a.label).toBeTruthy()
      expect(a.desc).toBeTruthy()
      expect(a.icon).toBeTruthy()
    }
    expect(actionById(wheelActionForKind('quick'))).toBeTruthy()
    expect(actionById(wheelActionForKind('fetch'))).toBeTruthy()
  })
})
