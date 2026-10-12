import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import App from '../App'
import { db } from '../db/schema'

/**
 * 调研分析页（/output/research，2026-10-12 中方案）：任务式三步——选对象 → 贴材料 → 出稿。
 * 用户不必先懂"数据块"概念：粘贴的每段材料自动挂到当前对象名下。
 */
describe('调研分析页', () => {
  beforeEach(async () => {
    localStorage.setItem('pwork-welcomed', '1')
    window.location.hash = '#/output/research'
    await Promise.all(db.tables.map((t) => t.clear()))
  })

  it('三步结构齐全，空态引导先建对象', async () => {
    render(<App />)
    expect(await screen.findByRole('heading', { name: '① 调研对象' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '② 材料' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '③ 出稿' })).toBeInTheDocument()
    expect(screen.getByText(/还没有调研对象/)).toBeInTheDocument()
  })

  it('建对象 → 粘贴材料自动挂对象 → 手动骨架出稿（不依赖 AI）', async () => {
    const user = userEvent.setup()
    render(<App />)
    await screen.findByRole('heading', { name: '① 调研对象' })

    // ① 建对象
    await user.type(screen.getByLabelText('新调研对象名称'), 'ACME 公司调研')
    await user.click(screen.getByRole('button', { name: '＋ 建对象' }))
    expect(await screen.findByRole('button', { name: 'ACME 公司调研' })).toBeInTheDocument()

    // ② 粘贴材料（自动挂到当前对象，不需要理解"数据块"）
    await user.click(screen.getByTestId('paste-material'))
    await user.type(screen.getByLabelText('材料名称'), '官网介绍')
    await user.type(screen.getByLabelText('材料内容'), '成立年份: 2015\n主营: 数据服务')
    await user.click(screen.getByRole('button', { name: '保存材料' }))
    expect(await screen.findByText('官网介绍')).toBeInTheDocument()

    // ③ 手动骨架出稿（AI 未配置也应可用）
    await user.click(screen.getByRole('button', { name: '用手动骨架（不需要 AI）' }))
    expect(await screen.findByRole('heading', { name: '分析草稿（可编辑）' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '⬇ Markdown' })).toBeInTheDocument()
  })
})
