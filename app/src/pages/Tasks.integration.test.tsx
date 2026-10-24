import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import App from '../App'
import { useTasks } from '../store/tasks'
import { useGoals } from '../store/goals'
import { todayLocal } from '../engine/datetime'

/**
 * 待办状态机集成（PRD §4.5.1）：
 * 复选框是唯一状态开关（勾选=闭环，再点=恢复）；分类下拉手动优先；
 * 「搁置」=留底可恢复；已结束区计数与徽章区分闭环/搁置。
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
    expect(screen.getByText(/1 闭环 · 0 搁置/)).toBeInTheDocument()

    // 再点恢复
    await user.click(screen.getByRole('checkbox', { name: '恢复为进行中：闭环流程任务' }))
    await waitFor(() => expect(screen.getByRole('checkbox', { name: '完成：闭环流程任务' })).toBeInTheDocument())
    expect(screen.queryByText(/1 闭环 · 0 搁置/)).not.toBeInTheDocument()
  })

  it('「搁置」一键留底（无确认框）→ 已搁置徽章 → 复选框恢复（2026-10-24 合并放弃+删除）', async () => {
    const user = userEvent.setup()
    render(<App />)
    const s = useTasks.getState()
    await s.load()
    await s.create({ title: '搁置流程任务' })
    await gotoTasks(user)

    // 一键流转，不弹确认（与完成勾选同级的轻操作；彻底清除在已结束区）
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true)
    await user.click(screen.getByRole('button', { name: '搁置' }))
    await waitFor(() => expect(screen.getByText('已搁置')).toBeInTheDocument())
    expect(confirmSpy).not.toHaveBeenCalled()
    expect(screen.getByText(/0 闭环 · 1 搁置/)).toBeInTheDocument()

    // 搁置不算闭环
    expect(screen.getByText(/总闭环率/)).toHaveTextContent('0%')

    // 已结束区提供彻底清除（红色删除）
    const closedRow = screen.getByText('已搁置').closest<HTMLElement>('[data-testid="task-row"]')!
    const delBtn = within(closedRow).getByRole('button', { name: '删除' })
    expect(delBtn).toHaveClass('danger')
    confirmSpy.mockRestore()

    // 复选框恢复
    await user.click(screen.getByRole('checkbox', { name: '恢复为进行中：搁置流程任务' }))
    await waitFor(() => expect(screen.getByRole('checkbox', { name: '完成：搁置流程任务' })).toBeInTheDocument())
  })

  it('按日期视图：到期分组呈现（今天/无期限），勾选即完成，目标按期限汇入（2026-10-24）', async () => {
    const user = userEvent.setup()
    render(<App />)
    const t = useTasks.getState()
    await t.load()
    await useGoals.getState().load()
    await t.create({ title: '今天到期的事', due: todayLocal(), origin: { kind: 'manual', refId: null } })
    await t.create({ title: '没有期限的事', origin: { kind: 'manual', refId: null } })
    await useGoals.getState().create({ title: '下月达成目标', due: todayLocal(new Date(Date.now() + 7 * 86_400_000)) })
    await gotoTasks(user)

    // 切到按日期
    await user.click(screen.getByTestId('view-schedule'))
    expect(await screen.findByTestId('schedule-view')).toBeInTheDocument()
    // 今天组含到期待办，无期限组沉底
    expect(screen.getByText('今天')).toBeInTheDocument()
    expect(screen.getByText('无期限')).toBeInTheDocument()
    expect(screen.getByText('今天到期的事')).toBeInTheDocument()
    expect(screen.getByText('没有期限的事')).toBeInTheDocument()
    // 目标行带徽章与剩余天数（含具体日期）
    expect(screen.getByTestId('sched-goal')).toHaveTextContent('下月达成目标')
    expect(screen.getByTestId('sched-goal')).toHaveTextContent(/天后/)

    // 勾选即完成，从时间线消失
    await user.click(screen.getByRole('checkbox', { name: '完成：今天到期的事' }))
    await waitFor(() => {
      expect(useTasks.getState().tasks.find((x) => x.title === '今天到期的事')?.status).toBe('done')
    })
    await waitFor(() => expect(screen.queryByText('今天到期的事')).toBeNull())

    // 切回按分诊视图恢复车道布局，选择被记忆
    await user.click(screen.getByRole('button', { name: '按分诊' }))
    expect(screen.queryByTestId('schedule-view')).toBeNull()
    expect(localStorage.getItem('pwork-tasks-view')).toBe('lanes')
  })

  it('行内编辑：改标题 + 补期限（2026-10-24）', async () => {
    const user = userEvent.setup()
    render(<App />)
    const t = useTasks.getState()
    await t.load()
    await t.create({ title: '编辑前标题', origin: { kind: 'manual', refId: null } })
    await gotoTasks(user)

    const row = screen.getByText('编辑前标题').closest<HTMLElement>('[data-testid="task-row"]')!
    await user.click(within(row).getByRole('button', { name: '编辑' }))
    const editRow = await screen.findByTestId('task-edit')
    await user.clear(within(editRow).getByLabelText('任务标题'))
    await user.type(within(editRow).getByLabelText('任务标题'), '编辑后标题')
    await user.type(within(editRow).getByLabelText('任务期限'), todayLocal())
    await user.click(within(editRow).getByRole('button', { name: '保存' }))

    await waitFor(() => {
      const stored = useTasks.getState().tasks.find((x) => x.title === '编辑后标题')
      expect(stored?.due).toBe(todayLocal())
    })
    // 行内期限徽章随之为「今天 · 具体日期」
    await waitFor(() => expect(screen.getByText(/今天 · \d+月\d+日/)).toBeInTheDocument())
  })

  it('操作区分组断言：活跃行=信息组（编辑·推迟）+处置组（搁置），删除只在已结束区且染红（2026-10-24）', async () => {
    const user = userEvent.setup()
    render(<App />)
    const t = useTasks.getState()
    await t.load()
    await t.create({ title: '分组断言任务', origin: { kind: 'manual', refId: null } })
    await gotoTasks(user)

    const row = screen.getByText('分组断言任务').closest<HTMLElement>('[data-testid="task-row"]')!
    // 活跃行没有删除按钮（合并进「搁置」，彻底清除只在已结束区）
    expect(within(row).queryByRole('button', { name: '删除' })).not.toBeInTheDocument()
    // 信息组与处置组为兄弟容器，处置组在后（DOM 序）且组内各自聚合
    const meta = row.querySelector<HTMLElement>('.task-row-meta')!
    const left = meta.querySelector<HTMLElement>('.ops-left')!
    const right = meta.querySelector<HTMLElement>('.ops-right')!
    expect(within(left).getByRole('button', { name: '编辑' })).toBeInTheDocument()
    expect(within(left).getByRole('button', { name: '推迟' })).toBeInTheDocument()
    expect(within(right).getByRole('button', { name: '搁置' })).toBeInTheDocument()
    expect(Array.from(meta.children).indexOf(right)).toBeGreaterThan(Array.from(meta.children).indexOf(left))
  })
})
