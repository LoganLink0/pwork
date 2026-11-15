import { beforeEach, describe, expect, it } from 'vitest'
import { loadJobs, saveJobs, createJob, markTask, finishJob, settleAll, trimJobs } from './produceJob'
import { fallbackPlan } from './producePlan'
import { db } from '../../../db/schema'

beforeEach(async () => {
  await db.clearAll()
})

const NOW = new Date('2026-11-15T10:00:00')

function mkJob(leaseMs = 10 * 60_000) {
  return createJob(fallbackPlan(NOW), { now: NOW, ownerId: 'test', leaseMs })
}

describe('produceJob（kv 单行任务状态）', () => {
  it('saveJobs/loadJobs 回读一致', async () => {
    const job = mkJob()
    await saveJobs({ jobs: [job] })
    const s = await loadJobs()
    expect(s.jobs).toHaveLength(1)
    expect(s.jobs[0].plan.title).toContain('2026-11-15')
  })

  it('markTask 纯函数：只改目标任务', () => {
    const job = mkJob()
    const s = markTask({ jobs: [job] }, job.id, job.tasks[0].id, { status: 'done', fileName: 'x.md' })
    expect(s.jobs[0].tasks[0].status).toBe('done')
    expect(s.jobs[0].tasks[0].fileName).toBe('x.md')
    expect(s.jobs[0].tasks[1].status).toBe('pending')
  })

  it('finishJob：全成 done、有败 failed，notice 说人话', () => {
    const job = mkJob()
    let s = markTask({ jobs: [job] }, job.id, job.tasks[0].id, { status: 'done' })
    s = markTask(s, job.id, job.tasks[1].id, { status: 'done' })
    s = markTask(s, job.id, job.tasks[2].id, { status: 'failed', error: 'x' })
    s = finishJob(s, job.id, ['a.md', 'b.pptx'])
    expect(s.jobs[0].status).toBe('done')
    expect(s.jobs[0].notice).toContain('2 个完成')
    expect(s.jobs[0].notice).toContain('1 个失败')
  })

  it('settleAll：只回收租约过期的 running，未过期不动', async () => {
    const expired = mkJob(-20 * 60_000) // 租约早已过期（now-20min 起，10min 租约）
    const fresh = createJob(fallbackPlan(new Date(NOW.getTime() + 60_000)), { now: new Date(NOW.getTime() + 60_000), ownerId: 'test', leaseMs: 10 * 60_000 })
    const s = { jobs: [expired, fresh] }
    const r = settleAll(s, new Date(NOW.getTime() + 30_000), 0) // now+30s，租约判定用 0 宽限
    expect(r.recovered).toHaveLength(1)
    expect(r.recovered[0].id).toBe(expired.id)
    expect(r.state.jobs.find((j) => j.id === fresh.id)?.status).toBe('running')
  })

  it('trimJobs 保留最近 5 个', () => {
    const jobs = Array.from({ length: 7 }, (_, i) => ({ ...mkJob(), id: `job-${i}`, startedAt: new Date(NOW.getTime() + i * 1000).toISOString() }))
    const t = trimJobs({ jobs })
    expect(t.jobs).toHaveLength(5)
    expect(t.jobs[0].id).toBe('job-6') // 最近优先
  })
})
