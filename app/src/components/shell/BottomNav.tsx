import { NavLink } from 'react-router-dom'
import { BOTTOM_NAV } from '../../content/nav'

/** 移动端底部导航（PRD §4.1：<768px 显示五项） */
export function BottomNav() {
  return (
    <nav className="bottomnav" aria-label="移动端导航">
      {BOTTOM_NAV.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.end}
          className={({ isActive }) => `bn${isActive ? ' on' : ''}`}
        >
          <span className="ico" aria-hidden>{item.icon}</span>
          {item.label}
        </NavLink>
      ))}
    </nav>
  )
}
