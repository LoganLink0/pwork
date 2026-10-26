import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { SourceCatalog } from './SourceCatalog'
import { useCollect } from '../../store/collect'
import { SOURCE_CATALOG } from '../../content/collect'

/**
 * 信源目录（引导/信源页共用）：导入必须走 store（importCatalog）——
 * 2026-10-26 修复：组件曾直接调 db 层绕过 store，导入成功后信源页计数与列表停留在 0；
 * 本用例固化「写库后 store 立即刷新 + 目录出现已导入徽标 + 失败有显性回报」的行为。
 */
describe('信源目录导入', () => {
  it('导入走 store：写库后 sources 立即刷新、目录出现已导入徽标，重复导入按地址去重', async () => {
    const user = userEvent.setup()
    const msgs: string[] = []
    render(<SourceCatalog onDone={(m) => msgs.push(m)} />)

    // 默认预选各领域 tier 1 源
    const tier1 = SOURCE_CATALOG.flatMap((g) => g.sources).filter((e) => e.tier === 1)
    expect(tier1.length).toBeGreaterThan(0)

    await user.click(screen.getByRole('button', { name: new RegExp(`导入所选 ${tier1.length} 个`) }))

    // store 刷新（修复点：此前停在空数组，信源页显示「0 个活跃 / 共 0」）
    await waitFor(() => expect(useCollect.getState().sources.length).toBe(tier1.length))
    // 已导入徽标：目录一次只渲染当前领域页（默认第一个），徽标数与该领域已导入数一致
    const firstDomainTier1 = SOURCE_CATALOG[0]!.sources.filter((e) => e.tier === 1)
    expect(document.querySelectorAll('.cat.imported').length).toBe(firstDomainTier1.length)
    expect(msgs[0]).toMatch(/^已导入 \d+ 个信源/)

    // 再次导入：按地址去重不产生重复行，onDone 回报都已导入过
    await user.click(screen.getByRole('button', { name: /导入所选/ }))
    await waitFor(() => expect(msgs[1]).toMatch(/都已导入过/))
    expect(useCollect.getState().sources.length).toBe(tier1.length)
  })
})
