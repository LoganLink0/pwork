import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import App from '../App'

/**
 * 首访引导（/welcome，2026-10-25 重构为全屏遮罩分步式）：
 * 首次打开自动进入；四步（认识工作台/信源/偏好/上云）；走完或跳过才进入主界面。
 */
describe('首访引导（全屏遮罩分步式）', () => {
  beforeEach(() => {
    localStorage.removeItem('pwork-welcomed')
    window.location.hash = ''
  })

  it('未完成引导时打开首页 → 自动进入全屏遮罩，第 1 步为认识工作台，主界面不可见', async () => {
    render(<App />)
    expect(await screen.findByRole('heading', { name: '欢迎使用 PWORK' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '认识工作台' })).toBeInTheDocument()
    // 全屏遮罩挂载（fixed inset-0 覆盖主界面；jsdom 无布局，由遮罩类存在保证）
    expect(document.querySelector('.welcome-veil')).toBeInTheDocument()
    // 步骤导航四点与前进按钮
    expect(screen.getByRole('button', { name: '下一步' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '跳过引导' })).toBeInTheDocument()
  })

  it('四步走完：信源/偏好/上云逐步可达，最后一步「开始使用」进入主界面且不再打扰', async () => {
    const user = userEvent.setup()
    render(<App />)
    await screen.findByRole('heading', { name: '欢迎使用 PWORK' })

    // 第 2 步：信源初始化（导入按钮真实可用）
    await user.click(screen.getByRole('button', { name: '下一步' }))
    expect(await screen.findByRole('heading', { name: '信源初始化' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '导入推荐信源包' })).toBeInTheDocument()

    // 第 3 步：采集偏好
    await user.click(screen.getByRole('button', { name: '下一步' }))
    expect(await screen.findByRole('heading', { name: '采集偏好' })).toBeInTheDocument()

    // 第 4 步：上云（Cloudflare 指引与回填输入框）
    await user.click(screen.getByRole('button', { name: '下一步' }))
    expect(await screen.findByText(/Cloudflare 注册三句话/)).toBeInTheDocument()

    // 走完进入主界面，标记写入
    await user.click(screen.getByRole('button', { name: '开始使用 →' }))
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: /早安|午安|下午好|晚上好|夜深了/ })).toBeInTheDocument(),
    )
    expect(localStorage.getItem('pwork-welcomed')).toBe('1')
  })

  it('跳过引导同样进入主界面且不再重复', async () => {
    const user = userEvent.setup()
    render(<App />)
    await screen.findByRole('heading', { name: '欢迎使用 PWORK' })
    await user.click(screen.getByRole('button', { name: '跳过引导' }))
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: /早安|午安|下午好|晚上好|夜深了/ })).toBeInTheDocument(),
    )
    expect(localStorage.getItem('pwork-welcomed')).toBe('1')
  })

  it('采集偏好：添加兴趣域/屏蔽词、点掉预置词 → 即时写入采集配置', async () => {
    const user = userEvent.setup()
    render(<App />)
    await screen.findByRole('heading', { name: '欢迎使用 PWORK' })
    // 直达第 3 步（进度点可点）
    await user.click(screen.getByRole('button', { name: '第 3 步：采集偏好' }))

    await user.click(screen.getByRole('button', { name: 'AI 应用 ×' }))
    await user.type(screen.getByRole('textbox', { name: '添加兴趣域' }), '量化投资{enter}')
    await user.type(screen.getByRole('textbox', { name: '添加屏蔽词' }), '标题党{enter}')

    const cfg = JSON.parse(localStorage.getItem('pwork-collect-config') ?? '{}') as {
      interests: string[]
      dislikes: string[]
    }
    expect(cfg.interests).toEqual(['独立开发', '前端工程化', '量化投资'])
    expect(cfg.dislikes).toEqual(['融资', '八卦', '软文', '标题党'])
  })
})
