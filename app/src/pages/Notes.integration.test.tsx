import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import App from '../App'
import { useNotes } from '../store/notes'
import { db as db2 } from '../db/schema'

/** 速记模块集成（PRD §4.3）：列表、筛选、编辑器自动保存、软删除与回收站 */

async function gotoNotes(user: ReturnType<typeof userEvent.setup>) {
  // 链接 accessible name 会带计数（如"速记 1"），用正则匹配
  await user.click(within(screen.getByLabelText('主导航')).getByRole('link', { name: /速记/ }))
  await screen.findByTestId('note-list')
}

function list() {
  return within(screen.getByTestId('note-list'))
}

describe('速记模块（W1）', () => {
  it('空列表引导 → 编辑器创建 → 列表出现（含标签）', async () => {
    const user = userEvent.setup()
    render(<App />)
    await gotoNotes(user)
    expect(screen.getByText(/第一条速记会在这里/)).toBeInTheDocument()

    // 页头与空状态都有"＋ 新速记"，取页头那个（列表上方）
    await user.click(screen.getAllByRole('link', { name: /＋ 新速记/ })[0]!)
    const body = await screen.findByLabelText('速记正文')
    await user.type(body, '通过编辑器创建的速记')
    await user.type(screen.getByLabelText('标签'), '想法 复盘')

    // 自动创建（防抖）后路由 replace 到真实 id，并出现"已保存"
    await waitFor(() => expect(screen.getByText(/已保存/)).toBeInTheDocument(), { timeout: 4000 })
    const state = useNotes.getState()
    expect(state.notes).toHaveLength(1)
    expect(state.notes[0]!.tags).toEqual(['想法', '复盘'])
  })

  it('搜索与标签筛选', async () => {
    const user = userEvent.setup()
    render(<App />)
    const s = useNotes.getState()
    await s.load()
    await s.create({ body: '关于评分权重的想法', tags: ['想法'] })
    await s.create({ body: '周会流程备忘', tags: ['复盘'] })
    await gotoNotes(user)

    expect(list().getAllByText(/权重|周会/).length).toBe(2)

    await user.click(screen.getByRole('button', { name: '#想法' }))
    expect(list().getAllByText(/权重|周会/).length).toBe(1)
    expect(list().getByText(/权重/)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '#想法' })) // 取消筛选
    await user.type(screen.getByLabelText('搜索速记'), '周会')
    expect(list().getAllByText(/权重|周会/).length).toBe(1)
  })

  it('编辑器修改正文 → 自动保存落库', async () => {
    const user = userEvent.setup()
    render(<App />)
    const s = useNotes.getState()
    await s.load()
    const n = await s.create({ body: '编辑前' })
    await gotoNotes(user)

    await user.click(list().getByText('编辑前'))
    const ta = await screen.findByLabelText('速记正文')
    await user.clear(ta)
    await user.type(ta, '编辑后')
    await waitFor(
      () => {
        const stored = useNotes.getState().notes.find((x) => x.id === n.id)
        expect(stored?.body).toBe('编辑后')
      },
      { timeout: 4000 },
    )
  })

  it('软删除 → 回收站 → 恢复（铁律 3 可见）', async () => {
    const user = userEvent.setup()
    render(<App />)
    const s = useNotes.getState()
    await s.load()
    const n = await s.create({ body: '将被软删除' })
    await gotoNotes(user)

    await user.click(list().getByText('将被软删除'))
    await screen.findByTestId('note-editor')
    await user.click(screen.getByRole('button', { name: '删除' }))

    await waitFor(() => expect(useNotes.getState().trash).toHaveLength(1))
    // 导航卸载编辑器是异步渲染——等待文本消失而非直接断言
    await waitFor(() => expect(screen.queryByText('将被软删除')).toBeNull())

    await user.click(screen.getByRole('button', { name: /回收站/ }))
    await user.click(await screen.findByRole('button', { name: '恢复' }))
    await waitFor(() => {
      expect(useNotes.getState().notes.some((x) => x.id === n.id)).toBe(true)
      expect(useNotes.getState().trash).toHaveLength(0)
    })
  })

  it('导出 md 按钮在已保存速记中可用', async () => {
    const user = userEvent.setup()
    render(<App />)
    const s = useNotes.getState()
    await s.load()
    await s.create({ body: '导出测试' })
    await gotoNotes(user)
    await user.click(list().getByText('导出测试'))
    await screen.findByTestId('note-editor')
    expect(screen.getByRole('button', { name: '导出 md' })).toBeEnabled()
  })

  it('时间线按日分组（今天 + 条数）；编辑器预览渲染 Markdown、字数行数可见（2026-10-24）', async () => {
    const user = userEvent.setup()
    render(<App />)
    const s = useNotes.getState()
    await s.load()
    await s.create({ body: '# 分组标题\n\n正文有 **加粗** 一段' })
    await s.create({ body: '同日第二条' })
    await gotoNotes(user)

    // 活动视图按自然日分组：今天分组头 + 条数
    expect(list().getByText('今天')).toBeInTheDocument()
    expect(list().getByText('2 条')).toBeInTheDocument()

    // 打开第一条 → 预览：h1 与 strong 渲染出来，字数/行数可见
    await user.click(list().getByText(/分组标题/))
    await screen.findByTestId('note-editor')
    expect(screen.getByTestId('note-stats').textContent).toMatch(/字 · \d+ 行/)
    await user.click(screen.getByTestId('preview-toggle'))
    const preview = await screen.findByTestId('note-preview')
    expect(preview.querySelector('h1')?.textContent).toBe('分组标题')
    expect(preview.querySelector('strong')?.textContent).toBe('加粗')
    await user.click(screen.getByTestId('preview-toggle'))
    expect(screen.getByLabelText('速记正文')).toBeInTheDocument()
  })

  it('回收站彻底删除（先确认）物理删除', async () => {
    const user = userEvent.setup()
    render(<App />)
    const s = useNotes.getState()
    await s.load()
    const n = await s.create({ body: '待彻底删除的一条' })
    await s.softDelete(n.id)
    await gotoNotes(user)
    await user.click(screen.getByRole('button', { name: /回收站/ }))
    window.confirm = () => true
    await user.click(await screen.findByRole('button', { name: '彻底删除' }))
    await waitFor(() => expect(useNotes.getState().trash).toHaveLength(0))
    expect(await db2.notes.get(n.id)).toBeUndefined()
  })
})
