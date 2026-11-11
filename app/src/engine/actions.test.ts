import { describe, expect, it, vi } from 'vitest'
import { APP_ACTIONS, actionById, paletteActions, wheelActionForKind, type ActionCtx } from './actions'

/**
 * 动作注册表契约（2.3）：面板/轮盘/快捷键三入口同源的保障——
 * 登记完备性、面板派生过滤、轮盘 kind 映射、执行语义。
 */

const ctx = (): ActionCtx & { nav: string[]; quick: number; pal: string[] } => {
  const nav: string[] = []
  const pal: string[] = []
  const c: ActionCtx & { nav: string[]; quick: number; pal: string[] } = {
    navigate: (p) => nav.push(p),
    openQuickNote: () => c.quick++,
    openPalette: (via) => pal.push(via ?? ''),
    nav,
    quick: 0,
    pal,
  }
  return c
}

describe('动作注册表完备性（契约）', () => {
  it('每条动作有 id/label/icon/desc/run；id 全局唯一', () => {
    const ids = new Set<string>()
    for (const a of APP_ACTIONS) {
      expect(a.id).toMatch(/^[a-z-]+$/)
      expect(a.label.length).toBeGreaterThan(0)
      expect(a.icon).toBeTruthy()
      expect(a.desc.length).toBeGreaterThan(0)
      expect(typeof a.run).toBe('function')
      expect(ids.has(a.id), `动作 id 重复：${a.id}`).toBe(false)
      ids.add(a.id)
    }
    expect(APP_ACTIONS.length).toBeGreaterThanOrEqual(6) // 数量骤降说明登记被误删
  })

  it('快捷键三键位引用的动作必须存在（键位改名不悄悄失效）', () => {
    for (const id of ['quick-note', 'open-help', 'open-settings', 'open-palette']) {
      expect(actionById(id), `快捷键引用的动作缺失：${id}`).toBeTruthy()
    }
  })

  it('paletteActions 只含 inPalette 标记的动作；打开面板自身不进面板', () => {
    const list = paletteActions()
    expect(list.map((a) => a.id)).toEqual(['quick-note', 'new-review', 'fetch-digest'])
    expect(actionById('open-palette')?.inPalette).toBe(false)
  })

  it('执行语义：导航类进 ctx.navigate，速记类走浮层', () => {
    const c = ctx()
    actionById('open-help')!.run(c)
    actionById('open-settings')!.run(c)
    actionById('new-review')!.run(c)
    expect(c.nav).toEqual(['/help', '/settings', '/review/new'])
    actionById('quick-note')!.run(c)
    expect(c.quick).toBe(1)
    actionById('open-palette')!.run(c)
    expect(c.pal).toEqual(['key'])
  })

  it('未知 id 就地返回 undefined（fast-fail 由调用方判空）', () => {
    expect(actionById('nope')).toBeUndefined()
  })
})

describe('轮盘 kind 映射（用户数据模型不动，执行端收敛）', () => {
  it('quick→quick-note、fetch→fetch-digest，映射动作存在', () => {
    expect(wheelActionForKind('quick')).toBe('quick-note')
    expect(wheelActionForKind('fetch')).toBe('fetch-digest')
    expect(actionById(wheelActionForKind('quick'))).toBeTruthy()
    expect(actionById(wheelActionForKind('fetch'))).toBeTruthy()
  })

  it('fetch-digest 行为=触发抓取 + 进日报（与旧 WheelActionSink 行为一致，回归锁）', async () => {
    const fetchSpy = vi.fn()
    vi.resetModules()
    vi.doMock('../store/collect', () => ({
      useCollect: { getState: () => ({ runFetchAll: fetchSpy }) },
    }))
    const { actionById: freshById } = await import('./actions')
    const c = ctx()
    freshById('fetch-digest')!.run(c)
    await vi.waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(1))
    expect(c.nav).toEqual(['/input/digest'])
    vi.doUnmock('../store/collect')
    vi.resetModules()
  })
})
