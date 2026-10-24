import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import App from '../App'
import { useGoals } from '../store/goals'
import { todayLocal } from '../engine/datetime'

/** 目标模块集成：创建带期限、行内编辑（标题+期限一次改全） */

async function gotoGoals(user: ReturnType<typeof userEvent.setup>) {
  await user.click(within(screen.getByLabelText('主导航')).getByRole('link', { name: '目标' }))
  await screen.findByTestId('goal-quick-add')
}

describe('目标模块', () => {
  it('快速创建即可带期限 → 行内编辑一次改标题与期限（2026-10-24 重做）', async () => {
    const user = userEvent.setup()
    render(<App />)
    const g = useGoals.getState()
    await g.load()
    await gotoGoals(user)

    // 创建时就填期限（不再依赖行内小日期框——那个框已删）
    await user.type(screen.getByLabelText('新目标'), '带期限的目标')
    await user.type(screen.getByLabelText('新目标期限（可选）'), todayLocal())
    await user.keyboard('{Enter}')
    await waitFor(() => {
      const stored = useGoals.getState().goals.find((x) => x.title === '带期限的目标')
      expect(stored?.due).toBe(todayLocal())
    })

    // 编辑：标题与期限一次改全
    const row = screen.getByText('带期限的目标').closest<HTMLElement>('[data-testid="goal-row"]')!
    await user.click(within(row).getByRole('button', { name: '编辑' }))
    const editRow = await screen.findByTestId('goal-edit')
    const titleInput = within(editRow).getByLabelText('目标标题')
    await user.clear(titleInput)
    await user.type(titleInput, '改名并延期的目标')
    const dueInput = within(editRow).getByLabelText('目标期限')
    await user.clear(dueInput)
    await user.type(dueInput, todayLocal(new Date(Date.now() + 3 * 86_400_000)))
    await user.click(within(editRow).getByRole('button', { name: '保存' }))

    await waitFor(() => {
      const stored = useGoals.getState().goals.find((x) => x.title === '改名并延期的目标')
      expect(stored?.due).toBe(todayLocal(new Date(Date.now() + 3 * 86_400_000)))
    })
    // 徽章带具体日期
    expect(screen.getByText(/月\d+日 · 剩 3 天/)).toBeInTheDocument()
  })
})
