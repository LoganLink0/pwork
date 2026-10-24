import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import App from '../App'
import { useGoals } from '../store/goals'
import { todayLocal } from '../engine/datetime'

/** 目标模块集成：行内编辑（标题/期限）与达成状态机 */

async function gotoGoals(user: ReturnType<typeof userEvent.setup>) {
  await user.click(within(screen.getByLabelText('主导航')).getByRole('link', { name: '目标' }))
  await screen.findByTestId('goal-quick-add')
}

describe('目标模块', () => {
  it('快速创建 → 行内编辑改标题 → 期限日期框即时生效（2026-10-24）', async () => {
    const user = userEvent.setup()
    render(<App />)
    const g = useGoals.getState()
    await g.load()
    await g.create({ title: '旧目标标题' })
    await gotoGoals(user)

    const row = screen.getByText('旧目标标题').closest<HTMLElement>('[data-testid="goal-row"]')!
    // 期限：行内日期框即时写入
    await user.type(within(row).getByLabelText('目标期限：旧目标标题'), todayLocal())
    await waitFor(() => expect(useGoals.getState().goals[0]?.due).toBe(todayLocal()))

    // 标题：编辑按钮 → 改 → 保存
    await user.click(within(row).getByRole('button', { name: '编辑' }))
    const editRow = await screen.findByTestId('goal-edit')
    await user.clear(within(editRow).getByLabelText('目标标题'))
    await user.type(within(editRow).getByLabelText('目标标题'), '新目标标题')
    await user.click(within(editRow).getByRole('button', { name: '保存' }))
    await waitFor(() => expect(useGoals.getState().goals[0]?.title).toBe('新目标标题'))
    expect(screen.getByText('新目标标题')).toBeInTheDocument()
  })
})
