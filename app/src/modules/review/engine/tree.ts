/**
 * 逻辑树纯函数（课程 06/09 讲：基于 MECE 把主题逐层分解）。
 * 全部不可变操作，返回新数组。
 */
export interface TreeNode {
  id: string
  text: string
  children: TreeNode[]
}

export function newNode(id: string, text: string): TreeNode {
  return { id, text, children: [] }
}

export function countTreeNodes(nodes: TreeNode[]): number {
  return nodes.reduce((sum, n) => sum + 1 + countTreeNodes(n.children), 0)
}

export function findNode(nodes: TreeNode[], id: string): TreeNode | null {
  for (const n of nodes) {
    if (n.id === id) return n
    const hit = findNode(n.children, id)
    if (hit) return hit
  }
  return null
}

function mapTree(nodes: TreeNode[], fn: (n: TreeNode) => TreeNode): TreeNode[] {
  return nodes.map((n) => ({ ...fn(n), children: mapTree(n.children, fn) }))
}

export function updateNodeText(nodes: TreeNode[], id: string, text: string): TreeNode[] {
  return mapTree(nodes, (n) => (n.id === id ? { ...n, text } : n))
}

export function addChild(nodes: TreeNode[], parentId: string, child: TreeNode): TreeNode[] {
  const walk = (list: TreeNode[]): TreeNode[] =>
    list.map((n) =>
      n.id === parentId
        ? { ...n, children: [...n.children, child] }
        : { ...n, children: walk(n.children) },
    )
  return walk(nodes)
}

/** 在 siblingId 之后插入同级节点（任意深度） */
export function addSibling(nodes: TreeNode[], siblingId: string, node: TreeNode): TreeNode[] {
  const walk = (list: TreeNode[]): TreeNode[] => {
    const out: TreeNode[] = []
    for (const n of list) {
      out.push({ ...n, children: walk(n.children) })
      if (n.id === siblingId) out.push({ ...node })
    }
    return out
  }
  return walk(nodes)
}

export function removeNodeById(nodes: TreeNode[], id: string): TreeNode[] {
  return nodes
    .filter((n) => n.id !== id)
    .map((n) => ({ ...n, children: removeNodeById(n.children, id) }))
}
