import { render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { useCollect } from './store/collect'
import { saveCloudConfig } from './db/cloudSync'

/**
 * 打开应用自动同步云端（2026-10-12 用户拍板）：
 * 已配置 → App 挂载即拉取合并进采集库；未配置 → 不发任何请求。
 * 独立成文件：App 模块内有"只跑一次"标记，不能与其它渲染 App 的测试文件共享模块实例。
 */
describe('打开应用自动同步云端', () => {
  beforeEach(() => {
    localStorage.clear()
    localStorage.setItem('pwork-welcomed', '1')
    window.location.hash = ''
    useCollect.setState({ items: [], sources: [], loaded: false })
    vi.unstubAllGlobals()
  })

  it('已配置（端点模式）→ 挂载即拉取，新条目合并进采集库', async () => {
    saveCloudConfig({ mode: 'endpoint', endpoint: 'https://w.example', token: 'tk', accountId: '', databaseId: '' })
    const item = (id: string, fp: string) => ({
      cloudId: id, sourceId: 'src', sourceName: '源', url: `https://e.com/${id}`, title: `自动同步标题${id}`,
      summary: '', fingerprint: fp, publishedAt: null, fetchedAt: '2026-10-12T08:00:00.000Z', stage: 'scored',
      score: { total: 70, source: 1, novelty: 1, relevance: 0.5, utility: 0.3 }, scoreReason: 'r', aiBy: 'rules',
      tags: [], otFlag: null,
    })
    vi.stubGlobal('fetch', vi.fn(async () =>
      new Response(JSON.stringify({ serverTime: '2026-10-12T09:00:00.000Z', items: [item('a', 'fp_auto_a'), item('b', 'fp_auto_b')] }), { status: 200 }),
    ))

    render(<App />)
    await screen.findByRole('heading', { name: /早安|午安|下午好|晚上好|夜深了/ })
    await waitFor(() => expect(useCollect.getState().items.length).toBe(2))
    expect(localStorage.getItem('pwork-cloud-lastsync')).toBe('2026-10-12T09:00:00.000Z')
  })

  it('未配置 → 挂载不发任何网络请求（普通用户零打扰）', async () => {
    const spy = vi.fn()
    vi.stubGlobal('fetch', spy)
    render(<App />)
    await screen.findByRole('heading', { name: /早安|午安|下午好|晚上好|夜深了/ })
    expect(spy).not.toHaveBeenCalled()
  })
})
