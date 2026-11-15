/**
 * 成稿任务状态（2026-11-15 外部研读报告改动 1）：kv 单行存储——瞬时态不建新表
 * （新表要同步十余处：schema/delegate/db.rs DDL/备份 12 表/镜像/守卫/同步口径，
 * 报告 §4.2 核实清单），kv 天然不在备份/wipeAndImport/镜像/守卫口径内，正好。
 * 崩溃自愈：leaseUntil 租约 + settleAll 只回收过期 job（恢复备份后可能残留 running，
 * 启动/进入页面时 settle 一次）。
 * 注意：kv 无索引列（db.rs `"meta"|"kv" => Some(&[])`）——只能整行读写 + JS 内过滤，
 * 禁止 db.table('kv').where(...)（会生成不存在的列而报错）。
 */
import { db } from '../../../db/schema'
import type { AssetTask, ProducePlan } from './producePlan'

export const PRODUCE_JOBS_KEY = 'pwork-produce-jobs'

export interface ProduceJob {
  id: string
  plan: ProducePlan
  tasks: AssetTask[]
  startedAt: string
  ownerId: string
  /** 租约到点：超过此时间的 running job 视为孤儿，settleAll 回收 */
  leaseUntil: string
  status: 'running' | 'done' | 'failed'
  notice?: string
  /** 产物文件名清单（done 后汇总） */
  files?: string[]
}

export interface ProduceJobsState {
  jobs: ProduceJob[]
}

export async function loadJobs(): Promise<ProduceJobsState> {
  const row = await db.kv.get(PRODUCE_JOBS_KEY)
  const v = row?.value as ProduceJobsState | undefined
  return v && Array.isArray(v.jobs) ? { jobs: v.jobs } : { jobs: [] }
}

export async function saveJobs(state: ProduceJobsState): Promise<void> {
  await db.kv.put({ key: PRODUCE_JOBS_KEY, value: state })
}

export function createJob(
  plan: ProducePlan,
  opts: { now: Date; ownerId: string; leaseMs: number },
): ProduceJob {
  return {
    id: `job-${opts.now.getTime()}`,
    plan,
    tasks: plan.tasks.map((t) => ({ ...t, status: 'pending' as const })),
    startedAt: opts.now.toISOString(),
    ownerId: opts.ownerId,
    leaseUntil: new Date(opts.now.getTime() + opts.leaseMs).toISOString(),
    status: 'running',
  }
}

/** 纯函数：更新某任务状态，返回新 state（不落库，调用方 saveJobs） */
export function markTask(
  state: ProduceJobsState,
  jobId: string,
  taskId: string,
  patch: Partial<Pick<AssetTask, 'status' | 'error' | 'fileName'>>,
): ProduceJobsState {
  return {
    jobs: state.jobs.map((j) =>
      j.id === jobId
        ? { ...j, tasks: j.tasks.map((t) => (t.id === taskId ? { ...t, ...patch } : t)) }
        : j,
    ),
  }
}

/** 纯函数：job 收尾（全部任务终态后置 done/failed，带产物清单与 notice） */
export function finishJob(state: ProduceJobsState, jobId: string, files: string[]): ProduceJobsState {
  return {
    jobs: state.jobs.map((j) => {
      if (j.id !== jobId) return j
      const failed = j.tasks.filter((t) => t.status === 'failed')
      const ok = j.tasks.filter((t) => t.status === 'done')
      return {
        ...j,
        status: ok.length > 0 ? 'done' : 'failed',
        files,
        notice:
          ok.length === j.tasks.length
            ? `${ok.length} 个产物全部完成`
            : `${ok.length} 个完成，${failed.length} 个失败（${failed.map((f) => f.title).join('、')}）`,
      }
    }),
  }
}

/** 启动/进入页面时回收：只回收租约已过期的 running job（标记 failed 并说明离开期间完成情况） */
export function settleAll(state: ProduceJobsState, now: Date, leaseMs: number): { state: ProduceJobsState; recovered: ProduceJob[] } {
  const recovered: ProduceJob[] = []
  const jobs = state.jobs.map((j) => {
    if (j.status !== 'running') return j
    const expired = new Date(j.leaseUntil).getTime() + leaseMs < now.getTime()
    if (!expired) return j
    const done = j.tasks.filter((t) => t.status === 'done')
    const rec: ProduceJob = {
      ...j,
      status: done.length > 0 ? 'done' : 'failed',
      notice: `应用离开期间中断：${done.length} 个产物已完成${done.length ? `（${done.map((d) => d.title).join('、')}）` : ''}`,
    }
    recovered.push(rec)
    return rec
  })
  return { state: { jobs }, recovered }
}

/** 保留最近 5 个 job（防止 kv 无限增长） */
export function trimJobs(state: ProduceJobsState, keep = 5): ProduceJobsState {
  const jobs = [...state.jobs].sort((a, b) => b.startedAt.localeCompare(a.startedAt))
  return { jobs: jobs.slice(0, keep) }
}
