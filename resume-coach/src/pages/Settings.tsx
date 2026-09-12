import { useState } from 'react'
import { llmConfigFrom, loadLlmSettings, saveLlmSettings, DEFAULT_GATEWAY_URL, type LlmSettings } from '../engine/llmConfig'
import { chatCompletion } from '../engine/llm'

/** AI 设置：本地网关（推荐，Key 只存本机 .env.local）或浏览器直连；测试按钮给出真实连通结果 */
export function Settings() {
  const [ai, setAi] = useState<LlmSettings>(loadLlmSettings())
  const [testing, setTesting] = useState(false)
  const [testOk, setTestOk] = useState(false)
  const [testMsg, setTestMsg] = useState('')

  const save = (patch: Partial<LlmSettings>) => {
    const next = { ...ai, ...patch }
    setAi(next)
    saveLlmSettings(next)
    setTestMsg('')
  }

  const testGateway = async () => {
    setTesting(true)
    setTestMsg('')
    try {
      const base = (ai.gatewayUrl || DEFAULT_GATEWAY_URL).replace(/\/+$/, '')
      const r = await fetch(`${base}/health`)
      const j = (await r.json()) as { ok?: boolean; chatConfigured?: boolean; upstream?: string }
      setTestOk(Boolean(j.ok && j.chatConfigured))
      setTestMsg(j.ok && j.chatConfigured ? `网关在线，Key 已配置（上游：${j.upstream ?? '未知'}）` : '网关在线，但 .env.local 还没配置 PWORK_LLM_API_KEY')
    } catch {
      setTestOk(false)
      setTestMsg('无法连接网关——先在 PWORK 的 app 目录运行 npm run gateway')
    } finally {
      setTesting(false)
    }
  }

  const testDirect = async () => {
    setTesting(true)
    setTestMsg('')
    try {
      const reply = await chatCompletion(llmConfigFrom(ai), '你只回复两个字：成功', '测试', { maxTokens: 20, timeoutMs: 20000 })
      setTestOk(reply.includes('成功') || reply.length > 0)
      setTestMsg(`连接成功，模型已回复：${reply.slice(0, 40)}`)
    } catch (e) {
      setTestOk(false)
      setTestMsg(`连接失败：${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setTesting(false)
    }
  }

  return (
    <main className="app-main" style={{ maxWidth: 720 }}>
      <div className="page-head">
        <h1>AI 设置</h1>
        <span className="sub">不配置也能用——每个 AI 按钮都有手动替代</span>
      </div>

      <div className="card">
        <h2>接入方式</h2>
        <div className="col">
          <div className="row">
            <div className="radio">
              <button type="button" className={ai.viaGateway ? 'on' : ''} onClick={() => save({ viaGateway: true, gatewayUrl: ai.gatewayUrl || DEFAULT_GATEWAY_URL })}>本地网关（推荐）</button>
              <button type="button" className={!ai.viaGateway ? 'on' : ''} onClick={() => save({ viaGateway: false })}>浏览器直连</button>
            </div>
          </div>
          <p className="hint">
            {ai.viaGateway
              ? 'Key 只存本机 .env.local，浏览器接触不到；需要网关在运行（PWORK 的 app 目录：npm run gateway）'
              : 'Key 明文存 localStorage，仅限本机个人使用'}
          </p>
          {ai.viaGateway ? (
            <div className="row">
              <label>网关地址</label>
              <input className="input" style={{ flex: 1, minWidth: 220 }} value={ai.gatewayUrl ?? DEFAULT_GATEWAY_URL} aria-label="网关地址" onChange={(e) => save({ gatewayUrl: e.target.value })} />
              <button type="button" className="btn" disabled={testing} onClick={() => void testGateway()}>{testing ? '检测中…' : '测试网关'}</button>
            </div>
          ) : (
            <>
              <div className="row">
                <label>Base URL</label>
                <input className="input" style={{ flex: 1 }} value={ai.baseURL} aria-label="Base URL" onChange={(e) => save({ baseURL: e.target.value })} />
              </div>
              <div className="row">
                <label>API Key</label>
                <input className="input" style={{ flex: 1 }} type="password" value={ai.apiKey} placeholder="只存 localStorage" aria-label="API Key" onChange={(e) => save({ apiKey: e.target.value })} />
              </div>
              <div className="row">
                <button type="button" className="btn" disabled={testing} onClick={() => void testDirect()}>{testing ? '测试中…' : '测试连接'}</button>
              </div>
            </>
          )}
          <div className="row">
            <label>模型</label>
            <input className="input" style={{ width: 240 }} value={ai.model} aria-label="模型" onChange={(e) => save({ model: e.target.value })} />
            <span className="hint">必须与 Key 的服务商匹配（如智谱填 glm-4.5-flash，DeepSeek 填 deepseek-chat）</span>
          </div>
          {testMsg && <p className={testOk ? 'ok-text' : 'err-text'}>{testMsg}</p>}
          <p className="hint">L2 外发明示：LLM 模式下，你主动点 AI 按钮的内容会发往上方配置的服务商；其余数据一律留在本机。</p>
        </div>
      </div>
    </main>
  )
}
