import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { MODULE_NAV, WORKSPACE_NAV } from '../../content/nav'
import { useNotes } from '../../store/notes'
import { useUi } from '../../store/ui'
import { searchAll, KIND_LABEL, type SearchHit } from '../../engine/searchAll'
import { relTime } from '../../engine/datetime'

interface PaletteItem {
  key: string
  group: string
  icon: string
  label: string
  sub?: string
  run: () => void
}

/**
 * 命令面板（PRD §5.4）：⌘K 全局混合搜索——快速动作 + 页面 + 速记。
 * 关闭时整体卸载、打开时重新挂载内部对话框，天然获得干净初始态。
 * W3 任务库上线后扩展任务与条目（开放问题 C-4）。
 */
export function CommandPalette() {
  const open = useUi((s) => s.paletteOpen)
  if (!open) return null
  return <PaletteDialog />
}

function PaletteDialog() {
  const close = useUi((s) => s.closePalette)
  const openQuick = useUi((s) => s.openQuick)
  const notes = useNotes((s) => s.notes)
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [sel, setSel] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const [libraryHits, setLibraryHits] = useState<SearchHit[]>([])

  // C-4 落地：跨模块全库检索（防抖；任务/条目/复盘/洞察——速记已在下方独立分组）
  useEffect(() => {
    const q = query.trim()
    if (!q) {
      setLibraryHits([])
      return
    }
    const t = window.setTimeout(() => {
      void searchAll(q).then((r) => setLibraryHits(r.filter((x) => x.kind !== 'note')))
    }, 150)
    return () => window.clearTimeout(t)
  }, [query])

  useEffect(() => {
    // 挂载后聚焦（唯一副作用：不 setState）
    requestAnimationFrame(() => inputRef.current?.focus())
  }, [])

  const items = useMemo<PaletteItem[]>(() => {
    const q = query.trim().toLowerCase()
    const match = (s: string) => !q || s.toLowerCase().includes(q)

    // 快速动作同样参与查询过滤：有查询词时 Enter 必须落在用户看到的匹配结果上
    const actions: PaletteItem[] = []
    if (match('新速记')) {
      actions.push({ key: 'act-note', group: '快速动作', icon: '⚡', label: '新速记', sub: 'N', run: () => { close(); openQuick() } })
    }
    if (match('新建复盘')) {
      actions.push({
        key: 'act-review',
        group: '快速动作',
        icon: '＋',
        label: '新建复盘',
        run: () => { close(); navigate('/review/new') },
      })
    }
    if (match('新建案例')) {
      actions.push({
        key: 'act-case',
        group: '快速动作',
        icon: '＋',
        label: '新建案例',
        run: () => { close(); navigate('/cases') },
      })
    }

    const pageEntries: { to: string; icon: string; label: string; sub: string }[] = [
      ...WORKSPACE_NAV.filter((w) => w.to !== '/').map((w) => ({ to: w.to, icon: w.icon, label: w.label, sub: '页面' })),
      { to: '/', icon: '◈', label: '今日', sub: '页面' },
      // 顶层直达模块（处理/输出/案例无 children）也要能被搜到
      ...MODULE_NAV.filter((m) => m.to).map((m) => ({ to: m.to!, icon: m.icon, label: m.label, sub: '页面' })),
      ...MODULE_NAV.flatMap((m) =>
        (m.children ?? []).map((c) => ({ to: c.to, icon: c.icon, label: c.label, sub: m.label })),
      ),
      { to: '/settings', icon: '⚙', label: '设置', sub: '页面' },
      { to: '/help', icon: '?', label: '帮助', sub: '页面' },
      { to: '/design', icon: '🎨', label: '设计系统样例', sub: '开发' },
    ]
    const pages: PaletteItem[] = pageEntries
      .filter((p) => match(p.label))
      .map((p) => ({ key: `pg-${p.to}`, group: '页面', icon: p.icon, label: p.label, sub: p.sub, run: () => { close(); navigate(p.to) } }))

    const noteItems: PaletteItem[] = notes
      .filter((n) => match(n.title) || match(n.body))
      .slice(0, q ? 8 : 3)
      .map((n) => ({
        key: `note-${n.id}`,
        group: '速记',
        icon: '✎',
        label: n.title || n.body.slice(0, 24) || '（无标题）',
        sub: relTime(n.updatedAt),
        run: () => { close(); navigate(`/input/notes/${n.id}`) },
      }))

    return [...actions, ...pages, ...noteItems]
  }, [query, notes, close, openQuick, navigate])

  // 使用处夹紧（代替 effect 内 setState）
  // 统一可导航列表：主列表 + 全库检索结果——↑↓/Enter 覆盖全部条目
  const flat = useMemo(
    () => [
      ...items.map((it) => ({
        key: it.key,
        group: it.group,
        icon: it.icon,
        label: it.label,
        sub: it.sub,
        accent: it.group === '快速动作',
        run: it.run,
      })),
      ...libraryHits.map((h) => ({
        key: `lib-${h.kind}-${h.id}`,
        group: '全库检索',
        icon: '🔎',
        label: h.title,
        sub: `${KIND_LABEL[h.kind]} · ${h.sub}`,
        accent: false,
        run: () => {
          close()
          navigate(h.to)
        },
      })),
    ],
    [items, libraryHits, close, navigate],
  )
  const cur = flat.length ? Math.min(sel, flat.length - 1) : 0

  const runItem = (item: { run: () => void } | undefined) => {
    if (!item) return
    item.run()
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSel(flat.length ? (cur + 1) % flat.length : 0)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSel(flat.length ? (cur - 1 + flat.length) % flat.length : 0)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      runItem(flat[cur])
    } else if (e.key === 'Escape') {
      e.preventDefault()
      close()
    }
  }

  // 分组渲染：与 flat 平铺顺序一致
  let lastGroup = ''
  return (
    <div className="overlay" onClick={(e) => e.target === e.currentTarget && close()}>
      <div className="palette" role="dialog" aria-label="命令面板">
        <div className="p-input">
          🔍
          <input
            ref={inputRef}
            value={query}
            placeholder="搜索页面 / 速记 / 全库，或执行动作…"
            onChange={(e) => {
              setQuery(e.target.value)
              setSel(0)
            }}
            onKeyDown={onKeyDown}
            aria-label="搜索"
          />
          <kbd>Esc</kbd>
        </div>
        <div className="p-list">
          {flat.length === 0 && (
            <div className="p-group" style={{ padding: 'var(--sp-4)' }}>没有匹配「{query}」的结果</div>
          )}
          {flat.map((item, i) => {
            const header = item.group !== lastGroup ? <div className="p-group">{item.group}</div> : null
            lastGroup = item.group
            return (
              <div key={item.key}>
                {header}
                <div
                  className={`p-item${i === cur ? ' sel' : ''}`}
                  onClick={() => runItem(item)}
                  onMouseEnter={() => setSel(i)}
                >
                  <span className={item.accent ? 'mark-act' : ''} aria-hidden>{item.icon}</span>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.label}</span>
                  {item.sub && <span className="p-sub">{item.sub}</span>}
                </div>
              </div>
            )
          })}
        </div>
        <div className="p-foot">
          <span>↑↓ 选择</span>
          <span>↵ 跳转</span>
          <span>Esc 关闭</span>
        </div>
      </div>
    </div>
  )
}
