import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  recordError,
  track,
  listErrors,
  clearErrors,
  formatErrorLog,
  installErrorCapture,
  useErrorBar,
} from './errorLog'
import { db } from '../db/schema'

/** 错误日志系统：记录"哪里发生了什么" + 上限淘汰 + 全局捕获 + 错误条联动 */

beforeEach(async () => {
  await db.errorLog.clear()
  useErrorBar.setState({ entry: null })
  vi.restoreAllMocks()
})

describe('recordError / listErrors / clearErrors', () => {
  it('记录后可读取：where/message/stack 齐全', async () => {
    await recordError({
      where: '采集.立即抓取 runFetchAll',
      kind: 'app',
      message: '网络中断',
      stack: 'Error: 网络中断\n    at fetchFeed (rss.ts:1)',
      detail: { activeSources: 3 },
    })
    const list = await listErrors()
    expect(list).toHaveLength(1)
    expect(list[0]).toMatchObject({
      where: '采集.立即抓取 runFetchAll',
      kind: 'app',
      message: '网络中断',
    })
    expect(list[0]!.stack).toContain('fetchFeed')
    expect(list[0]!.detail).toContain('activeSources')
  })

  it('记录带版本与运行环境（导出日志可定位来源）', async () => {
    await recordError({ where: '测试', kind: 'app', message: '带环境信息' })
    const [e] = await listErrors()
    expect(e!.platform).toBe('web') // vitest jsdom 无 Tauri 标记
    expect(typeof e!.version).toBe('string')
    const md = formatErrorLog([e!])
    expect(md).toContain('网页版')
    expect(md).toContain(`版本 ${e!.version}`)
  })

  it('记录即顶出错误条；关闭后清空', async () => {
    await recordError({ where: '测试', kind: 'app', message: '出错啦' })
    expect(useErrorBar.getState().entry?.message).toBe('出错啦')
    useErrorBar.getState().dismiss()
    expect(useErrorBar.getState().entry).toBeNull()
  })

  it('超长内容截断（消息 500 / 堆栈 2000）', async () => {
    await recordError({
      where: 'w',
      kind: 'app',
      message: 'x'.repeat(600),
      stack: 's'.repeat(2500),
    })
    const [e] = await listErrors()
    expect(e!.message.length).toBeLessThanOrEqual(510)
    expect(e!.stack!.length).toBeLessThanOrEqual(2010)
  })

  it('上限淘汰：超过 300 条最旧先删', async () => {
    for (let i = 0; i < 305; i++) {
      await recordError({ where: `批量-${String(i).padStart(3, '0')}`, kind: 'app', message: `第 ${i} 条` })
    }
    const count = await db.errorLog.count()
    expect(count).toBe(300)
    const list = await listErrors(400)
    // 最新的保留；最早插入的（批量-000）已被淘汰。同毫秒批次内谁先走不保证，只断言时间戳粒度的事实
    expect(list[0]!.where).toBe('批量-304')
    expect(list.some((e) => e.where === '批量-000')).toBe(false)
    expect(list.some((e) => e.where === '批量-304')).toBe(true)
  }, 30_000)

  it('clearErrors 清空', async () => {
    await recordError({ where: 'a', kind: 'app', message: 'x' })
    await clearErrors()
    expect(await listErrors()).toHaveLength(0)
  })
})

describe('track：fire-and-forget 的兜底出口', () => {
  it('Promise 拒绝被记录（不再静默吞掉）', async () => {
    track(Promise.reject(new Error('后台任务失败')), '测试后台任务')
    await vi.waitFor(async () => {
      const list = await listErrors()
      expect(list).toHaveLength(1)
      expect(list[0]).toMatchObject({ where: '测试后台任务', kind: 'app', message: '后台任务失败' })
    })
  })

  it('成功路径不记录', async () => {
    track(Promise.resolve('ok'), '测试成功路径')
    await new Promise((r) => setTimeout(r, 20))
    expect(await listErrors()).toHaveLength(0)
  })

  it('非 Error 拒绝值也记录字符串形式', async () => {
    track(Promise.reject('裸字符串原因'), '测试裸拒绝')
    await vi.waitFor(async () => {
      const list = await listErrors()
      expect(list[0]!.message).toBe('裸字符串原因')
    })
  })
})

describe('installErrorCapture：全局捕获', () => {
  it('引导阶段单槽记录搬运入库（只搬一次，且不打扰当前会话）', async () => {
    localStorage.setItem('__pwork-lasterr', 'Uncaught Error: 早期崩溃 @ app.tsx:1')
    installErrorCapture()
    await vi.waitFor(async () => {
      const list = await listErrors()
      expect(list).toHaveLength(1)
      expect(list[0]).toMatchObject({ where: '引导阶段（应用代码加载前）' })
      expect(list[0]!.message).toContain('早期崩溃')
    })
    // 历史搬运是静默的——不弹错误条（那不是本次会话的错）
    expect(useErrorBar.getState().entry).toBeNull()
    // 再次安装不再重复搬运同一条
    installErrorCapture()
    await new Promise((r) => setTimeout(r, 20))
    expect(await db.errorLog.count()).toBe(1)
  })

  it('window error 与 unhandledrejection 均被记录', async () => {
    installErrorCapture()
    window.dispatchEvent(
      new ErrorEvent('error', {
        message: '脚本报错',
        error: new Error('脚本报错'),
        filename: 'http://localhost/x.ts',
        lineno: 7,
      }),
    )
    const ev = new Event('unhandledrejection')
    Object.defineProperty(ev, 'reason', { value: new Error('异步炸了') })
    window.dispatchEvent(ev)
    await vi.waitFor(async () => {
      const list = await listErrors()
      expect(list).toHaveLength(2)
      const kinds = list.map((e) => e.where)
      expect(kinds).toContain('全局脚本错误')
      expect(kinds).toContain('未处理的异步错误')
    })
  })
})

describe('formatErrorLog：导出格式', () => {
  it('Markdown 包含时间/类别/位置/消息', async () => {
    await recordError({ where: '页面渲染崩溃', kind: 'render', message: '组件炸了' })
    const [e] = await listErrors()
    const md = formatErrorLog([e!])
    expect(md).toContain('# PWORK 错误日志')
    expect(md).toContain('页面渲染崩溃')
    expect(md).toContain('组件炸了')
  })
})
