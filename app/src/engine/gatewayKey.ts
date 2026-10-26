import { isDesktopApp } from './platform'
import { PROVIDER_PRESETS, probeGateway, testGatewayChat, type CoachProvider } from '../modules/review/engine/coach'

/**
 * 网关 Key 直配（2026-10-26）：引导页与 设置 → AI 共用的「选厂商 → 填 Key → 保存即测试」。
 * 桌面版经 Tauri invoke 写 gateway.env 并热更新；浏览器版经网关 POST /key 写 .env.local 并热更新。
 * 保存后立即经网关发一条真实对话验证 Key——通/不通都返回明确消息（用户要求，不允许静默）。
 */
export interface GatewayKeyResult {
  ok: boolean
  message: string
  /** 成功时带回所选厂商的接入参数，调用方据此更新自己的配置存储 */
  vendor?: CoachProvider
  baseURL?: string
  model?: string
}

export async function saveGatewayKeyAndTest(vendor: CoachProvider, key: string, gatewayUrl: string): Promise<GatewayKeyResult> {
  const preset = PROVIDER_PRESETS[vendor]
  if (!preset) return { ok: false, message: '未知厂商' }
  const k = key.trim()
  if (!k) return { ok: false, message: '先粘贴 API Key——点所选厂商的「拿 Key」按钮去官网创建' }
  const base = gatewayUrl.replace(/\/+$/, '')
  try {
    if (isDesktopApp()) {
      const { invoke } = await import('@tauri-apps/api/core')
      await invoke('save_gateway_key', { key: k, baseUrl: preset.baseURL, model: preset.model })
    } else {
      const probe = await probeGateway(base)
      if (!probe.online) {
        return { ok: false, message: '本地网关没在运行：在源码 app 目录运行 npm run gateway 后重试；没有 Node 环境就改用「浏览器直连」接入方式' }
      }
      const r = await fetch(`${base}/key`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ key: k, baseUrl: preset.baseURL, model: preset.model }),
      })
      if (!r.ok) {
        const j = (await r.json().catch(() => null)) as { error?: string } | null
        return { ok: false, message: `保存失败：${j?.error ?? `HTTP ${r.status}`}` }
      }
    }
  } catch (e) {
    return { ok: false, message: `保存失败：${e instanceof Error ? e.message : String(e)}` }
  }
  const t = await testGatewayChat(base, preset.model)
  if (!t.ok) {
    return { ok: false, message: `Key 已保存，但连接测试没通过：${t.error}。常见原因：Key 抄错、账户没有余额；换一个 Key 重试即可。` }
  }
  return { ok: true, message: `连接成功：${preset.name} 已配置好，立即生效。`, vendor, baseURL: preset.baseURL, model: preset.model }
}
