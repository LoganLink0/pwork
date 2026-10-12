import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import App from '../App'
import { db } from '../db/schema'

/**
 * 调研分析页（/output/research，2026-10-13 第一性原理重构）：
 * 单元是「调研任务」——输入目标 → 拿框架（无 AI 走内置模板）→ 逐节提示词 → 发现贴回 → 出稿。
 */
describe('调研分析页（任务式）', () => {
  beforeEach(async () => {
    localStorage.setItem('pwork-welcomed', '1')
    window.location.hash = '#/output/research'
    await Promise.all(db.tables.map((t) => t.clear()))
  })

  it('空态：输入目标开始调研 → 内置模板框架出现（无 AI 也完整可用）', async () => {
    const user = userEvent.setup()
    render(<App />)
    await screen.findByRole('heading', { name: '① 调研目标' })
    expect(screen.getByText(/AI 未配置：用内置调研模板/)).toBeInTheDocument()

    await user.type(screen.getByLabelText('调研目标'), '宁德时代')
    await user.click(screen.getByTestId('start-research'))

    // 模板框架渲染：五个维度 + 每节有复制提示词按钮
    expect(await screen.findByText('一、公司画像')).toBeInTheDocument()
    expect(screen.getByText('五、痛点与切入判断')).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: /复制提示词/ }).length).toBe(5)
    expect(screen.queryByText(/数据块/)).not.toBeInTheDocument()
  })

  it('贴回发现（失焦落库）→ 重新进入任务框架与发现都在 → 手动骨架出稿', async () => {
    const user = userEvent.setup()
    const { unmount } = render(<App />)
    await screen.findByRole('heading', { name: '① 调研目标' })
    await user.type(screen.getByLabelText('调研目标'), '某公司')
    await user.click(screen.getByTestId('start-research'))
    expect(await screen.findByText('一、公司画像')).toBeInTheDocument()

    // 在第一节贴发现，失焦保存
    const ta = screen.getByLabelText('一、公司画像 的发现')
    await user.type(ta, '成立于 2011 年，注册地福建')
    await user.tab()
    const all = await db.blocks.toArray()
    expect(all.find((b) => b.title === '一、公司画像')?.content).toContain('2011 年')

    // 重新挂载（模拟下次打开）：任务标签、框架（localStorage）、发现（库）都在
    unmount()
    render(<App />)
    await screen.findByRole('button', { name: '某公司' })
    await user.click(screen.getByRole('button', { name: '某公司' }))
    expect(await screen.findByText('一、公司画像')).toBeInTheDocument()
    expect(screen.getByLabelText('一、公司画像 的发现')).toHaveValue('成立于 2011 年，注册地福建')

    // 手动骨架出稿（不依赖 AI）
    await user.click(screen.getByRole('button', { name: '用手动骨架（不需要 AI）' }))
    expect(await screen.findByRole('heading', { name: '分析草稿（可编辑）' })).toBeInTheDocument()
  })
})
