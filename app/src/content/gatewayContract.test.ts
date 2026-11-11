import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * 网关库接口跨层契约（2.6）：Rust 网关路由 ↔ MCP 薄壳调用 ↔ 设置页文案——
 * 三层引用的端点路径必须一致（/api/v1/library/notes 与 /api/v1/library/tasks）。
 * 任一层漂移，CI 即红。
 */

const REPO = join(__dirname, '..', '..', '..') // content → src → app → 仓库根

const GATEWAY_RS = join(REPO, 'app', 'src-tauri', 'src', 'gateway.rs')
const MCP_MJS = join(REPO, 'tools', 'pwork-mcp.mjs')
const SETTINGS_TSX = join(REPO, 'app', 'src', 'pages', 'Settings.tsx')

describe('网关库接口跨层契约（/api/v1/library/*）', () => {
  const read = (p: string) => readFileSync(p, 'utf8')

  it('Rust 网关挂载 v1 路由（notes 与 tasks）', () => {
    const rs = read(GATEWAY_RS)
    expect(rs).toContain('/api/v1/library/')
    expect(rs).toContain('"/api/v1/library/notes"')
    expect(rs).not.toContain('"/api/library/notes"') // 旧无版本路径不得回潮
  })

  it('MCP 薄壳调用 v1 端点', () => {
    const mjs = read(MCP_MJS)
    expect(mjs).toContain("'/api/v1/library/notes'")
    expect(mjs).toContain("'/api/v1/library/tasks'")
    expect(mjs).not.toContain("'/api/library/")
  })

  it('设置页文案与网关路径一致', () => {
    const tsx = read(SETTINGS_TSX)
    expect(tsx).toContain('/api/v1/library/notes')
    expect(tsx).toContain('/api/v1/library/tasks')
    expect(tsx).not.toContain('/api/library/notes')
  })
})
