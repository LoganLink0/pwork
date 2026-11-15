/**
 * 成稿任务状态（2026-11-15 外部研读报告改动 1 · v2 重做）：kv 单行——瞬时态不建新表
 * （新表要同步十余处），kv 天然不在备份/wipeAndImport/镜像/守卫口径内，正好。
 * v2 变化：产物不再直接落盘下载——先在页内预览，用户看过了再导出；
 * job 只记状态摘要（产物内容在会话内，刷新后重新生成——AI 缓存让重生成不重复计费）。
 * 崩溃自愈：leaseUntil 租约 + settle 只回收过期 running。
 */
import { db } from '../../../db/schema'

export const PRODUCE_JOBS_KEY = 'pwork-produce-jobs'

export interface ProduceJob {
  id: string
  title: string
  startedAt: string
  /** 租约到点：超过此时间的 running job 视为孤儿，settle 回收 */
  leaseUntil: string
  status: 'running' | 'done' | 'failed'
  notice?: string
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
  title: string,
  opts: { now: Date; leaseMs: number },
): ProduceJob {
  return {
    id: `job-${opts.now.getTime()}`,
    title,
    startedAt: opts.now.toISOString(),
    leaseUntil: new Date(opts.now.getTime() + opts.leaseMs).toISOString(),
    status: 'running',
  }
}

export function finishJob(state: ProduceJobsState, jobId: string, notice: string, status: 'done' | 'failed'): ProduceJobsState {
  return {
    jobs: state.jobs.map((j) => (j.id === jobId ? { ...j, status, notice } : j)),
  }
}

/** 启动/进入页面时回收：租约过期的 running 标记中断，其余不动 */
export function settle(state: ProduceJobsState, now: Date): { state: ProduceJobsState; recovered: ProduceJob[] } {
  const recovered: ProduceJob[] = []
  const jobs = state.jobs.map((j) => {
    if (j.status !== 'running') return j
    if (new Date(j.leaseUntil).getTime() < now.getTime()) {
      const rec: ProduceJob = { ...j, status: 'failed', notice: '应用离开期间中断，重新生成即可（已生成内容走 AI 缓存，不重复计费）' }
      recovered.push(rec)
      return rec
    }
    return j
  })
  return { state: { jobs }, recovered }
}

/** 保留最近 5 个 job（防 kv 无限增长） */
export function trimJobs(state: ProduceJobsState, keep = 5): ProduceJobsState {
  const jobs = [...state.jobs].sort((a, b) => b.startedAt.localeCompare(a.startedAt))
  return { jobs: jobs.slice(0, keep) }
}
