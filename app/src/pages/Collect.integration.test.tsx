import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from '../App'
import { useCollect } from '../store/collect'
import { createSource } from '../db/collect'
import { DEFAULT_COLLECT_CONFIG } from '../content/collect'

const FEED = `<?xml version="1.0"?><rss version="2.0"><channel>
<item><title>AI 应用新开源工具发布</title><link>https://e.com/1</link><description>可直接借鉴的实践案例</description></item>
<item><title>某公司完成融资</title><link>https://e.com/2</link><description>x</description></item>
</channel></rss>`

afterEach(() => {
  vi.unstubAllGlobals()
})

async function goto(user: ReturnType<typeof userEvent.setup>, label: string | RegExp) {
  await user.click(within(screen.getByLabelText('主导航')).getByRole('link', { name: label }))
}

/** 采集页组集成（PRD §4.4）：信源管理 → 抓取 → Digest → 标注 */
describe('信息采集 C1（W2）', () => {
  it('信源管理：添加表单入库；表格渲染 tier/健康/开关', async () => {
    const user = userEvent.setup()
    render(<App />)
    await goto(user, /信源/)

    await user.click(await screen.findByRole('button', { name: '＋ 添加信源' }))
    const form = await screen.findByTestId('src-form')
    const inputs = within(form).getAllByRole('textbox')
    await user.type(inputs[0]!, '测试源甲')
    await user.type(inputs[1]!, 'https://t.example/rss')
    await user.click(within(form).getByRole('button', { name: '保存' }))

    const table = await screen.findByTestId('src-table')
    expect(within(table).getByText('测试源甲')).toBeInTheDocument()
    expect(within(table).getAllByText(/T1\.5/).length).toBeGreaterThan(0)
    expect(within(table).getAllByRole('switch').length).toBe(1)
  })

  it('Digest：立即抓取 → Top N 出现 → 星级与详情理由', async () => {
    const user = userEvent.setup()
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(FEED, { status: 200 })),
    )
    render(<App />)
    await createSource({ name: '测试源乙', url: 'https://t.example/rss', domain: 'ai', tier: 1 })
    await useCollect.getState().load()
    await goto(user, /信息日报/)

    await user.click(await screen.findByTestId('fetch-all'))
    // 一条进 Top N（融资被屏蔽词筛除）
    const card = await screen.findByText('AI 应用新开源工具发布')
    expect(card).toBeInTheDocument()
    expect(screen.queryByText(/某公司完成融资/)).toBeNull()

    const summary = await screen.findByTestId('run-summary')
    expect(within(summary).getByText(/筛除/)).toBeInTheDocument()

    // 星级：点击一次 → 1 星
    const stars = screen.getByRole('button', { name: /星级：0 星/ })
    await user.click(stars)
    await waitFor(() => expect(useCollect.getState().digest[0]!.annotation.stars).toBe(1))

    // 点满 5 星后再点一下 → 清零（评级可撤销）；每步等渲染跟上再点
    for (const n of [1, 2, 3, 4]) {
      await user.click(await screen.findByRole('button', { name: new RegExp(`星级：${n} 星，点击加一星`) }))
    }
    await user.click(await screen.findByRole('button', { name: /星级：5 星，点击清零/ }))
    await waitFor(() => expect(useCollect.getState().digest[0]!.annotation.stars).toBe(0))

    // 详情展开：评分理由 + 四维
    await user.click(screen.getByRole('button', { name: '详情' }))
    expect(await screen.findByText(/评分理由/)).toBeInTheDocument()
    expect(screen.getByText(/相关/)).toBeInTheDocument()
  })

  it('条目库：stage 筛选与已筛除 TTL 标注', async () => {
    const user = userEvent.setup()
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(FEED, { status: 200 })),
    )
    render(<App />)
    await createSource({ name: '测试源丙', url: 'https://t2.example/rss', domain: 'ai', tier: 1 })
    await useCollect.getState().load()
    await goto(user, /信息日报/)
    await user.click(await screen.findByTestId('fetch-all'))
    await screen.findByText('AI 应用新开源工具发布')

    await goto(user, /条目库/)
    await user.click(await screen.findByRole('button', { name: /已筛除 1/ }))
    expect(await screen.findByText('某公司完成融资')).toBeInTheDocument()
    expect(screen.getByText(/过期清理/)).toBeInTheDocument()
  })

  it('设置·采集偏好：兴趣域可增删并持久化', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(within(screen.getByRole('banner')).getByRole('link', { name: '设置' }))
    await screen.findByText('采集偏好')

    const input = screen.getByLabelText('添加兴趣域')
    await user.type(input, '增长打法')
    await user.keyboard('{Enter}')
    await waitFor(() => expect(useCollect.getState().config.interests).toContain('增长打法'))

    // 删除默认兴趣域之一
    const chip = screen.getByRole('button', { name: `${DEFAULT_COLLECT_CONFIG.interests[0]} ×` })
    await user.click(chip)
    await waitFor(() => expect(useCollect.getState().config.interests).not.toContain(DEFAULT_COLLECT_CONFIG.interests[0]))
    expect(localStorage.getItem('pwork-collect-config')).toBeTruthy()
  })
})
