import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import App from '../App'

/** 首访引导（/welcome）：首次打开首页自动进入一次；帮助页可重进 */
describe('首访引导', () => {
  beforeEach(() => {
    localStorage.removeItem('pwork-welcomed')
    window.location.hash = ''
  })

  it('未完成引导时打开首页 → 自动进入 /welcome', async () => {
    render(<App />)
    expect(await screen.findByRole('heading', { name: '欢迎使用 PWORK' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '① 快速上手' })).toBeInTheDocument()
    expect(screen.getByText(/Cloudflare 注册三句话/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '导入推荐信源包' })).toBeInTheDocument()
  })

  it('点「我明白了」→ 回首页，且不再重复引导', async () => {
    const user = userEvent.setup()
    render(<App />)
    await screen.findByRole('heading', { name: '欢迎使用 PWORK' })
    await user.click(screen.getByRole('button', { name: /开始使用 →/ }))
    expect(await screen.findByRole('heading', { name: /早安|午安|下午好|晚上好|夜深了/ })).toBeInTheDocument()

    // 模拟重新挂载：hash 已不在 /welcome，且标记已写
    expect(localStorage.getItem('pwork-welcomed')).toBe('1')
  })

  it('采集偏好：添加兴趣域/屏蔽词、点掉预置词 → 即时写入采集配置', async () => {
    const user = userEvent.setup()
    render(<App />)
    await screen.findByRole('heading', { name: '欢迎使用 PWORK' })

    // 移除一个预置兴趣域
    await user.click(screen.getByRole('button', { name: 'AI 应用 ×' }))
    // 添加自己的兴趣域与屏蔽词
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
