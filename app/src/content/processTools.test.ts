import { describe, expect, it } from 'vitest'
import { CATEGORY_META, CATEGORY_ORDER, PROCESS_TOOLS, getTool, toolRoute } from './processTools'

/** 工具注册表完整性：新工具必须先注册（名称/分类/引擎/状态齐全且无冲突） */
describe('processTools 注册表', () => {
  it('四分类齐全且按用户定义的顺序（文字→音频→图片→视频）', () => {
    expect(CATEGORY_ORDER).toEqual(['text', 'audio', 'image', 'video'])
    for (const cat of CATEGORY_ORDER) {
      expect(CATEGORY_META[cat].name).toBeTruthy()
      expect(PROCESS_TOOLS.some((t) => t.category === cat)).toBe(true)
    }
  })

  it('工具 id 唯一且路由一致', () => {
    const ids = PROCESS_TOOLS.map((t) => t.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const id of ids) {
      expect(toolRoute(id)).toBe(`/process/t/${id}`)
      expect(getTool(id)?.id).toBe(id)
    }
    expect(getTool('nonexistent')).toBeUndefined()
  })

  it('ready 工具必须是本地引擎；byok 占位必须说明点亮条件', () => {
    for (const t of PROCESS_TOOLS) {
      if (t.status === 'ready') {
        expect(t.engine.startsWith('local-')).toBe(true)
      } else {
        expect(t.engine).toBe('byok')
        expect(t.requires).toBeTruthy()
      }
    }
  })

  it('四模态各至少一个 ready 工具（避免空分类）', () => {
    for (const cat of CATEGORY_ORDER) {
      expect(PROCESS_TOOLS.some((t) => t.category === cat && t.status === 'ready')).toBe(true)
    }
  })
})
