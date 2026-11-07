import { useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { BOTTOM_NAV } from '../../content/nav'
import { Icon } from './icons'
import { MoreSheet } from './MoreSheet'

/** 移动端底部导航（PRD §4.1：<768px 显示五项）。
 *  「更多」打开完整导航抽屉（MoreSheet）——五项到不了的页面全部从这里跳转；
 *  当前页面不在四个主入口里时「更多」点亮。
 *  首访引导页不渲染：引导是全屏独占流程，底栏层级高于引导层会挡住「下一步」（2026-11-07 用户反馈） */
export function BottomNav() {
  const [moreOpen, setMoreOpen] = useState(false)
  const { pathname } = useLocation()
  const inWelcome = pathname === '/welcome'
  const inMainFour = BOTTOM_NAV.slice(0, 4).some(
    (item) => pathname === item.to || (item.to !== '/' && pathname.startsWith(item.to + '/')),
  )
  if (inWelcome) return null
  return (
    <>
      <nav className="bottomnav" aria-label="移动端导航">
        {BOTTOM_NAV.slice(0, 4).map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) => `bn${isActive ? ' on' : ''}`}
          >
            <span className="ico" aria-hidden><Icon name={item.icon} /></span>
            {item.label}
          </NavLink>
        ))}
        <button
          type="button"
          className={`bn${(moreOpen || !inMainFour) ? ' on' : ''}`}
          aria-expanded={moreOpen}
          onClick={() => setMoreOpen((v) => !v)}
        >
          <span className="ico" aria-hidden><Icon name="more" /></span>
          更多
        </button>
      </nav>
      <MoreSheet open={moreOpen} onClose={() => setMoreOpen(false)} />
    </>
  )
}
