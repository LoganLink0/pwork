import { WIZARD } from '../../content/copy'
import { getPack } from '../../content/scenario-packs'
import { Icon } from '../../../../components/shell/icons'
import { useDraft } from '../../store/draft'
import type { ActionDraft, ActionKind } from '../../types/models'
import { KnowledgeCapsule } from '../ui/KnowledgeCapsule'
import { DebiasField, stickyStraight } from '../ui/DebiasField'
import { ConfidenceMeter } from '../ui/ConfidenceMeter'

const emptyAction = (): ActionDraft => ({ kind: 'start', text: '', confidence: 1 })

const KIND_LABEL: Record<ActionKind, { text: string; icon: string; color: string }> = {
  stop: { text: '停下', icon: 'stop', color: 'var(--cat-action)' },
  continue: { text: '继续', icon: 'done', color: 'var(--cat-good)' },
  start: { text: '开始', icon: 'play', color: 'var(--accent-text)' },
}

/** 第四步 · 规划（CLAP·P）：Stop/Continue/Start 行动卡 + 执行意图 if-then。 */
export function StepProject({ quick }: { quick: boolean }) {
  const draft = useDraft((s) => s.draft)
  const updateClap = useDraft((s) => s.updateClap)
  const pack = draft ? getPack(draft.scenario) : undefined
  if (!draft) return null
  function setActions(fn: (list: ActionDraft[]) => ActionDraft[]) {
    void updateClap((clap) => ({ ...clap, project: { ...clap.project, actions: fn(clap.project.actions) } }))
  }

  function updateAction(i: number, patch: Partial<ActionDraft>) {
    setActions((list) => {
      const copy = [...list]
      while (copy.length <= i) copy.push(emptyAction())
      copy[i] = { ...copy[i], ...patch }
      return copy
    })
  }

  const stored = draft.clap.project.actions.map((a, i) => ({ a, i }))
  // 快答模式：显示一行"虚拟行"，输入即刻落库
  const rows = quick && stored.length === 0 ? [{ a: emptyAction(), i: 0 }] : stored

  return (
    <div>
      <h2>
        {WIZARD.sectionP} <KnowledgeCapsule id="action-card" />
      </h2>
      <p className="coach-say">{pack?.pPrompt ?? '错误的事停下，正确的事继续，有利的事开始——每一张行动卡都要装上扳机。'}</p>

      {rows.map(({ a, i }) => (
        <div className="cause-card sticky sticky--action note" key={i} style={stickyStraight}>
          <div className="seg" role="radiogroup" aria-label="行动类型">
            {(Object.keys(KIND_LABEL) as ActionKind[]).map((k) => (
              <button
                key={k}
                type="button"
                role="radio"
                aria-checked={a.kind === k}
                className={`seg-item ${a.kind === k ? 'seg-item--on' : ''}`}
                onClick={() => updateAction(i, { kind: k })}
              >
                <span aria-hidden style={{ display: 'inline-flex', verticalAlign: '-2px', marginRight: 4, color: KIND_LABEL[k].color }}>
                  <Icon name={KIND_LABEL[k].icon} size={12} />
                </span>
                {KIND_LABEL[k].text}
              </button>
            ))}
          </div>
          <DebiasField
            value={a.text}
            onChange={(v) => updateAction(i, { text: v })}
            placeholder={WIZARD.actionPlaceholder}
            ariaLabel={WIZARD.actionPlaceholder}
          />
          <div className="field-label">
            <span>{WIZARD.ifThenLabel}</span>
            <KnowledgeCapsule id="implementation-intentions" />
          </div>
          <input
            className="input"
            value={a.ifThen ?? ''}
            placeholder={WIZARD.ifThenPlaceholder}
            aria-label={WIZARD.ifThenLabel}
            onChange={(e) => updateAction(i, { ifThen: e.target.value })}
          />
          {!quick && (
            <div className="list-row">
              <input
                className="input"
                value={a.owner ?? ''}
                placeholder={WIZARD.ownerPlaceholder}
                aria-label={WIZARD.ownerLabel}
                onChange={(e) => updateAction(i, { owner: e.target.value })}
              />
              <input
                className="input"
                type="date"
                value={a.due ?? ''}
                aria-label={WIZARD.dueLabel}
                onChange={(e) => updateAction(i, { due: e.target.value })}
              />
            </div>
          )}
          {!quick && (
            <ConfidenceMeter
              value={a.confidence}
              onChange={(v) => updateAction(i, { confidence: v })}
              ariaLabel="对这件行动的信心"
            />
          )}
          {!quick && (
            <button className="btn-small" onClick={() => setActions((l) => l.filter((_, j) => j !== i))}>
              {WIZARD.remove}
            </button>
          )}
        </div>
      ))}
      {!quick && (
        <button
          className="btn-small"
          onClick={() => setActions((l) => [...l, emptyAction()])}
        >
          {WIZARD.addAction}
        </button>
      )}
    </div>
  )
}
