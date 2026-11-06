import { NavLink, useLocation } from 'react-router-dom'
import { MODULE_NAV, PALETTE_PAGES } from '../../content/nav'

/**
 * 模块子页 Tab 条（2026-11-06 手机端验收）：进入某模块的子页后，
 * 窄屏下在页头下方横排显示该模块全部子页，点 Tab 即切换——不用再开「更多」来回跳。
 * 数据源：模块 children（输入 4 子页 / 回路 4 子页）+ 输出模块按路径取注册表页面
 * （输出是单链接模块无 children，用 /output 前缀过滤，排除重定向旧入口）。
 * 仅窄屏显示（shell.css 控制默认隐藏）；单页模块（处理）不渲染。
 */
const OUTPUT_TABS = PALETTE_PAGES.filter((p) => p.to.startsWith('/output'))

export function MobileSubTabs() {
  const { pathname } = useLocation()

  let tabs: { to: string; label: string }[] | null = null
  const mod = MODULE_NAV.find(
    (m) => m.children && m.children.some((c) => pathname === c.to || pathname.startsWith(c.to + '/')),
  )
  if (mod?.children) {
    tabs = mod.children.map((c) => ({ to: c.to, label: c.label }))
  } else if (pathname.startsWith('/output') && OUTPUT_TABS.length > 0) {
    tabs = OUTPUT_TABS.map((p) => ({ to: p.to, label: p.label }))
  }
  if (!tabs) return null

  return (
    <nav className="mobile-subtabs" aria-label="模块子页">
      {tabs.map((t) => {
        const active = pathname === t.to || pathname.startsWith(t.to + '/')
        return (
          <NavLink
            key={t.to}
            to={t.to}
            end
            className={`mst${active ? ' on' : ''}`}
            aria-current={active ? 'page' : undefined}
          >
            {t.label}
          </NavLink>
        )
      })}
    </nav>
  )
}
