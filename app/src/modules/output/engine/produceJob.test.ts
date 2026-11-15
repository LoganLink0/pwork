import { describe, expect, it } from 'vitest'
import { loadJobs, saveJobs, createJob, finishJob, settle, trimJobs } from './produceJob'
import { db } from '../../../db/schema'

import { beforeEach } from 'vitest'

beforeEach(async () => {
  await db.clearAll()
})

const NOW = new Date('2026-11-15T10:00:00')

describe('produceJob（kv 单行任务状态 · v2）', () => {
  it('create/save/load 回读一致', async () => {
    const job = createJob('测试成稿', { now: NOW, leaseMs: 10 * 60_000 })
    await saveJobs({ jobs: [job] })
    const s = await loadJobs()
    expect(s.jobs).toHaveLength(1)
    expect(s.jobs[0].title).toBe('测试成稿')
    expect(s.jobs[0].status).toBe('running')
  })

  it('finishJob 写终态与 notice', () => {
    const job = createJob('测试', { now: NOW, leaseMs: 60_000 })
    const s = finishJob({ jobs: [job] }, job.id, '三产物已生成', 'done')
    expect(s.jobs[0].status).toBe('done')
    expect(s.jobs[0].notice).toContain('三产物')
  })

  it('settle：租约过期回收、未过期不动', () => {
    const expired = createJob('旧任务', { now: new Date(NOW.getTime() - 30 * 60_000), leaseMs: 10 * 60_000 })
    const fresh = createJob('新任务', { now: NOW, leaseMs: 10 * 60_000 })
    const r = settle({ jobs: [expired, fresh] }, NOW)
    expect(r.recovered).toHaveLength(1)
    expect(r.recovered[0].status).toBe('failed')
    expect(r.state.jobs.find((j) => j.id === fresh.id)?.status).toBe('running')
  })

  it('trimJobs 保留最近 5 个', () => {
    const jobs = Array.from({ length: 7 }, (_, i) => ({ ...createJob(`t${i}`, { now: NOW, leaseMs: 1000 }), id: `job-${i}`, startedAt: new Date(NOW.getTime() + i * 1000).toISOString() }))
    const t = trimJobs({ jobs })
    expect(t.jobs).toHaveLength(5)
    expect(t.jobs[0].id).toBe('job-6')
  })
})
