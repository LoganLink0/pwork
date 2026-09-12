import { beforeEach, describe, expect, it } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from '../App'
import { db } from '../db/schema'

/** 集成：新建案例 → 工作台分步 → 上传/粘贴反馈 → 切步不丢输入 */

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()))
  localStorage.clear()
  window.location.hash = ''
})

describe('简历辅导工作台', () => {
  it('新建案例 → 粘贴材料有明确反馈 → 步骤栏切换 → 简历稿输入保留', async () => {
    const user = userEvent.setup()
    window.location.hash = '#/'
    render(<App />)

    // 新建案例
    await user.type(await screen.findByLabelText('案例名称'), '测试客户 · 信贷岗')
    await user.click(screen.getByRole('button', { name: '＋ 创建案例' }))
    const link = await screen.findByRole('link', { name: /测试客户 · 信贷岗/ })
    await user.click(link)

    // 落在材料步；粘贴一份材料 → 处理结果明确可见（日志写明存成了什么、多少字）
    const paste = await screen.findByRole('textbox', { name: '粘贴内容' }, { timeout: 5000 })
    await user.type(paste, '三年对公客户经理经验，2023 年完成存款 8000 万。')
    await user.click(screen.getByRole('button', { name: '＋ 添加' }))
    const log = await screen.findByTestId('extract-log', {}, { timeout: 5000 })
    await waitFor(() => expect(log).toHaveTextContent('粘贴内容已存为「岗位 JD」'), { timeout: 5000 })
    expect(log).toHaveTextContent('29 字')
    // 文件列表出现该材料（含字数信息）——日志与列表行都含字数，取其一即可
    expect((await screen.findAllByText(/29 字/)).length).toBeGreaterThan(0)

    // 切到简历稿，键入 → 切走 → 切回，输入保留
    await user.click(screen.getByRole('link', { name: /简历稿/ }))
    const ta = await screen.findByRole('textbox', { name: '简历稿内容' }, { timeout: 5000 })
    await user.type(ta, '# 保留测试')
    await user.click(screen.getByRole('link', { name: /岗位解码/ }))
    await screen.findByRole('textbox', { name: '粘贴 JD 全文' }, { timeout: 5000 })
    expect(screen.queryByRole('textbox', { name: '简历稿内容' })).toBeNull()
    await user.click(screen.getByRole('link', { name: /简历稿/ }))
    await waitFor(() => expect(screen.getByRole('textbox', { name: '简历稿内容' })).toBeVisible(), { timeout: 5000 })
    expect(screen.getByRole('textbox', { name: '简历稿内容' })).toHaveValue('# 保留测试')
  }, 30000)
})
