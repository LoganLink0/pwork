import { describe, expect, it } from 'vitest'
import {
  addChild,
  addSibling,
  countTreeNodes,
  findNode,
  newNode,
  removeNodeById,
  updateNodeText,
  type TreeNode,
} from './tree'

function sample(): TreeNode[] {
  return [
    {
      id: 'root',
      text: '降低成本',
      children: [
        { id: 'a', text: '固定成本', children: [{ id: 'a1', text: '场租', children: [] }] },
        { id: 'b', text: '可变成本', children: [] },
      ],
    },
  ]
}

describe('逻辑树纯函数', () => {
  it('计数：含所有层级', () => {
    expect(countTreeNodes(sample())).toBe(4)
  })

  it('查找：深层节点也能找到', () => {
    expect(findNode(sample(), 'a1')?.text).toBe('场租')
    expect(findNode(sample(), 'nope')).toBeNull()
  })

  it('更新文本：不可变（原树不变）', () => {
    const before = sample()
    const after = updateNodeText(before, 'a1', '厂房租金')
    expect(findNode(after, 'a1')?.text).toBe('厂房租金')
    expect(findNode(before, 'a1')?.text).toBe('场租')
  })

  it('添加子节点到指定父节点', () => {
    const after = addChild(sample(), 'b', newNode('b1', '原材料'))
    expect(findNode(after, 'b')?.children.map((c) => c.id)).toEqual(['b1'])
    expect(countTreeNodes(after)).toBe(5)
  })

  it('删除节点：连同其子树一起移除，兄弟不受影响', () => {
    const after = removeNodeById(sample(), 'a')
    expect(findNode(after, 'a')).toBeNull()
    expect(findNode(after, 'a1')).toBeNull()
    expect(findNode(after, 'b')).not.toBeNull()
    expect(countTreeNodes(after)).toBe(2)
  })

  it('addSibling：插到同级之后（顶层与深层）', () => {
    const after1 = addSibling(sample(), 'root', newNode('root2', '提高收入'))
    expect(after1.map((n) => n.id)).toEqual(['root', 'root2'])

    const after2 = addSibling(sample(), 'a', newNode('a2', '折旧'))
    expect(after1.every((n) => n.id !== 'a2')).toBe(true)
    const fixed = after2.find((n) => n.id === 'root')
    expect(fixed?.children.map((c) => c.id)).toEqual(['a', 'a2', 'b'])
  })
})
