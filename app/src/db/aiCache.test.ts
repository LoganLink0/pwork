import { beforeEach, describe, expect, it } from 'vitest'
import { aiCacheKey, getCachedAi, putCachedAi } from './aiCache'
import { db } from './schema'

/** AI 结果缓存契约：键随要素变化、TTL、超量淘汰 */

beforeEach(async () => {
  await db.aiCache.clear()
})

describe('aiCache（AIHOT 回执思想的轻量版）', () => {
  it('缓存键随任一要素变化（目的/输入/提示词/模型）', () => {
    const k1 = aiCacheKey('a', 'x', 's', 'm')
    expect(aiCacheKey('a', 'x', 's', 'm')).toBe(k1)
    expect(aiCacheKey('a', 'y', 's', 'm')).not.toBe(k1)
    expect(aiCacheKey('b', 'x', 's', 'm')).not.toBe(k1)
    expect(aiCacheKey('a', 'x', 's2', 'm')).not.toBe(k1)
    expect(aiCacheKey('a', 'x', 's', 'm2')).not.toBe(k1)
  })

  it('写入后命中；TTL 过期返回 null（不返回陈旧产出）', async () => {
    const key = aiCacheKey('article', 'm1', 'sys', 'model')
    expect(await getCachedAi(key)).toBeNull()
    await putCachedAi(key, 'article', '产出文本', 'model')
    expect(await getCachedAi(key)).toBe('产出文本')

    const row = await db.aiCache.get(key)
    await db.aiCache.put({ ...row!, createdAt: new Date(Date.now() - 8 * 86400_000).toISOString() })
    expect(await getCachedAi(key)).toBeNull()
  })

  it('超量淘汰最旧（写入顺带维护，上限 200）', async () => {
    for (let i = 0; i < 205; i++) {
      // k 行时间戳在过去且递增（k0 最旧）；fresh 写入时刻为最新
      await db.aiCache.put({ id: `k${i}`, purpose: 'p', output: 'o', model: 'm', createdAt: new Date(Date.now() - (205 - i) * 1000).toISOString() })
    }
    await putCachedAi('fresh', 'p', '新产出', 'm')
    expect(await db.aiCache.count()).toBeLessThanOrEqual(200)
    expect(await db.aiCache.get('k0')).toBeUndefined()
    expect(await db.aiCache.get('k204')).toBeDefined()
    expect(await db.aiCache.get('fresh')).toBeDefined()
  })
})
