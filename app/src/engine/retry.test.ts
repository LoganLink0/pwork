import { describe, expect, it } from 'vitest'
import { withRetry, isTransientAiError } from './retry'

describe('withRetry（通用重试）', () => {
  it('429/网络错误重试后成功', async () => {
    let calls = 0
    const r = await withRetry(
      async () => {
        calls++
        if (calls < 3) throw new Error('上游返回 429 Too Many Requests')
        return 'ok'
      },
      { retryOn: isTransientAiError, waitsMs: [1, 1] },
    )
    expect(r).toBe('ok')
    expect(calls).toBe(3)
  })

  it('非暂时性错误立即上抛不重试', async () => {
    let calls = 0
    await expect(
      withRetry(
        async () => {
          calls++
          throw new Error('API Key 无效（401）')
        },
        { retryOn: isTransientAiError, waitsMs: [1, 1] },
      ),
    ).rejects.toThrow('401')
    expect(calls).toBe(1)
  })

  it('重试次数耗尽上抛最后一次错误', async () => {
    let calls = 0
    await expect(
      withRetry(
        async () => {
          calls++
          throw new Error('503 Service Unavailable')
        },
        { retryOn: isTransientAiError, waitsMs: [1] },
      ),
    ).rejects.toThrow('503')
    expect(calls).toBe(2) // 首次 + 1 次重试
  })

  it('isTransientAiError 分类：429/5xx/超时/网络为瞬态，401/配置类不是', () => {
    expect(isTransientAiError(new Error('HTTP 429'))).toBe(true)
    expect(isTransientAiError(new Error('500 Internal'))).toBe(true)
    expect(isTransientAiError(new Error('请求超时'))).toBe(true)
    expect(isTransientAiError(new Error('还没有配置 AI'))).toBe(false)
    expect(isTransientAiError(new Error('401 unauthorized'))).toBe(false)
  })
})
