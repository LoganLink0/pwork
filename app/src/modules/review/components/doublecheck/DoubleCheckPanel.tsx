import { useMemo, useState } from 'react'
import { DC_COPY, DC_DIMENSIONS } from '../../content/doublecheck'
import { CONFIDENCE_LABEL } from '../../content/copy'
import { clapAudit } from '../../engine/doublecheck'
import { saveReview } from '../../db/repo'
import type { DoubleCheckState, ReviewRecord } from '../../types/models'
import { ConfidenceMeter } from '../ui/ConfidenceMeter'

const emptyDC = (): DoubleCheckState => ({
  preparation: [],
  atmosphere: [],
  state: [],
  efficiency: [],
  confidence: 1,
  clapAudit: [],
})

interface DoubleCheckPanelProps {
  rec: ReviewRecord
  onSaved: () => void
}

/**
 * Double Check 六维检验（PRD F4 / 附录 B）。
 * 前五维手动勾选，第六维"环节质量"由系统自动生成；结果存入档案。
 */
export function DoubleCheckPanel({ rec, onSaved }: DoubleCheckPanelProps) {
  const [dc, setDc] = useState<DoubleCheckState>(rec.doubleCheck ?? emptyDC())
  const [saved, setSaved] = useState(false)

  const audit = useMemo(() => clapAudit(rec), [rec])

  function toggle(key: keyof Omit<DoubleCheckState, 'confidence' | 'clapAudit'>, item: string) {
    setSaved(false)
    setDc((prev) => {
      const list = prev[key]
      const next = list.includes(item) ? list.filter((x) => x !== item) : [...list, item]
      return { ...prev, [key]: next }
    })
  }

  async function save() {
    await saveReview({ ...rec, doubleCheck: { ...dc, clapAudit: audit.filter((a) => a.pass).map((a) => a.label) } })
    setSaved(true)
    onSaved()
  }

  return (
    <section className="detail-section" aria-label={DC_COPY.title}>
      <h2>{DC_COPY.title}</h2>
      <p className="coach-say">{DC_COPY.hint}</p>

      {DC_DIMENSIONS.map((dim) => (
        <fieldset key={dim.key} className="dc-dim">
          <legend>{dim.title}</legend>
          {dim.items.map((item) => (
            <label key={item} className="dc-item">
              <input
                type="checkbox"
                checked={dc[dim.key].includes(item)}
                onChange={() => toggle(dim.key, item)}
              />
              <span>{item}</span>
            </label>
          ))}
        </fieldset>
      ))}

      <fieldset className="dc-dim">
        <legend>{DC_COPY.auditTitle}</legend>
        {audit.map((a) => (
          <p key={a.label} className={a.pass ? 'dc-audit dc-audit--pass' : 'dc-audit dc-audit--fail'}>
            <span aria-hidden>{a.pass ? DC_COPY.passMark : DC_COPY.failMark}</span> {a.label}
          </p>
        ))}
      </fieldset>

      <div className="field-label">
        <span>{DC_COPY.confidenceLabel}</span>
      </div>
      <ConfidenceMeter value={dc.confidence} onChange={(v) => { setSaved(false); setDc({ ...dc, confidence: v }) }} />
      <p className="coach-say">当前档位：{CONFIDENCE_LABEL[dc.confidence]}</p>

      <div className="wizard-foot">
        <button className="btn-primary" onClick={save}>
          {DC_COPY.save}
        </button>
      </div>
      {saved && (
        <p className="coach-say" role="status">
          {DC_COPY.saved}
        </p>
      )}
    </section>
  )
}
