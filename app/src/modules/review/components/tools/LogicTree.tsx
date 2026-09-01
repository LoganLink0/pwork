import { useState } from 'react'
import { newId } from '../../db/repo'
import { addChild, addSibling, countTreeNodes, removeNodeById, updateNodeText } from '../../engine/tree'
import { useDraft } from '../../store/draft'
import { emptySwot, type ToolTreeNode } from '../../types/models'
import { KnowledgeCapsule } from '../ui/KnowledgeCapsule'

function TreeItem({ node, depth, ops }: { node: ToolTreeNode; depth: number; ops: ReturnType<typeof useTreeOps> }) {
  return (
    <div className="tree-node" style={{ marginLeft: depth === 0 ? 0 : 'var(--sp-4)' }}>
      <div className="tree-row">
        {depth > 0 && <span className="tree-line" aria-hidden>└</span>}
        <input
          className="input"
          style={{ marginBottom: 0, flex: 1 }}
          value={node.text}
          aria-label={`逻辑树节点（第 ${depth + 1} 层）`}
          placeholder={depth === 0 ? '要分解的主题，如：降低成本' : '这一层怎么拆？'}
          onChange={(e) => ops.update(node.id, e.target.value)}
        />
        <button className="btn-small" aria-label={`在「${node.text}」下加子节点`} title="加子节点" onClick={() => ops.addChild(node.id)}>
          ＋子
        </button>
        <button className="btn-small" aria-label={`在「${node.text}」后加同级节点`} title="加同级" onClick={() => ops.addSibling(node.id)}>
          ＋同级
        </button>
        <button className="btn-small" aria-label={`删除节点「${node.text}」`} onClick={() => ops.remove(node.id)}>
          ✕
        </button>
      </div>
      {node.children.map((c) => (
        <TreeItem key={c.id} node={c} depth={depth + 1} ops={ops} />
      ))}
    </div>
  )
}

function useTreeOps(setTree: (fn: (list: ToolTreeNode[]) => ToolTreeNode[]) => void) {
  return {
    update: (id: string, text: string) => setTree((list) => updateNodeText(list, id, text)),
    addChild: (parentId: string) =>
      setTree((list) => addChild(list, parentId, { id: newId('tn'), text: '', children: [] })),
    addSibling: (siblingId: string) =>
      setTree((list) => addSibling(list, siblingId, { id: newId('tn'), text: '', children: [] })),
    remove: (id: string) => setTree((list) => removeNodeById(list, id)),
  }
}

/** 逻辑树编辑器（课程 06/09 讲）：MECE 逐层分解，树形缩进即可视化。 */
export function LogicTree() {
  const draft = useDraft((s) => s.draft)
  const updateClap = useDraft((s) => s.updateClap)
  const [seeded, setSeeded] = useState(false)
  // Hook 纪律（开发复盘 1.1）：置于 !draft 早退之前；setTree 为函数声明，提升后此处可安全引用
  const ops = useTreeOps(setTree)
  if (!draft) return null
  const tree = draft.clap.logic.tree ?? []

  function setTree(fn: (list: ToolTreeNode[]) => ToolTreeNode[]) {
    void updateClap((clap) => ({ ...clap, logic: { ...clap.logic, tree: fn(clap.logic.tree ?? []) } }))
  }

  function ensureRoot() {
    if (tree.length === 0 && !seeded) {
      setTree(() => [{ id: newId('tn'), text: '', children: [] }])
      setSeeded(true)
    }
  }

  return (
    <div className="detail-section" aria-label="逻辑树">
      <div className="field-label">
        <h3>逻辑树（MECE 分解）</h3>
        <KnowledgeCapsule id="mece" />
      </div>
      <p className="coach-say">
        把主题逐层拆解：相互独立、完全穷尽。已分解 {countTreeNodes(tree)} 个节点——过度拘泥 MECE 也会本末倒置，可活用"其他"。
      </p>
      {tree.length === 0 ? (
        <button className="btn-small" onClick={ensureRoot}>
          ＋ 开始分解
        </button>
      ) : (
        <>
          {tree.map((n) => (
            <TreeItem key={n.id} node={n} depth={0} ops={ops} />
          ))}
          <p className="coach-say">分解到"能行动"的颗粒度就停——每片叶子都应该指向一条原因或一个动作。</p>
        </>
      )}
    </div>
  )
}

// 引用避免未使用告警（emptySwot 由 SwotGrid 使用）
void emptySwot
