import { useLocation } from 'react-router-dom'
import { useUi } from '../../store/ui'

/**
 * 问小 P（2026-11-10 用户点子）：常驻悬浮圆钮——P 字标即「Perfect Partner 完美搭档」，
 * 点一下唤起命令面板（Ctrl K 同款），输入问题选「问问小 P」即 AI 全库问答。
 * 零新管线：AI 检索/回答/来源全在面板既有链路里，这里只是给它一个有性格的入口。
 * 首访引导页不显示（引导全屏独占，圆钮在下层是视觉冗余）。
 * 3.1 logo 动效（2026-11-12）：默认呼吸 / 提问中脉冲（3 秒延迟渐显，短问不闪思考态）/
 * 回答完成轻点弹跳一次（img 以 askDoneAt 为 key——每次回答完成重挂载重放 CSS 动画，
 * 无 state 无定时器，弹跳后接续呼吸也由 CSS 双动画串联）。
 */
export function LittleP() {
  const openPalette = useUi((s) => s.openPalette)
  const askBusy = useUi((s) => s.askBusy)
  const askDoneAt = useUi((s) => s.askDoneAt)
  const { pathname } = useLocation()

  if (pathname === '/welcome') return null
  const cls = 'little-p' + (askBusy ? ' little-p-asking' : '') + (askDoneAt ? ' little-p-done' : '')
  return (
    <button
      type="button"
      className={cls}
      onClick={() => openPalette('littlep')}
      aria-label="问小 P（AI 全库问答）"
      title="问小 P：AI 全库问答（等价于 Ctrl K）"
    >
      <img key={askDoneAt} src="favicon.svg" alt="" aria-hidden />
      <span className="little-p-tag">问小 P</span>
    </button>
  )
}
