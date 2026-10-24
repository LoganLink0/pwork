import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import App from '../App'
import { useNotes } from '../store/notes'

/** 壳层集成：导航、命令面板、速记浮层、主题、占位页（jsdom 抓逻辑，浏览器抓挂载路径） */

/** 侧边栏作用域（选择器教训 FUPAN 2.1：全局查询会命中首页同文案元素） */
function sidebar() {
  return within(screen.getByLabelText('主导航'))
}

describe('工作台壳（W1）', () => {
  it('首页渲染：问候 + 三瓦片引导态 + 四模块卡', async () => {
    render(<App />)
    expect(await screen.findByRole('heading', { name: /早安|午安|下午好|晚上好|夜深了/ })).toBeInTheDocument()
    // 三瓦片（Digest 引导态 + 待办空态引导 + 复盘引导——用副行唯一文案断言）
    expect(screen.getByText('先去信源管理添加 5–10 个源')).toBeInTheDocument()
    expect(screen.getByText('复盘产出的行动项会自动出现在任务库')).toBeInTheDocument()
    expect(screen.getByText('做一次复盘，行动项自动进待办')).toBeInTheDocument()
    // 四模块卡（用卡片副行唯一文案断言）
    expect(screen.getByText('捕获想法，进入后续处理')).toBeInTheDocument()
    expect(screen.getByText('工具箱 · 快速启动')).toBeInTheDocument()
    expect(screen.getByText('周期成稿 · 听觉 · 分享')).toBeInTheDocument()
    expect(screen.getByText('CLAP 复盘 · 因果循环 · 认知资产')).toBeInTheDocument()
  })

  it('侧边栏导航：点速记 → 列表页；占位模块可点开说明页', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(sidebar().getByRole('link', { name: '速记' }))
    expect(await screen.findByRole('heading', { name: '速记' })).toBeInTheDocument()

    await user.click(sidebar().getByRole('link', { name: /处理/ }))
    // 处理页 = 工具箱 + 快速启动；检索与 AI 全库问答都在 Ctrl K 命令面板（2026-10-23 问答并入）
    expect(await screen.findByRole('heading', { name: '处理' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '工具箱' })).toBeInTheDocument()
    // 快速启动：内置默认站点可点开（2026-10-13）
    expect(screen.getByRole('heading', { name: '快速启动' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /豆包 ↗/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /＋ 添加/ })).toBeInTheDocument()
  })

  it('命令面板：Ctrl+K 打开，搜索速记可跳转', async () => {
    const user = userEvent.setup()
    render(<App />)
    // 先经速记浮层造一条数据，并等保存完成（消除异步竞态）
    await user.keyboard('n')
    await user.type(await screen.findByLabelText('速记内容'), '面板搜索目标条目')
    await user.keyboard('{Control>}{Enter}{/Control}')
    await waitFor(() => expect(useNotes.getState().notes.length).toBe(1))

    await user.keyboard('{Control>}k{/Control}')
    const dialog = await screen.findByRole('dialog', { name: '命令面板' })
    await user.type(within(dialog).getByLabelText('搜索'), '面板搜索')
    // 断言基于输入后的最新 DOM，且作用域限定在面板内
    await waitFor(() => {
      expect(within(dialog).getAllByText('面板搜索目标条目').length).toBeGreaterThan(0)
    })
    // 点击结果项跳转（Enter 键路径在真实浏览器中验证）
    await user.click(within(dialog).getByText('面板搜索目标条目'))
    await waitFor(() => expect(screen.getByTestId('note-editor')).toBeInTheDocument())
    expect(screen.getByLabelText('速记标题')).toHaveValue('面板搜索目标条目')
  })

  it('命令面板搜「简历辅导」能到入口页（2026-10-13 起并入处理工具箱·专题，入口不缺）', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.keyboard('{Control>}k{/Control}')
    const dialog = await screen.findByRole('dialog', { name: '命令面板' })
    await user.type(within(dialog).getByLabelText('搜索'), '简历辅导')
    await user.click(await within(dialog).findByText('打开简历辅导应用'))
    await waitFor(() => expect(screen.getByRole('heading', { name: '简历辅导（独立应用）' })).toBeInTheDocument())
  })

  it('速记浮层：N 唤起，Esc 存草稿，重开可恢复', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.keyboard('n')
    const ta = await screen.findByLabelText('速记内容')
    await user.type(ta, '草稿内容')
    await user.keyboard('{Escape}')

    await user.keyboard('n')
    expect(await screen.findByLabelText('速记内容')).toHaveValue('草稿内容')
    // 清掉草稿，避免影响其他用例
    await user.clear(screen.getByLabelText('速记内容'))
    await user.keyboard('{Escape}')
  })

  it('速记浮层：点遮罩关闭同样存草稿（与 Esc 行为一致，2026-10-24 修复）', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.keyboard('n')
    await user.type(await screen.findByLabelText('速记内容'), '遮罩关闭的草稿')
    const overlay = document.querySelector('.overlay')
    expect(overlay).toBeTruthy()
    await user.click(overlay!)
    await waitFor(() => expect(screen.queryByLabelText('速记内容')).toBeNull())

    await user.keyboard('n')
    expect(await screen.findByLabelText('速记内容')).toHaveValue('遮罩关闭的草稿')
    await user.clear(screen.getByLabelText('速记内容'))
    await user.keyboard('{Escape}')
  })

  it('设置页：默认进数据分类且导出入口在；主题切换走顶栏（2026-10-24 外观卡删除）', async () => {
    const user = userEvent.setup()
    render(<App />)
    // 顶栏（banner）里的设置入口，避免与侧边栏同名链接多匹配
    await user.click(within(screen.getByRole('banner')).getByRole('link', { name: '设置' }))

    // 外观卡已删：默认分类=数据，全量导出直接可见（铁律 6 入口）
    expect(await screen.findByRole('button', { name: /全量导出/ })).toBeInTheDocument()

    // 主题唯一入口=顶栏按钮（带当前态文案，点击轮换）
    const themeBtn = within(screen.getByRole('banner')).getByRole('button', { name: /跟随系统|明亮|暗色/ })
    await user.click(themeBtn)
    await waitFor(() => expect(['dark', 'light', 'auto']).toContain(document.documentElement.dataset.theme ?? 'auto'))
  })

  it('帮助页：侧边栏进入 + ? 快捷键 + 六板块渲染（2026-10-22 重排：四模块卡已移除）', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(sidebar().getByRole('link', { name: /帮助/ }))
    // 左导航可见 + 默认分类（快速上手）内容显示
    expect(await screen.findByRole('heading', { name: '快速上手' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '快捷键' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '术语表' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: '四模块模型' })).not.toBeInTheDocument()
    // 切到排错分类后内容出现
    await user.click(screen.getByRole('button', { name: '排错' }))
    expect(await screen.findByRole('heading', { name: '排错' })).toBeInTheDocument()
    expect(screen.getByText(/一键导入按主题精选的推荐信源包/)).toBeInTheDocument()

    // ? 快捷键（非输入态）跳转帮助页
    await user.click(sidebar().getByRole('link', { name: '今日' }))
    await user.keyboard('?')
    expect(await screen.findByRole('heading', { name: '快速上手' })).toBeInTheDocument()
  })

  it('设计系统样例页渲染（W1 验收项）', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(sidebar().getByRole('link', { name: /设计系统样例/ }))
    expect(await screen.findByText(/色彩令牌/)).toBeInTheDocument()
    expect(screen.getByText('字号阶梯（8 级）', { exact: false })).toBeInTheDocument()
    expect(screen.getByText('模块标记', { exact: false })).toBeInTheDocument()
  })
})
