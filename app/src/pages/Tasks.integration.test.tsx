import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import App from '../App'
import { useTasks } from '../store/tasks'

/**
 * 待办状态机集成（PRD §4.5.1）：
 * 复选框是唯一状态开关（勾选=闭环，再点=恢复）；分类下拉手动优先；
 * 放弃=留底可恢复；已结束区计数与徽章区分闭环/放弃。
 */

async function gotoTasks(user: ReturnType<typeof userEvent.setup>) {
  await user.click(within(screen.getByLabelText('主导航')).getByRole('link', { name: /待办/ }))
  await screen.findByTestId('quick-add')
}

function laneSection(laneName: RegExp) {
  const heading = screen.getByRole('heading', { name: laneName })
  return within(heading.parentElement!.parentElement!)
}

describe('待办状态机（W3/W5）', () => {
  it('快速添加 → 自动落三类 → 下拉手动改一类（手动优先）', async () => {
    const user = userEvent.setup()
    render(<App />)
    await gotoTasks(user)

    const input = screen.getByLabelText('新任务标题')
    await user.type(input, '集成测试任务{Enter}')
    await waitFor(() => expect(useTasks.getState().tasks).toHaveLength(1))

    // 无期限+手动来源 → 自动分诊三类
    const lane3 = laneSection(/三类 · 可以绕开我/)
    expect(lane3.getByText('集成测试任务')).toBeInTheDocument()

    // 下拉改一类
    await user.selectOptions(screen.getByLabelText('调整分类：集成测试任务'), '1')
    await waitFor(() =>
      expect(laneSection(/一类 · 今天必须做/).getByText('集成测试任务')).toBeInTheDocument(),
    )
    // 手动设置后重新加载，分类保持一类（不被自动规则覆盖）
    await useTasks.getState().load()
    expect(laneSection(/一类 · 今天必须做/).getByText('集成测试任务')).toBeInTheDocument()
  })

  it('勾选闭环 → 已结束区徽章 → 再点恢复为进行中', async () => {
    const user = userEvent.setup()
    render(<App />)
    const s = useTasks.getState()
    await s.load()
    await s.create({ title: '闭环流程任务' })
    await gotoTasks(user)

    // 勾选闭环
    await user.click(screen.getByRole('checkbox', { name: '完成：闭环流程任务' }))
    await waitFor(() => expect(screen.getByText('已闭环')).toBeInTheDocument())
    expect(screen.getByText(/1 闭环 · 0 放弃/)).toBeInTheDocument()

    // 再点恢复
    await user.click(screen.getByRole('checkbox', { name: '恢复为进行中：闭环流程任务' }))
    await waitFor(() => expect(screen.getByRole('checkbox', { name: '完成：闭环流程任务' })).toBeInTheDocument())
    expect(screen.queryByText(/1 闭环 · 0 放弃/)).not.toBeInTheDocument()
  })

  it('放弃（确认弹窗）→ 已放弃徽章 → 复选框恢复', async () => {
    const user = userEvent.setup()
    render(<App />)
    const s = useTasks.getState()
    await s.load()
    await s.create({ title: '放弃流程任务' })
    await gotoTasks(user)

    // window.confirm 确认
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true)
    await user.click(screen.getByRole('button', { name: '放弃' }))
    await waitFor(() => expect(screen.getByText('已放弃')).toBeInTheDocument())
    expect(confirmSpy).toHaveBeenCalledOnce()
    expect(screen.getByText(/0 闭环 · 1 放弃/)).toBeInTheDocument()

    // 放弃不算闭环
    expect(screen.getByText(/总闭环率/)).toHaveTextContent('0%')

    // 复选框恢复
    await user.click(screen.getByRole('checkbox', { name: '恢复为进行中：放弃流程任务' }))
    await waitFor(() => expect(screen.getByRole('checkbox', { name: '完成：放弃流程任务' })).toBeInTheDocument())
    confirmSpy.mockRestore()
  })
})
