/**
 * 本地时间工具（FUPAN 开发复盘 1.4 的教训原样继承）。
 * toISOString 是 UTC——本地晚 8 点后会把"今天"显示成明天、逾期判断提前 8 小时。
 * 全项目禁用裸 toISOString 做日期判断。
 */
const pad = (n: number) => String(n).padStart(2, '0')

/** '2026-08-29 20:05'（本地时区） */
export function fmtLocal(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** 本地今天的 'YYYY-MM-DD'（"今日速记"判断用） */
export function todayLocal(now = new Date()): string {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

/** 日历口径的后一天（'YYYY-MM-DD'），最多到 today；已在今天或越界返回 null。
 *  日报日期导航用：不能被"有数据的日子"绑死——今天还没条目时也要能走到今天看空态。 */
export function nextCalendarDay(date: string, today = todayLocal()): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date >= today) return null
  const next = new Date(Date.parse(`${date}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10)
  return next <= today ? next : today
}

/**
 * ISO 时间串 → 本地日期 'YYYY-MM-DD'。
 * 开发复盘 1.4 的深层版教训：入库时间戳是 UTC ISO，按本地日筛选/统计时
 * 必须先转 Date 再取本地字段——裸 iso.slice(0,10) 在本地 0 点到早上 8 点之间全部错位一天。
 */
export function localDateOf(iso: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : todayLocal(d)
}

/** 本地月份 'YYYY-MM'（月报默认值用） */
export function monthLocal(now = new Date()): string {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}`
}

/** 本地星期几（中文） */
export function weekdayLocal(now = new Date()): string {
  return ['日', '一', '二', '三', '四', '五', '六'][now.getDay()] ?? ''
}

/** 相对时间：列表展示用（刚刚 / N 分钟前 / 昨天 / 日期） */
export function relTime(iso: string, now = new Date()): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  const diffMs = now.getTime() - d.getTime()
  if (diffMs < 0) return fmtLocal(iso) // 未来时间（时钟漂移兜底）
  const min = Math.floor(diffMs / 60_000)
  if (min < 1) return '刚刚'
  if (min < 60) return `${min} 分钟前`
  const sameDay = todayLocal(d) === todayLocal(now)
  if (sameDay) {
    const h = Math.floor(min / 60)
    return h < 1 ? `${min} 分钟前` : `${h} 小时前`
  }
  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  if (todayLocal(d) === todayLocal(yesterday)) return `昨天 ${pad(d.getHours())}:${pad(d.getMinutes())}`
  const sameYear = d.getFullYear() === now.getFullYear()
  if (sameYear) return `${d.getMonth() + 1}月${d.getDate()}日`
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** 问候语（按本地时刻） */
export function greetWord(now = new Date()): string {
  const h = now.getHours()
  if (h < 5) return '夜深了'
  if (h < 11) return '早安'
  if (h < 14) return '午安'
  if (h < 18) return '下午好'
  return '晚上好'
}
