/**
 * 系统通知（0.4 批，2026-10-29）：让应用不在眼前时也能把要紧事送出来。
 * 三样（路线图 0.4 定稿）：待办到期 / 复盘节奏 / 日报就绪——都从既有信号出，
 * 不新增数据依赖。桌面版走 Tauri 通知插件；浏览器版走 Web Notification
 * （权限必须在用户手势里申请，所以浏览器版默认关，设置页开启时申请）。
 * 每类通知每日最多一条（kv 日期戳防重）——提醒是钩子，别变成噪音。
 */
import { isPermissionGranted, requestPermission, sendNotification } from '@tauri-apps/plugin-notification'
import { isDesktopApp } from './platform'
import { db } from '../db/schema'
import { todayLocal as localDay } from './datetime'

export type NotifyKind = 'tasks' | 'review' | 'digest'

export interface NotifyConfig {
  tasks: boolean
  review: boolean
  digest: boolean
}

const CFG_KEY = 'pwork-notify'
const DEFAULT_CFG: NotifyConfig = { tasks: true, review: false, digest: false }

export function loadNotifyConfig(): NotifyConfig {
  try {
    const raw = localStorage.getItem(CFG_KEY)
    if (!raw) return { ...DEFAULT_CFG }
    const p = JSON.parse(raw) as Partial<NotifyConfig>
    return { tasks: p.tasks === true, review: p.review === true, digest: p.digest === true }
  } catch {
    return { ...DEFAULT_CFG }
  }
}

export function saveNotifyConfig(cfg: NotifyConfig): void {
  localStorage.setItem(CFG_KEY, JSON.stringify(cfg))
}

/** 今日已发过该类通知吗（kv 日期戳；发过写当日日期） */
async function alreadySentToday(kind: NotifyKind, today: string): Promise<boolean> {
  const row = await db.kv.get(`pwork-notify-at-${kind}`)
  return (row?.value as string | undefined) === today
}

async function markSent(kind: NotifyKind, today: string): Promise<void> {
  await db.kv.put({ key: `pwork-notify-at-${kind}`, value: today })
}

/** 发一条系统通知。配置关/权限未给/今日已发 都静默跳过；deliver 可注入（测试），注入 now 便于测试 */
export async function sendDailyNotify(
  kind: NotifyKind,
  title: string,
  body: string,
  now = new Date(),
  deliver?: (t: string, b: string) => Promise<void>,
): Promise<boolean> {
  if (!loadNotifyConfig()[kind]) return false
  const today = now.toISOString().slice(0, 10)
  if (await alreadySentToday(kind, today)) return false
  try {
    if (deliver) {
      await deliver(title, body)
    } else if (isDesktopApp()) {
      if (!(await isPermissionGranted())) {
        const p = await requestPermission()
        if (p !== 'granted') return false
      }
      sendNotification({ title, body })
    } else {
      if (typeof Notification === 'undefined') return false
      if (Notification.permission !== 'granted') return false // 浏览器版权限只在设置页开启时申请
      new Notification(title, { body })
    }
  } catch {
    return false // 通知失败不影响主流程（它只是提醒，不是承诺）
  }
  await markSent(kind, today)
  return true
}

/** 启动时的一次性检查（待办到期 + 复盘节奏），注入数据便于测试 */
export async function runStartupNotifies(
  data: { overdueTasks: string[]; reviewDue: boolean },
  now = new Date(),
): Promise<{ tasks: boolean; review: boolean }> {
  const today = now.toLocaleDateString('zh-CN')
  let tasks = false
  let review = false
  if (data.overdueTasks.length > 0) {
    tasks = await sendDailyNotify(
      'tasks',
      '有待办到期了',
      `${data.overdueTasks.length} 个待办已过期：${data.overdueTasks.slice(0, 3).join('、')}${data.overdueTasks.length > 3 ? ' 等' : ''}（${today}）`,
      now,
    )
  }
  if (data.reviewDue) {
    review = await sendDailyNotify('review', '该复盘了', '距上次复盘已超过一周——花三分钟，把这段时间沉淀下来。', now)
  }
  return { tasks, review }
}

/** 自取数壳：逾期待办标题 + 距上次复盘是否超七天（与 signals 引擎同口径），App 启动直接调用 */
export async function runStartupNotifiesFromDb(now = new Date()): Promise<{ tasks: boolean; review: boolean }> {
  const [tasks, lastReview] = await Promise.all([
    db.tasks.toArray(),
    db.reviews.orderBy('createdAt').reverse().limit(1).toArray(),
  ])
  const today = localDay(now)
  const overdueTasks = tasks
    .filter((t) => t.deletedAt === null && t.status === 'todo' && t.due !== undefined && t.due < today)
    .map((t) => t.title)
  const reviewDue =
    lastReview[0]?.createdAt != null &&
    now.getTime() - new Date(lastReview[0].createdAt).getTime() >= 7 * 86_400_000
  return runStartupNotifies({ overdueTasks, reviewDue }, now)
}

/** 日报就绪通知（云端拉到新条目时调用） */
export function notifyDigestReady(count: number): Promise<boolean> {
  return sendDailyNotify('digest', '今天的信息日报好了', `云端新抓了 ${count} 条，打开「信息日报」看看。`)
}
