import { beforeEach, describe, expect, it } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from '../../App'
import { db } from '../../db/schema'
import { saveProfile } from '../../db/profilesRepo'

/** 案例工作台分步工作区：默认落材料步、步骤栏切换、切步不丢输入（jsdom 慢机器，一律放宽 waitFor） */

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()))
  localStorage.clear()
  window.location.hash = ''
})

describe('案例工作台（分步）', () => {
  it('默认落在材料步；步骤栏切换面板；切步再回来输入保留', async () => {
    const user = userEvent.setup()
    const p = await saveProfile({ name: '分步测试案例', kind: '简历辅导' })
    window.location.hash = `#/cases/${p.id}`
    render(<App />)

    // 材料步可见
    await waitFor(() => expect(screen.getByRole('button', { name: '⬇ 生成自检包（Markdown）' })).toBeVisible(), { timeout: 5000 })
    expect(screen.getByLabelText('服务步骤')).toBeInTheDocument()

    // 切到简历稿，键入内容
    await user.click(screen.getByRole('link', { name: /简历稿/ }))
    const ta = await screen.findByRole('textbox', { name: '简历稿内容' }, { timeout: 5000 })
    await user.type(ta, '# 保留测试')
    expect(ta).toHaveValue('# 保留测试')

    // 切去岗位解码：简历稿面板隐藏但组件仍挂载（getByRole 不含隐藏元素，隐藏 = 查不到）
    await user.click(screen.getByRole('link', { name: /岗位解码/ }))
    await waitFor(() => expect(screen.getByRole('textbox', { name: '粘贴 JD 全文' })).toBeVisible(), { timeout: 5000 })
    expect(screen.queryByRole('textbox', { name: '简历稿内容' })).toBeNull()

    // 切回：输入还在
    await user.click(screen.getByRole('link', { name: /简历稿/ }))
    await waitFor(() => expect(screen.getByRole('textbox', { name: '简历稿内容' })).toBeVisible(), { timeout: 5000 })
    expect(screen.getByRole('textbox', { name: '简历稿内容' })).toHaveValue('# 保留测试')
  }, 20000)
})
