import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createElement } from 'react'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import App from '../App'
import { MODULE_NAV, PAGE_META, WORKSPACE_NAV, crumbFor } from './nav'
import { CATEGORY_ORDER, ENGINE_LABEL, PROCESS_TOOLS, toolRoute } from './processTools'

/**
 * 跨文件契约测试（AIHOT 审查教训的落地，2026-09-29）：壳层的路由表、导航注册、
 * 面包屑元信息、命令面板、工具注册表分散在多个文件里靠手工同步——本会话曾真实发生
 * 「命令面板漏收录顶层直达模块（案例/处理/输出）」的静默漂移（commit 5787a35 修复）。
 * 新页面/新模块漏登记，这里当场红。
 */

const here = dirname(fileURLToPath(import.meta.url))

describe('壳层契约：路由 ↔ PAGE_META ↔ 面包屑', () => {
  it('App.tsx 每条路由在 PAGE_META 有条目或被前缀匹配（不落回首页兜底）', () => {
    const src = readFileSync(join(here, '../App.tsx'), 'utf-8')
    const literals = [...src.matchAll(/path="([^"]+)"/g)].map((m) => m[1]!)
    expect(literals.length).toBeGreaterThan(10) // 正则没抓到路由时测试自身失效
    for (const p of literals) {
      if (p === '*' || p === 'index' || p.startsWith(':')) continue
      // 相对子路由属于嵌套父级（/input/notes 与 /review），拼成完整路径再验
      const full = p.startsWith('/') ? p : `/review/${p}`
      if (PAGE_META[full]) continue
      const fallback = PAGE_META['/']!
      const crumb = crumbFor(full)
      expect(crumb[1], `路由 ${full} 缺面包屑：PAGE_META 无条目也无前缀匹配`).not.toBe(fallback[1])
    }
  })

  it('PAGE_META 不含已下线/拼错的键（每条都能对上一个路由字面量或其详情形态）', () => {
    const src = readFileSync(join(here, '../App.tsx'), 'utf-8')
    const literals = new Set(
      [...src.matchAll(/path="([^"]+)"/g)]
        .map((m) => m[1]!)
        .filter((p) => p !== '*' && p !== 'index' && !p.startsWith(':'))
        .map((p) => (p.startsWith('/') ? p : `/review/${p}`)),
    )
    for (const key of Object.keys(PAGE_META)) {
      if (key === '/') continue
      // 详情路由（如 /input/notes/:id 的 PAGE_META 写法）允许前缀形态：去掉 : 段后应命中
      const base = key.replace(/\/:[^/]+/g, '')
      expect(
        literals.has(key) || literals.has(base) || [...literals].some((l) => base.startsWith(l)),
        `PAGE_META 键 ${key} 找不到对应路由——已下线或拼错？`,
      ).toBe(true)
    }
  })
})

describe('壳层契约：命令面板 ↔ 导航注册', () => {
  it('面板收录全部导航模块（含顶层直达）——2026-09 会话曾漏案例/处理/输出', async () => {
    const user = userEvent.setup()
    render(createElement(App))
    await user.keyboard('{Control>}k{/Control}')
    const dialog = await screen.findByRole('dialog', { name: '命令面板' })
    const labels = [...WORKSPACE_NAV.map((w) => w.label), ...MODULE_NAV.map((m) => m.label)]
    for (const label of labels) {
      expect(within(dialog).getAllByText(label).length, `命令面板缺模块「${label}」`).toBeGreaterThan(0)
    }
  })
})

describe('壳层契约：处理工具注册表', () => {
  it('PROCESS_TOOLS 字段完整：id 唯一、分类/引擎/状态合法、external 必带地址', () => {
    const ids = new Set<string>()
    expect(PROCESS_TOOLS.length).toBeGreaterThan(10)
    for (const t of PROCESS_TOOLS) {
      expect(t.id, '工具 id 非空').toBeTruthy()
      expect(ids.has(t.id), `工具 id 重复：${t.id}`).toBe(false)
      ids.add(t.id)
      expect((CATEGORY_ORDER as string[]).includes(t.category), `工具 ${t.id} 分类非法`).toBe(true)
      expect(Object.keys(ENGINE_LABEL).includes(t.engine), `工具 ${t.id} 引擎非法`).toBe(true)
      expect(['ready', 'byok-pending'].includes(t.status), `工具 ${t.id} 状态非法`).toBe(true)
      if (t.engine === 'external') {
        expect(t.externalUrl, `外部工具 ${t.id} 缺 externalUrl`).toMatch(/^https?:\/\//)
      }
      if (t.engine === 'app') {
        expect(t.route, `应用入口工具 ${t.id} 缺应用内路由`).toMatch(/^\//)
      }
      if (t.status === 'byok-pending') {
        expect(t.requires, `byok 工具 ${t.id} 缺点亮条件说明`).toBeTruthy()
      }
      expect(toolRoute(t.id)).toBe(t.route ?? `/process/t/${t.id}`)
    }
  })

  it('导航 countFrom 只指向真实计数来源', () => {
    const allowed = new Set(['notes', 'sources'])
    for (const m of MODULE_NAV) {
      for (const c of m.children ?? []) {
        if (c.countFrom) {
          expect(allowed.has(c.countFrom), `导航 ${c.label} 的 countFrom 指向不存在的来源：${c.countFrom}`).toBe(true)
        }
      }
    }
  })
})
