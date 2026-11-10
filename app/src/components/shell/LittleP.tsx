import { useLocation } from 'react-router-dom'
import { useUi } from '../../store/ui'

/**
 * 问小 P（2026-11-10 用户点子）：常驻悬浮圆钮——P 字标即「Perfect Partner 完美搭档」，
 * 点一下唤起命令面板（Ctrl K 同款），输入问题选「问问小 P」即 AI 全库问答。
 * 零新管线：AI 检索/回答/来源全在面板既有链路里，这里只是给它一个有性格的入口。
 * 首访引导页不显示（引导全屏独占，圆钮在下层是视觉冗余）。
 */
export function LittleP() {
  const openPalette = useUi((s) => s.openPalette)
  const { pathname } = useLocation()
  if (pathname === '/welcome') return null
  return (
    <button
      type="button"
      className="little-p"
      onClick={() => openPalette('littlep')}
      aria-label="问小 P（AI 全库问答）"
      title="问小 P：AI 全库问答（等价于 Ctrl K）"
    >
      <img src="favicon.svg" alt="" aria-hidden />
      <span className="little-p-tag">问小 P</span>
    </button>
  )
}
