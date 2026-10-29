import { beforeEach, describe, expect, it } from 'vitest'
import { loadNotifyConfig, saveNotifyConfig, sendDailyNotify, runStartupNotifies, type NotifyConfig } from './notify'
import { db } from '../db/schema'

/** 系统通知三样（0.4-1）：配置读写 + 每日防重 + 启动编排 */

beforeEach(async () => {
  localStorage.clear()
  await db.kv.clear()
})

describe('配置读写', () => {
  it('无配置 → 默认（待办开，其余关）', () => {
    expect(loadNotifyConfig()).toEqual({ tasks: true, review: false, digest: false })
  })
  it('保存后原样读回', () => {
    const cfg: NotifyConfig = { tasks: false, review: true, digest: true }
    saveNotifyConfig(cfg)
    expect(loadNotifyConfig()).toEqual(cfg)
  })
})

describe('sendDailyNotify（每日防重）', () => {
  const deliver = async () => {}
  const now = new Date('2026-10-29T08:00:00')

  it('配置关 → 不发', async () => {
    saveNotifyConfig({ tasks: false, review: false, digest: false })
    expect(await sendDailyNotify('tasks', 't', 'b', now, deliver)).toBe(false)
  })

  it('配置开 → 发出并记当日戳；同日再发被防重', async () => {
    saveNotifyConfig({ tasks: true, review: false, digest: false })
    expect(await sendDailyNotify('tasks', 't', 'b', now, deliver)).toBe(true)
    expect(await sendDailyNotify('tasks', 't2', 'b2', now, deliver)).toBe(false)
    // 次日再发不受影响
    expect(await sendDailyNotify('tasks', 't3', 'b3', new Date('2026-10-30T08:00:00'), deliver)).toBe(true)
  })

  it('各类独立防重（tasks 发过不影响 digest）', async () => {
    saveNotifyConfig({ tasks: true, review: false, digest: true })
    expect(await sendDailyNotify('tasks', 't', 'b', now, deliver)).toBe(true)
    expect(await sendDailyNotify('digest', 'd', 'b', now, deliver)).toBe(true)
  })
})

describe('runStartupNotifies（启动编排）', () => {
  it('无逾期且复盘未到期 → 两类都不发', async () => {
    const r = await runStartupNotifies({ overdueTasks: [], reviewDue: false })
    expect(r).toEqual({ tasks: false, review: false })
  })

  it('有逾期且配置开 → 走发送通道（jsdom 无系统通知，投递失败如实返回 false）', async () => {
    saveNotifyConfig({ tasks: true, review: true, digest: false })
    const r = await runStartupNotifies({ overdueTasks: ['交周报'], reviewDue: true })
    expect(r.tasks).toBe(false) // 浏览器测试环境无 Notification API，不发但不报错
    expect(r.review).toBe(false)
  })
})
