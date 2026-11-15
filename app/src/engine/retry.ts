/**
 * 通用重试（2026-11-15 外部研读报告改动 1 组件）：LLM 上游 429/超时的指数退避重试，
 * 唯一出处——成稿管线使用；后续采集/同步链的重试统一收敛到这里。
 * retryOn 判定哪些错误可重试（429/网络类）；不可重试错误立即上抛。
 * waitsMs 由调用方按自身预算给定（成稿管线用 [2000, 8000]；不照抄外部数值）。
 */
export interface RetryPolicy {
  /** 返回 true 的错误才重试（429/网络超时等暂时性错误） */
  retryOn: (e: unknown) => boolean
  /** 每次重试前等待的毫秒序列（长度 = 最大重试次数） */
  waitsMs: number[]
  /** 外部取消信号（可选） */
  signal?: AbortSignal
}

export async function withRetry<T>(fn: () => Promise<T>, policy: RetryPolicy): Promise<T> {
  let attempt = 0
  for (;;) {
    try {
      return await fn()
    } catch (e) {
      if (attempt >= policy.waitsMs.length || !policy.retryOn(e)) throw e
      if (policy.signal?.aborted) throw e
      await new Promise((r) => setTimeout(r, policy.waitsMs[attempt]))
      attempt++
    }
  }
}

/** 暂时性错误判定：HTTP 429（限速）、5xx（上游过载）、网络中断（fetch/ureq 的网络层错误） */
export function isTransientAiError(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e)
  return /\b429\b/.test(msg) || /\b5\d\d\b/.test(msg) || /timeout|超时|network|网络|ECONN|aborted/i.test(msg)
}
