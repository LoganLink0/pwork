import { describe, expect, it } from 'vitest'
import { parseTodoMarkdown, toTodoTaskInputs, todoFingerprint, type ScannedTodo } from './todoScan'

const FIXTURE = `# TODO.md · 当前任务

## 待用户拍板

- [ ] **仓库是否开源**——影响签名与指南
- [x] 已完成的事不该进来
- [ ]token 用量按场景归集

## 观察项（低频）

* [ ] 公共转接偶发超时

已完成：
- [x] 视觉品质升级
`

describe('项目待办扫描', () => {
  it('解析：只取未勾选行，小节随最近的 ## 标题，[x] 与非任务行忽略', () => {
    const items = parseTodoMarkdown(FIXTURE)
    expect(items).toHaveLength(3)
    expect(items[0]).toEqual({ section: '待用户拍板', text: '**仓库是否开源**——影响签名与指南' })
    expect(items[1]).toEqual({ section: '待用户拍板', text: 'token 用量按场景归集' }) // "- [ ]" 后无空格也认
    expect(items[2]).toEqual({ section: '观察项（低频）', text: '公共转接偶发超时' }) // * 列表符也认
  })

  it('映射：标题带项目名与小节，落三类车道，origin 指纹可溯源', () => {
    const scanned: ScannedTodo[] = [
      { project: 'POOLS', section: '待拍板', text: '上线灰度方案' },
      { project: 'RESUME', section: '', text: '补交付模板' },
    ]
    const inputs = toTodoTaskInputs(scanned, new Set())
    expect(inputs[0]).toEqual({
      title: '[POOLS]「待拍板」上线灰度方案',
      lane: 3,
      origin: { kind: 'todo-file', refId: todoFingerprint('POOLS', '上线灰度方案') },
    })
    expect(inputs[1]!.title).toBe('[RESUME] 补交付模板')
  })

  it('幂等：库中已有指纹跳过；同轮重复行只进一次', () => {
    const existing = new Set([todoFingerprint('POOLS', '已有项')])
    const scanned: ScannedTodo[] = [
      { project: 'POOLS', section: '', text: '已有项' },
      { project: 'POOLS', section: '', text: '已有项' }, // 同轮重复
      { project: 'POOLS', section: '', text: '新项' },
    ]
    const inputs = toTodoTaskInputs(scanned, existing)
    expect(inputs).toHaveLength(1)
    expect(inputs[0]!.origin.refId).toBe(todoFingerprint('POOLS', '新项'))
  })

  it('空/无任务文件 → 空数组不报错', () => {
    expect(parseTodoMarkdown('')).toEqual([])
    expect(parseTodoMarkdown('# 只有标题\n普通段落\n- [x] 全是完成的')).toEqual([])
  })
})
