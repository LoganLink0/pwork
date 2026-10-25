import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { act } from 'react'
import { beforeEach, describe, expect, it } from 'vitest'
import { WheelMenu } from './WheelMenu'
import { useUi } from '../../store/ui'

/** 位置探针：断言格位动作后的路由变化 */
function Where() {
  const loc = useLocation()
  return <div data-testid="where">{loc.pathname}</div>
}

function setup() {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <Where />
      <Routes>
        <Route path="*" element={null} />
      </Routes>
      <WheelMenu />
    </MemoryRouter>,
  )
}

/** store 外部调用统一包 act（React 19 下不包会丢渲染） */
const openWheel = () => act(() => { useUi.getState().openWheel() })

describe('工具轮盘', () => {
  beforeEach(() => {
    useUi.setState({ wheelOpen: false, quickOpen: false, paletteOpen: false })
    localStorage.removeItem('pwork-wheel-slots')
  })

  it('打开后渲染默认格位与中心提示；关闭时不渲染', () => {
    const { unmount } = setup()
    expect(screen.queryByRole('dialog', { name: '工具轮盘' })).toBeNull()
    openWheel()
    expect(screen.getByRole('dialog', { name: '工具轮盘' })).toBeInTheDocument()
    for (const label of ['速记', '立即抓取', '新建复盘', '信息日报', '工具箱', '帮助']) {
      expect(screen.getByRole('button', { name: label })).toBeInTheDocument()
    }
    expect(screen.getByText(/选 · /)).toBeInTheDocument()
    unmount()
  })

  it('点格位（打开页面）→ 跳转对应页面并关闭轮盘', async () => {
    const user = userEvent.setup()
    setup()
    openWheel()
    await user.click(screen.getByRole('button', { name: '信息日报' }))
    expect(screen.getByTestId('where').textContent).toBe('/input/digest')
    expect(screen.queryByRole('dialog', { name: '工具轮盘' })).toBeNull()
  })

  it('点格位（速记浮层）→ 打开速记浮层', async () => {
    const user = userEvent.setup()
    setup()
    openWheel()
    await user.click(screen.getByRole('button', { name: '速记' }))
    expect(useUi.getState().quickOpen).toBe(true)
    expect(screen.queryByRole('dialog', { name: '工具轮盘' })).toBeNull()
  })

  it('键盘：→ 移动选中，Enter 执行，Esc 关闭', async () => {
    const user = userEvent.setup()
    setup()
    openWheel()
    // 默认选中第 1 格（速记）；→ 后选中第 2 格（立即抓取）不真跑网络，继续 → 到第 3 格（新建复盘）执行
    await user.keyboard('{ArrowRight>2}')
    await user.keyboard('{Enter}')
    expect(screen.getByTestId('where').textContent).toBe('/review/new')
    // 重开再 Esc
    openWheel()
    const dial = screen.getByRole('dialog', { name: '工具轮盘' })
    dial.focus()
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog', { name: '工具轮盘' })).toBeNull()
  })
})
