import { useEffect, useState } from 'react'
import { CLD } from '../../content/copy'
import { CLD_TEMPLATES } from '../../content/cld-templates'
import { newId } from '../../db/repo'
import { cyclePathLabel, detectLoops, rootCandidates } from '../../engine/cld'
import { useDraft } from '../../store/draft'
import { emptyCld, type CldEdge, type CldGraph, type CldPolarity } from '../../types/models'
import { Icon } from '../../../../components/shell/icons'
import { KnowledgeCapsule } from '../ui/KnowledgeCapsule'
import { CldCanvas } from './CldCanvas'

const EMPTY_EDGES: CldEdge[] = []

/**
 * 因果循环图建模器 v1（表单驱动）：列节点 → 连关系 → 回路检测与命名 → 根因标记 → 生成洞察卡/行动卡。
 * 数据存于 clap.logic.cld；SVG 渲染交给 CldCanvas。
 */
export function CldBuilder() {
  const draft = useDraft((s) => s.draft)
  const updateClap = useDraft((s) => s.updateClap)
  const [nodeText, setNodeText] = useState('')
  const [edgeFrom, setEdgeFrom] = useState('')
  const [edgeTo, setEdgeTo] = useState('')
  const [polarity, setPolarity] = useState<CldPolarity>('enhance')
  const [pendingCycle, setPendingCycle] = useState<string[] | null>(null)
  const [pendingLabel, setPendingLabel] = useState('')
  const [msg, setMsg] = useState('')

  const cld: CldGraph = draft ? draft.clap.logic.cld ?? emptyCld() : emptyCld()

  // 回路检测：新增连线成环且尚未命名时，弹出命名邀请
  // （hooks 必须在早退 return 之前——上一版因此白屏）
  useEffect(() => {
    const cycles = detectLoops(cld.nodes, cld.edges)
    const savedKeys = new Set(cld.loops.map((l) => [...l.nodeIds].sort().join('|')))
    const fresh = cycles.find((c) => !savedKeys.has([...c].sort().join('|')))
    if (fresh && !pendingCycle) {
      setPendingCycle(fresh)
      setPendingLabel('')
      setMsg('')
    }
    if (!fresh && pendingCycle) {
      setPendingCycle(null)
    }
    // 刻意只依赖 edges 序列：节点增删不影响已检测的环
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cld.edges === EMPTY_EDGES ? EMPTY_EDGES : cld.edges])

  if (!draft) return null

  const labelOf = (id: string) => cld.nodes.find((n) => n.id === id)?.label ?? id
  const candidates = rootCandidates(cld.nodes, cld.edges)
  const topCandidateId = candidates[0]?.nodeId

  function mutateCld(fn: (g: CldGraph) => CldGraph) {
    return updateClap((clap) => ({
      ...clap,
      logic: { ...clap.logic, cld: fn(clap.logic.cld ?? emptyCld()) },
    }))
  }

  /* ----- v2 白板：拖拽持久化 / 整理布局 / 模板库 ----- */
  const onMoveNodeEnabled =
    typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(pointer: fine)').matches
  const hasCustomPos = cld.nodes.some((n) => typeof n.x === 'number' && typeof n.y === 'number')

  function moveNode(nodeId: string, x: number, y: number) {
    void mutateCld((g) => ({
      ...g,
      nodes: g.nodes.map((n) => (n.id === nodeId ? { ...n, x, y } : n)),
    }))
  }

  function relayout() {
    void mutateCld((g) => ({ ...g, nodes: g.nodes.map(({ x: _x, y: _y, ...rest }) => rest) }))
  }

  function loadTemplate(templateId: string) {
    const tpl = CLD_TEMPLATES.find((t) => t.id === templateId)
    if (!tpl) return
    if (cld.nodes.length > 0 && !window.confirm(CLD.templateConfirm)) return
    const copy = JSON.parse(JSON.stringify(tpl.graph)) as CldGraph
    void mutateCld(() => copy)
    setMsg(CLD.loadTemplate(tpl.name))
  }

  function addNode() {
    if (!nodeText.trim()) return
    void mutateCld((g) => ({ ...g, nodes: [...g.nodes, { id: newId('n'), label: nodeText.trim() }] }))
    setNodeText('')
    setMsg('')
  }

  function addEdge() {
    if (!edgeFrom || !edgeTo || edgeFrom === edgeTo) return
    const dup = cld.edges.some((e) => e.from === edgeFrom && e.to === edgeTo && e.polarity === polarity)
    if (dup) return
    const edge: CldEdge = { id: newId('e'), from: edgeFrom, to: edgeTo, polarity }
    void mutateCld((g) => ({ ...g, edges: [...g.edges, edge] }))
    setEdgeTo('')
    setMsg('')
  }

  function toggleRoot(nodeId: string) {
    void mutateCld((g) => ({
      ...g,
      nodes: g.nodes.map((n) => (n.id === nodeId ? { ...n, rootCause: !n.rootCause } : n)),
    }))
  }

  function removeNode(nodeId: string) {
    void mutateCld((g) => ({
      nodes: g.nodes.filter((n) => n.id !== nodeId),
      edges: g.edges.filter((e) => e.from !== nodeId && e.to !== nodeId),
      loops: g.loops.filter((l) => !l.nodeIds.includes(nodeId)),
    }))
  }

  function removeEdge(edgeId: string) {
    void mutateCld((g) => ({ ...g, edges: g.edges.filter((e) => e.id !== edgeId) }))
  }

  function saveLoop() {
    if (!pendingCycle) return
    void mutateCld((g) => ({
      ...g,
      loops: [
        ...g.loops,
        {
          id: newId('loop'),
          nodeIds: pendingCycle,
          kind: pendingLabel.trim().includes('恶') ? ('vicious' as const) : ('reinforcing' as const),
          label: pendingLabel.trim() || '未命名回路',
        },
      ],
    }))
    setPendingCycle(null)
    setPendingLabel('')
    setMsg(CLD.generated)
  }

  function toInsight(nodeId: string) {
    const node = cld.nodes.find((n) => n.id === nodeId)
    if (!node) return
    const text = `「${node.label}」是当前问题的关键节点（来自因果循环图的根因判定）`
    const insights = draft!.clap.acknowledge.insights
    if (insights.some((i) => i.text === text)) {
      setMsg(CLD.duplicate)
      return
    }
    void updateClap((clap) => ({
      ...clap,
      acknowledge: {
        ...clap.acknowledge,
        insights: [...clap.acknowledge.insights, { text, kind: 'inductive', verified: false, confidence: 1 }],
      },
    }))
    setMsg(CLD.generated)
  }

  function toAction(nodeId: string) {
    const node = cld.nodes.find((n) => n.id === nodeId)
    if (!node) return
    void updateClap((clap) => ({
      ...clap,
      project: {
        ...clap.project,
        actions: [
          ...clap.project.actions,
          { kind: 'start', text: `围绕「${node.label}」制定下一步发力计划`, ifThen: '', confidence: 1 },
        ],
      },
    }))
    setMsg(CLD.generated)
  }

  return (
    <section className="detail-section" aria-label={CLD.title}>
      <h2>
        {CLD.title} <KnowledgeCapsule id="cld" />
      </h2>
      <p className="coach-say">{CLD.hint}</p>

      {/* 模板库（先僵化） */}
      <div className="seg" role="group" aria-label={CLD.templateTitle}>
        {CLD_TEMPLATES.map((t) => (
          <button key={t.id} type="button" className="seg-item" title={t.desc} onClick={() => loadTemplate(t.id)}>
            <Icon name="box" size={12} /> {t.name}
          </button>
        ))}
      </div>

      {/* 第一步：节点 */}
      <div className="list-row">
        <input
          className="input"
          value={nodeText}
          onChange={(e) => setNodeText(e.target.value)}
          placeholder={CLD.nodePlaceholder}
          aria-label={CLD.nodePlaceholder}
          onKeyDown={(e) => {
            if (e.key === 'Enter') addNode()
          }}
        />
        <button className="btn-ghost" style={{ flex: '0 0 auto' }} onClick={addNode}>
          {CLD.addNode}
        </button>
      </div>

      {cld.nodes.length > 0 && (
        <ul className="review-list" style={{ marginBottom: 'var(--sp-3)' }}>
          {cld.nodes.map((n) => (
            <li key={n.id} className="review-row" style={{ alignItems: 'center' }}>
              <div>
                <strong>{n.label}</strong>
                {n.rootCause && <span className="cld-root-badge">{CLD.rootBadge}</span>}
                {topCandidateId === n.id && !n.rootCause && (
                  <span className="coach-say"> · 更像"因"（出口多）</span>
                )}
              </div>
              <div className="action-ops">
                <button className="btn-small" onClick={() => toggleRoot(n.id)}>
                  {n.rootCause ? CLD.unmarkRoot : CLD.markRoot}
                </button>
                <button className="btn-small" onClick={() => toInsight(n.id)}>
                  {CLD.toInsight}
                </button>
                <button className="btn-small" onClick={() => toAction(n.id)}>
                  {CLD.toAction}
                </button>
                <button className="btn-small" onClick={() => removeNode(n.id)}>
                  ✕
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {cld.nodes.length === 0 && <p className="coach-say">{CLD.empty}</p>}

      {/* 第二步：关系 */}
      {cld.nodes.length >= 2 && (
        <>
          <div className="field-label">
            <span>
              连一条关系（{CLD.polarityLabel}：<KnowledgeCapsule id="cld" />）
            </span>
          </div>
          <div className="list-row" style={{ flexWrap: 'wrap' }}>
            <select className="input" style={{ flex: '1 1 140px' }} value={edgeFrom} aria-label={CLD.edgeFrom} onChange={(e) => setEdgeFrom(e.target.value)}>
              <option value="">{CLD.edgeFrom}…</option>
              {cld.nodes.map((n) => (
                <option key={n.id} value={n.id}>
                  {n.label}
                </option>
              ))}
            </select>
            <select
              className="input"
              style={{ flex: '0 0 auto', width: 130 }}
              value={polarity}
              aria-label={CLD.polarityLabel}
              onChange={(e) => setPolarity(e.target.value as CldPolarity)}
            >
              {(Object.keys(CLD.polarity) as CldPolarity[]).map((p) => (
                <option key={p} value={p}>
                  {CLD.polarity[p]}
                </option>
              ))}
            </select>
            <select className="input" style={{ flex: '1 1 140px' }} value={edgeTo} aria-label={CLD.edgeTo} onChange={(e) => setEdgeTo(e.target.value)}>
              <option value="">{CLD.edgeTo}…</option>
              {cld.nodes.map((n) => (
                <option key={n.id} value={n.id}>
                  {n.label}
                </option>
              ))}
            </select>
            <button className="btn-primary" style={{ flex: '0 0 auto' }} onClick={addEdge}>
              {CLD.addEdge}
            </button>
          </div>

          {cld.edges.length > 0 && (
            <ul className="review-list" style={{ marginBottom: 'var(--sp-3)' }}>
              {cld.edges.map((e) => (
                <li key={e.id} className="review-row" style={{ padding: 'var(--sp-2) var(--sp-3)' }}>
                  <span className="cld-edge-text">
                    {labelOf(e.from)} <strong className="cld-polarity">{e.polarity === 'enhance' ? '→ +' : e.polarity === 'inhibit' ? '→ −' : '→ ⏱'}</strong> {labelOf(e.to)}
                  </span>
                  <button className="btn-small" onClick={() => removeEdge(e.id)}>
                    ✕
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      {/* 回路命名邀请 */}
      {pendingCycle && (
        <div className="hint-warn" role="status" style={{ display: 'block' }}>
          <p style={{ margin: '0 0 var(--sp-2)' }}>{CLD.loopFound(cyclePathLabel(pendingCycle, labelOf))}</p>
          <input
            className="input"
            value={pendingLabel}
            placeholder={CLD.loopNamePlaceholder}
            aria-label={CLD.loopNamePlaceholder}
            onChange={(e) => setPendingLabel(e.target.value)}
          />
          <div className="seg" style={{ marginBottom: 'var(--sp-2)' }}>
            <button
              type="button"
              className={`seg-item ${pendingLabel.includes('恶') ? '' : 'seg-item--on'}`}
              onClick={() => setPendingLabel('增长飞轮')}
            >
              {CLD.loopKindFlywheel}
            </button>
            <button
              type="button"
              className={`seg-item ${pendingLabel.includes('恶') ? 'seg-item--on' : ''}`}
              onClick={() => setPendingLabel('恶性循环')}
            >
              {CLD.loopKindVicious}
            </button>
          </div>
          <div style={{ display: 'flex', gap: 'var(--sp-2)' }}>
            <button className="btn-small" onClick={saveLoop}>
              {CLD.saveLoop}
            </button>
            <button className="btn-small" onClick={() => setPendingCycle(null)}>
              {CLD.ignore}
            </button>
          </div>
        </div>
      )}

      {/* 已识别的回路 + 管理器（改名/切换/删除/双循环对照） */}
      {cld.loops.length > 0 && (
        <div className="detail-section" style={{ borderTop: 'none', paddingTop: 0 }} aria-label={CLD.loopsManageTitle}>
          {cld.loops.length >= 2 && <p className="hint-warn">{CLD.compareLine}</p>}
          {cld.loops.map((loop) => (
            <div key={loop.id} className="review-row" style={{ flexWrap: 'wrap' }}>
              <div style={{ flex: '1 1 260px' }}>
                <input
                  className="input"
                  style={{ marginBottom: 'var(--sp-1)' }}
                  value={loop.label}
                  aria-label={`${CLD.loopNameLabel}：${loop.label}`}
                  onChange={(e) =>
                    void mutateCld((g) => ({
                      ...g,
                      loops: g.loops.map((l) => (l.id === loop.id ? { ...l, label: e.target.value } : l)),
                    }))
                  }
                />
                <span className="coach-say">{cyclePathLabel(loop.nodeIds, labelOf)}</span>
              </div>
              <div className="action-ops">
                <button
                  className="btn-small"
                  title={CLD.toggleKind}
                  onClick={() =>
                    void mutateCld((g) => ({
                      ...g,
                      loops: g.loops.map((l) =>
                        l.id === loop.id ? { ...l, kind: l.kind === 'reinforcing' ? ('vicious' as const) : ('reinforcing' as const) } : l,
                      ),
                    }))
                  }
                >
                  {CLD.loopLabel(loop.kind)}
                </button>
                <button
                  className="btn-small"
                  onClick={() => void mutateCld((g) => ({ ...g, loops: g.loops.filter((l) => l.id !== loop.id) }))}
                >
                  ✕
                </button>
              </div>
            </div>
          ))}
          {cld.loops.length >= 2 && (
            <>
              <div className="loop-compare" aria-label="双循环对照">
                {cld.loops.map((loop) => (
                  <div key={loop.id} className={`loop-compare-card ${loop.kind === 'reinforcing' ? 'loop-fly' : 'loop-vicious'}`}>
                    <div className="loop-compare-head">
                      <span aria-hidden style={{ display: 'inline-flex', verticalAlign: '-2px', marginRight: 4, color: loop.kind === 'reinforcing' ? 'var(--cat-good)' : 'var(--cat-action)' }}>
                        <Icon name="dot" size={10} />
                      </span>{' '}
                      <strong>{loop.label}</strong>
                      <span className="coach-say">{loop.kind === 'reinforcing' ? '增强回路' : '制衡/恶性'}</span>
                    </div>
                    <ol className="loop-compare-path">
                      {loop.nodeIds.map((id, i) => (
                        <li key={`${loop.id}-${id}-${i}`}>{labelOf(id)}</li>
                      ))}
                    </ol>
                  </div>
                ))}
              </div>
              <p className="coach-say">{CLD.compareLine}</p>
              <p className="coach-say">
                {CLD.rootCauseSummary(
                  cld.nodes
                    .filter((n) => n.rootCause)
                    .map((n) => n.label)
                    .join('、') || '（尚未标记——标记后这里会汇总）',
                )}
              </p>
            </>
          )}
        </div>
      )}

      {/* 第三步：图（v2 白板：PC 拖拽 + 整理布局） */}
      {(cld.nodes.length > 0 || cld.edges.length > 0) && (
        <>
          {onMoveNodeEnabled && (
            <p className="coach-say" style={{ marginBottom: 0 }}>
              {CLD.dragHint}{' '}
              {hasCustomPos && (
                <button className="btn-small" onClick={relayout}>
                  {CLD.relayout}
                </button>
              )}
            </p>
          )}
          <CldCanvas graph={cld} onMoveNode={onMoveNodeEnabled ? moveNode : undefined} />
        </>
      )}

      <p className="coach-say">
        {CLD.rootHint} 生成按钮产出的两种卡片：洞察卡
        <KnowledgeCapsule id="insight-card" /> 进资产库，行动卡
        <KnowledgeCapsule id="action-card" /> 进仪表盘待办。
      </p>
      {msg && (
        <p className="coach-say" role="status">
          {msg}
        </p>
      )}
    </section>
  )
}
