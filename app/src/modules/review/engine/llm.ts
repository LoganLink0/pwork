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
  opts: { temperature?: number; maxTokens?: number; timeoutMs?: number; purpose?: string } = {},
): Promise<string> {
  const { temperature = 0.6, maxTokens = 300, timeoutMs = 20000, purpose } = opts
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    // 场景标记只在网关模式随请求发送（网关剥离后记账，不转发上游）；直连上游不发，避免严格实现拒收未知字段
    const extra = purpose && cfg.apiKey === 'pwork-gateway' ? { purpose } : {}
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
        ...extra,
      }),
      signal: ctrl.signal,
    })
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      throw new Error(`HTTP ${res.status}${body ? `：${body.slice(0, 120)}` : ''}`)
    }
    const data = (await res.json()) as {
      choices?: { message?: { content?: string }; finish_reason?: string }[]
    }
    const choice = data.choices?.[0]
    const text = choice?.message?.content
    // 截断必须如实报错：被腰斩的 JSON/文本喂给调用方只会变成"AI 没有返回 JSON"这种
    // 误导性症状（2026-10-21 用户踩中）；思考型模型的思考也占 max_tokens 预算
    if (choice?.finish_reason === 'length') {
      throw new Error('AI 输出被输出上限截断（思考型模型的思考也占预算）——内容不完整已放弃，请重试')
    }
    if (typeof text !== 'string' || text.trim() === '') {
      throw new Error('AI 响应为空（思考耗尽了输出预算？）——请重试，仍失败则减少一次要生成的内容量')
    }
    return text
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      // 超时≠失败：请求可能已在服务端完成并计费——提示稍候重试，避免立即重发造成双倍消耗
      throw new Error('请求超时——该次调用可能仍在处理并计费，稍候再重试可避免重复消耗；频繁超时建议换更快的模型')
    }
    // 本地网关模式：浏览器侧是 sentinel Key，网络层失败基本就是网关进程没启动
    if (err instanceof TypeError && cfg.apiKey === 'pwork-gateway') {
      throw new Error('本地网关没连上——在 app 目录运行 npm run gateway 启动后重试（或到 设置 → AI · BYOK 改为直连并填 Key）')
    }
    throw err instanceof Error ? err : new Error(String(err))
  } finally {
    clearTimeout(timer)
  }
}
