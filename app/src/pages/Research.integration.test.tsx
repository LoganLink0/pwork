import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
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

    // 模板框架渲染：五个维度 + 整份提示词一次复制（不分节拆）
    expect(await screen.findByText('一、公司画像与业务')).toBeInTheDocument()
    expect(screen.getByText('三、切入判断')).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: /复制完整提示词/ }).length).toBe(1)
    expect(screen.getByRole('link', { name: '去豆包 ↗' })).toBeInTheDocument()
    expect(screen.queryByText(/数据块/)).not.toBeInTheDocument()
  })

  it('发现一条流：写入（失焦落库）→ 重新进入任务还在 → 手动骨架出稿', async () => {
    const user = userEvent.setup()
    const { unmount } = render(<App />)
    await screen.findByRole('heading', { name: '① 调研目标' })
    await user.type(screen.getByLabelText('调研目标'), '某公司')
    await user.click(screen.getByTestId('start-research'))
    expect(await screen.findByText('一、公司画像与业务')).toBeInTheDocument()

    // 发现写进单一流水，失焦保存
    const ta = screen.getByLabelText('发现')
    await user.type(ta, '成立于 2011 年，注册地福建')
    await user.tab()
    const all = await db.blocks.toArray()
    expect(all.find((b) => b.title === '发现')?.content).toContain('2011 年')

    // 重新挂载（模拟下次打开）：任务标签、角度建议（localStorage）、发现（库）都在
    unmount()
    render(<App />)
    await screen.findByRole('button', { name: '某公司' })
    await user.click(screen.getByRole('button', { name: '某公司' }))
    expect(await screen.findByText('一、公司画像与业务')).toBeInTheDocument()
    expect(screen.getByLabelText('发现')).toHaveValue('成立于 2011 年，注册地福建')

    // 手动骨架出稿（不依赖 AI）
    await user.click(screen.getByRole('button', { name: '用手动骨架（不需要 AI）' }))
    expect(await screen.findByRole('heading', { name: '分析草稿（可编辑）' })).toBeInTheDocument()
  })

  it('联网调研（网关配了搜索）：搜本节问题 → 带来源的答案落进发现', async () => {
    // 网关模式 + 已配置搜索
    localStorage.setItem('fupan-coach', JSON.stringify({ mode: 'llm', viaGateway: true, gatewayUrl: 'http://127.0.0.1:8788' }))
    const calls: string[] = []
    vi.stubGlobal('fetch', vi.fn(async (url: URL | string, init?: RequestInit) => {
      const u = String(url)
      calls.push(u)
      if (u.endsWith('/health')) {
        return new Response(JSON.stringify({ ok: true, chatConfigured: true, searchConfigured: true }), { status: 200 })
      }
      if (u.endsWith('/search')) {
        expect(String(init?.body)).toContain('宁德时代')
        return new Response(JSON.stringify({
          ok: true,
          results: [
            { title: '公司年报摘要', link: 'https://example.com/annual', content: '2025 年营收 4000 亿元' },
            { title: '新闻', link: 'https://example.com/news', content: '发布新产品线' },
          ],
        }), { status: 200 })
      }
      if (u.includes('/chat/completions')) {
        return new Response(JSON.stringify({ choices: [{ message: { content: '营收约 4000 亿元 [1]。' } }], usage: { total_tokens: 12 } }), { status: 200 })
      }
      return new Response('{}', { status: 404 })
    }))

    const user = userEvent.setup()
    render(<App />)
    await screen.findByRole('heading', { name: '① 调研目标' })
    await user.type(screen.getByLabelText('调研目标'), '宁德时代')
    await user.click(screen.getByTestId('start-research'))
    // AI 框架生成的 stub 返回非 JSON → 自动落回内置模板
    expect(await screen.findByText('一、公司画像与业务')).toBeInTheDocument()

    const webBtns = await screen.findAllByRole('button', { name: '🌐 只查此角度' })
    await user.click(webBtns[0]!)
    const ta = (await screen.findByLabelText('发现')) as HTMLTextAreaElement
    await waitFor(() => {
      const banner = screen.queryByTestId('research-msg')?.textContent ?? ''
      expect(ta.value, `页面消息：${banner}`).toContain('联网调研')
    }, { timeout: 6000 })
    expect(ta.value).toContain('https://example.com/annual')
    expect(ta.value).toContain('来源：')
    // 搜索与作答都真实发生（搜索 ×2：角度名 + 第一个问题）
    expect(calls.filter((c) => c.endsWith('/search')).length).toBeGreaterThanOrEqual(2)
  })

  it('旧任务（无框架）选中后 → ② 区直接给「生成框架」入口（2026-10-13 修复"选中后无法生成"）', async () => {
    // 造一个"旧版"任务：profile 存在、localStorage 无框架
    const { saveProfile } = await import('../db/profilesRepo')
    const p = await saveProfile({ name: '饿死', kind: '公司调研' })
    const user = userEvent.setup()
    render(<App />)
    await screen.findByRole('heading', { name: '① 调研目标' })
    await user.click(screen.getByRole('button', { name: '饿死' }))
    expect(await screen.findByTestId('gen-framework')).toBeInTheDocument()

    // 不回 ① 重打名字，直接在 ② 点生成（目标用任务名兜底、类型按任务标签映射）
    await user.click(screen.getByTestId('gen-framework'))
    expect(await screen.findByText('一、公司画像与业务')).toBeInTheDocument()
    const fwRaw = localStorage.getItem(`pwork-research-fw:${p.id}`)
    expect(fwRaw && JSON.parse(fwRaw).target).toBe('饿死')
  })

  it('删除任务 → 发现一并软删（不得泄进周报外部数据，2026-10-13 自查修复）', async () => {
    const user = userEvent.setup()
    render(<App />)
    await screen.findByRole('heading', { name: '① 调研目标' })
    await user.type(screen.getByLabelText('调研目标'), '临期调研')
    await user.click(screen.getByTestId('start-research'))
    expect(await screen.findByText('一、公司画像与业务')).toBeInTheDocument()

    const ta = screen.getByLabelText('发现')
    await user.type(ta, '发现内容一段')
    await user.tab()

    // 删除任务（window.confirm 自动接受）
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    await user.click(screen.getByRole('button', { name: '删除任务' }))
    await waitFor(() => {
      expect(screen.queryByLabelText('发现')).not.toBeInTheDocument()
    })
    // 关键断言：发现块被软删（deletedAt 有值），而不是被摘成"未归类"
    const all = await db.blocks.toArray()
    expect(all.find((b) => b.title === '发现')?.deletedAt).toBeTruthy()
  })

  it('旧版分节发现自动合并成一条流水（2026-10-21 迁移）', async () => {
    // 造一个"旧版"任务：profile 存在、框架是旧分节结构、发现按节存了三块
    const { saveProfile } = await import('../db/profilesRepo')
    const { saveBlock } = await import('../db/blocksRepo')
    const p = await saveProfile({ name: '旧任务迁移', kind: '公司调研' })
    await saveBlock({ title: '一、公司画像与业务', content: '员工 2 万人。', profileId: p.id })
    await saveBlock({ title: '三、切入判断', content: '从供应链切入。', profileId: p.id })
    localStorage.setItem(`pwork-research-fw:${p.id}`, JSON.stringify({
      type: 'company', target: '旧任务迁移', generatedBy: 'template',
      sections: [
        { heading: '一、公司画像与业务', questions: [], sources: [] },
        { heading: '二、行业位置与近期动态', questions: [], sources: [] },
        { heading: '三、切入判断', questions: [], sources: [] },
      ],
    }))
    const user = userEvent.setup()
    render(<App />)
    await screen.findByRole('heading', { name: '① 调研目标' })
    await user.click(await screen.findByRole('button', { name: '旧任务迁移' }))
    const ta = (await screen.findByLabelText('发现')) as HTMLTextAreaElement
    // 两节按框架顺序拼进一条流水，标题成 "## " 分隔行；旧的分节块被移除（软删）
    await waitFor(() => {
      expect(ta.value).toContain('## 一、公司画像与业务\n员工 2 万人。')
      expect(ta.value).toContain('## 三、切入判断\n从供应链切入。')
    })
    await waitFor(
      async () => {
        const all = await db.blocks.toArray()
        expect(all.filter((b) => !b.deletedAt && b.profileId === p.id).map((b) => b.title)).toEqual(['发现'])
      },
      { timeout: 4000 },
    )
  })
})
