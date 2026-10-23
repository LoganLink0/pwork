import { useEffect, useRef, useState } from 'react'
import { Icon } from './icons'

export interface NavTab {
  id: string
  label: string
  icon: string
}

/**
 * 设置页/帮助页共用的左栏分类导航（桌面竖排、<768px 横向滚动）。
 * 窄屏横滚时右侧加渐隐提示（can-right），滑到底自动消失——不提示则最后的分类会被漏掉。
 */
export function SettingsNav({
  tabs,
  active,
  onSelect,
  ariaLabel,
}: {
  tabs: readonly NavTab[]
  active: string
  onSelect: (id: string) => void
  ariaLabel: string
}) {
  const navRef = useRef<HTMLElement | null>(null)
  const [canRight, setCanRight] = useState(false)

  useEffect(() => {
    const el = navRef.current
    if (!el) return
    const update = () => setCanRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 1)
    update()
    el.addEventListener('scroll', update, { passive: true })
    window.addEventListener('resize', update)
    return () => {
      el.removeEventListener('scroll', update)
      window.removeEventListener('resize', update)
    }
  }, [])

  return (
    <nav ref={navRef} className={`settings-nav${canRight ? ' can-right' : ''}`} aria-label={ariaLabel}>
      {tabs.map((t) => (
        <button
          key={t.id}
          type="button"
          className={`settings-nav-item${active === t.id ? ' on' : ''}`}
          onClick={() => onSelect(t.id)}
          aria-current={active === t.id ? 'page' : undefined}
        >
          <span aria-hidden>
            <Icon name={t.icon} />
          </span>{' '}
          {t.label}
        </button>
      ))}
    </nav>
  )
}
