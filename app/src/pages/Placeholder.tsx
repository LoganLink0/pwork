import { PLACEHOLDER } from '../content/placeholder'
import { Link } from 'react-router-dom'
import { Icon } from '../components/shell/icons'

/** 占位页（PRD §4.7）：不做假功能、不留死链接——说清将要做什么、为什么现在没有、现在能做什么 */
export function Placeholder({ kind }: { kind: string }) {
  const p = PLACEHOLDER[kind] ?? {
    icon: 'file',
    title: '页面',
    lead: '该页面正在建设中。',
    will: [],
    goLabel: '回今日',
    goTo: '/',
  }
  return (
    <div className="placeholder">
      <div className="p-ico" aria-hidden><Icon name={p.icon} size={32} /></div>
      <h2>{p.title}</h2>
      <p>{p.lead}</p>
      {p.will.map(([h, text]) => (
        <div className="will" key={h}>
          <h3>{h}</h3>
          <p>{text}</p>
        </div>
      ))}
      <Link to={p.goTo} className="btn-primary" style={{ marginTop: 'var(--sp-2)' }}>
        {p.goLabel} →
      </Link>
    </div>
  )
}
