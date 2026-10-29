import { createElement } from 'react'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import App from '../App'
import { PAGE_REGISTRY } from '../registry'
import { MODULE_NAV, PALETTE_PAGES, PAGE_META, WORKSPACE_NAV, crumbFor } from './nav'
import { CATEGORY_ORDER, ENGINE_LABEL, PROCESS_TOOLS, toolRoute } from './processTools'

/**
 * 跨文件契约测试（AIHOT 审查教训的落地，2026-09-29；0.4-5 注册表化后升级）：
 * 路由/导航/面包屑/命令面板已单点化为页面注册表（registry.tsx），四处入口全部派生——
 * 「漏登记」类漂移从"靠测试兜底拼写"变为"注册表天然保证"。本文件改为断言注册表
 * 自身的完备性（字段完整、派生一致、面包屑可解析），外加面板收录的渲染冒烟。
 */

describe('注册表完备性：字段与唯一性', () => {
  it('每条注册有 path/label/mark/meta；path 与 metaPath 键全局唯一', () => {
    expect(PAGE_REGISTRY.length).toBeGreaterThan(20) // 数量骤降说明登记被误删
    const paths = new Set<string>()
    const metaKeys = new Set<string>()
    for (const p of PAGE_REGISTRY) {
      expect(p.path, 'path 必填且以 / 开头').toMatch(/^\//)
      expect(p.label, `${p.path} 缺 label`).toBeTruthy()
      expect(p.mark, `${p.path} 缺 mark`).toMatch(/^mark-/)
      expect(p.meta.length).toBe(2)
      const key = p.metaPath ?? p.path
      expect(metaKeys.has(key), `meta 键重复：${key}`).toBe(false)
      metaKeys.add(key)
      expect(paths.has(p.path), `注册 path 重复：${p.path}`).toBe(false)
      paths.add(p.path)
      if (p.redirect) continue // 重定向页不需要组件
      if (p.children?.length) continue // 布局页组件在 children
      expect(p.loader, `${p.path} 缺组件`).toBeTruthy()
    }
  })

  it('导航可见条目（nav!==' + "'none'" + '）派生出侧栏与面板；面包屑全部可解析', () => {
    const ws = new Set(WORKSPACE_NAV.map((w) => w.to))
    const moduleKids = new Set(MODULE_NAV.flatMap((m) => (m.children ?? []).map((c) => c.to)))
    const moduleTops = new Set(MODULE_NAV.filter((m) => m.to).map((m) => m.to!))
    const palette = new Set(PALETTE_PAGES.map((p) => p.to))
    for (const p of PAGE_REGISTRY) {
      if (p.nav === 'none' || p.redirect) continue
      const inNav = ws.has(p.path) || moduleKids.has(p.path) || moduleTops.has(p.path)
      expect(inNav || palette.has(p.path), `${p.path} 声称导航可见但侧栏与面板都派生不到`).toBe(true)
      // 面包屑：精确或前缀最长匹配都不得落回首页兜底（首页自身除外——它就是兜底目标）
      if (p.path === '/') continue
      const fallback = PAGE_META['/']!
      expect(crumbFor(p.path)[1], `${p.path} 面包屑解析失败`).not.toBe(fallback[1])
    }
    // 注册表 → WORKSPACE_NAV 派生一致（防止派生逻辑悄悄漏项）
    for (const w of WORKSPACE_NAV) {
      expect(PAGE_REGISTRY.some((p) => p.path === w.to && p.nav === 'workspace'), `WORKSPACE_NAV 出现了非工作区注册项：${w.to}`).toBe(true)
    }
  })

  it('关键入口健在（最常被找的页面）：今日/待办/速记/信源/信息日报/条目库/处理/输出/复盘/设置/帮助', () => {
    const must = ['/', '/tasks', '/input/notes', '/input/sources', '/input/digest', '/input/items', '/process', '/output', '/review', '/settings', '/help']
    for (const path of must) {
      expect(PAGE_REGISTRY.some((p) => p.path === path), `关键页面未注册：${path}`).toBe(true)
    }
  })
})

describe('壳层契约：命令面板 ↔ 导航注册（渲染冒烟）', () => {
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
