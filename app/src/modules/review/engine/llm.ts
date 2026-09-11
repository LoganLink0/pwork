/**
 * OpenAI 兼容 Chat Completions 客户端（最小实现）。
 * 20s 超时；错误统一抛 Error，由调用方回落规则引擎。
 */
export interface LlmConfig {
  baseURL: string
  apiKey: string
  model: string
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export async function chatCompletion(
  cfg: LlmConfig,
  system: string,
  user: string,
  opts: { temperature?: number; maxTokens?: number; timeoutMs?: number } = {},
): Promise<string> {
  const { temperature = 0.6, maxTokens = 300, timeoutMs = 20000 } = opts
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const res = await fetch(`${cfg.baseURL.replace(/\/+$/, '')}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${cfg.apiKey}`,
      },
      body: JSON.stringify({
        model: cfg.model,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        temperature,
        max_tokens: maxTokens,
        stream: false,
      }),
      signal: ctrl.signal,
    })
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      throw new Error(`HTTP ${res.status}${body ? `：${body.slice(0, 120)}` : ''}`)
    }
    const data = (await res.json()) as {
      choices?: { message?: { content?: string; reasoning_content?: string } }[]
    }
    const msg = data.choices?.[0]?.message
    const text = msg?.content?.trim() ? msg.content : (msg?.reasoning_content ?? '')
    if (typeof text !== 'string' || text.trim() === '') throw new Error('响应为空')
    return text
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') throw new Error('请求超时')
    // 本地网关模式：浏览器侧是 sentinel Key，网络层失败基本就是网关进程没启动
    if (err instanceof TypeError && cfg.apiKey === 'pwork-gateway') {
      throw new Error('本地网关没连上——在 app 目录运行 npm run gateway 启动后重试（或到 设置 → AI · BYOK 改为直连并填 Key）')
    }
    throw err instanceof Error ? err : new Error(String(err))
  } finally {
    clearTimeout(timer)
  }
}
