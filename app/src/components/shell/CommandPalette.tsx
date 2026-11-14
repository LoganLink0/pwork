import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { PALETTE_PAGES } from '../../content/nav'
import { FAQ, GLOSSARY } from '../../content/help'
import { Icon } from './icons'
import { useNotes } from '../../store/notes'
import { useUi } from '../../store/ui'
import { useActivity } from '../../store/activity'
import { searchAll, KIND_LABEL, type SearchHit } from '../../engine/searchAll'
import { askLibrary, type AskAiSource } from '../../engine/askAi'
import { listSavedFilters, describeFilterState, type SavedFilter } from '../../engine/savedFilters'
import { paletteActions, type ActionCtx } from '../../engine/actions'
import { relTime } from '../../engine/datetime'

interface PaletteItem {
  key: string
  group: string
  icon: string
  label: string
  sub?: string
  run: () => void
}

type AskPhase = 'idle' | 'asking' | 'done' | 'error'

/** 导航桥：独立 palette 窗（问小 P）注入后，所有页面跳转转交主窗执行（palette_goto）；
 *  主窗内使用（Ctrl+K）保持无桥、直接路由。 */
export const PaletteNavBridge = createContext<((path: string) => void) | null>(null)

/**
 * 命令面板（PRD §5.4）：⌘K 全局混合搜索——快速动作 + 页面 + 速记 + 全库检索。
 * 关闭时整体卸载、打开时重新挂载内部对话框，天然获得干净初始态。
 * AI 全库问答（0.4-4 重启）：输入问题后选「问 AI」——检索与上下文都已升到正文级
 * （2026-10-23 回撤的根因），回答带来源链接，可点跳原文。
 */
export function CommandPalette() {
  const open = useUi((s) => s.paletteOpen)
  if (!open) return null
  return <PaletteDialog />
}

function PaletteDialog() {
  const close = useUi((s) => s.closePalette)
  const via = useUi((s) => s.paletteVia)
  const setAskBusy = useUi((s) => s.setAskBusy)
  const setAskDone = useUi((s) => s.setAskDone)
  const openQuick = useUi((s) => s.openQuick)
  const notes = useNotes((s) => s.notes)
  const routerNavigate = useNavigate()
  const navBridge = useContext(PaletteNavBridge)
  // 独立窗内所有跳转（页面命中/速记/过滤器/问答来源）统一过桥交给主窗；
  // 主窗内 navBridge 为 null，直接路由
  const navigate = (p: string) => {
    if (navBridge) navBridge(p)
    else routerNavigate(p)
  }
  const [query, setQuery] = useState('')
  const [sel, setSel] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const [libraryHits, setLibraryHits] = useState<SearchHit[]>([])
  const [savedFilters, setSavedFilters] = useState<SavedFilter[]>([])
  const [ask, setAsk] = useState<{ phase: AskPhase; answer?: string; sources?: AskAiSource[]; error?: string }>({ phase: 'idle' })
  const askRef = useRef(ask)
  askRef.current = ask

  // 保存的过滤器（1.2 批）：面板每次打开重新挂载，挂载即取一次
  useEffect(() => {
    void listSavedFilters().then(setSavedFilters)
  }, [])

  const runAsk = () => {
    const q = query.trim()
    if (!q) return
    setAsk({ phase: 'asking' })
    setAskBusy(true)
    const activity = useActivity.getState()
    activity.start('ask', '小 P 思考中')
    askLibrary(q)
      .then((r) => {
        setAsk({ phase: 'done', answer: r.answer, sources: r.sources })
        activity.end('ask')
        setAskDone()
      })
      .catch((e: unknown) => {
        setAsk({ phase: 'error', error: e instanceof Error ? e.message : String(e) })
        activity.end('ask')
        setAskBusy(false)
      })
  }

  // 面板关闭（卸载）即复位圆钮思考态——用户 Esc 走人后圆钮不能停在「思考中」
  useEffect(() => () => setAskBusy(false), [setAskBusy])

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

  // Esc 挂在 window（非容器 onKeyDown）：用户鼠标点到面板外再按 Esc 也必须能关（2026-10-22 E2E 巡检发现）
  useEffect(() => {
    const onWinKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        // 回答视图里第一下 Esc 先回到搜索列表，再按才关面板（与页脚提示一致）
        setAsk((s) => (s.phase === 'idle' ? s : { phase: 'idle' }))
        if (askRef.current.phase === 'idle') close()
      }
    }
    window.addEventListener('keydown', onWinKey)
    return () => window.removeEventListener('keydown', onWinKey)
  }, [close])

  const items = useMemo<PaletteItem[]>(() => {
    const q = query.trim().toLowerCase()
    const match = (s: string) => !q || s.toLowerCase().includes(q)

    // 快速动作组（2.3 起从动作注册表派生——外部项目注册动作自动出现）：有查询词时
    // Enter 必须落在用户看到的匹配结果上，故同样参与查询过滤
    const ctx: ActionCtx = { navigate: (p) => navigate(p), openQuickNote: openQuick, openPalette: (via) => useUi.getState().openPalette(via) }
    const actions: PaletteItem[] = paletteActions()
      .filter((a) => match(a.label))
      .map((a) => ({
        key: `act-${a.id}`,
        group: '快速动作',
        icon: a.icon,
        label: a.label,
        sub: a.id === 'quick-note' ? 'N' : undefined,
        run: () => { close(); a.run(ctx) },
      }))
    // 页面组全部来自页面注册表派生（PALETTE_PAGES，0.4-5）——新增页面注册即出现在面板
    const pages: PaletteItem[] = PALETTE_PAGES
      .filter((p) => match(p.label))
      .map((p) => ({ key: `pg-${p.to}`, group: '页面', icon: p.icon, label: p.label, sub: p.sub, run: () => { close(); navigate(p.to) } }))

    // 我的筛选组（1.2 批）：保存的过滤器按名字命中，点击跳条目库并套用（?flt= 机制）
    const filterItems: PaletteItem[] = savedFilters
      .filter((f) => match(f.name))
      .slice(0, q ? 8 : 3)
      .map((f) => ({
        key: `flt-${f.id}`,
        group: '我的筛选',
        icon: 'search',
        label: f.name,
        sub: describeFilterState(f.state),
        run: () => { close(); navigate(`/input/items?flt=${f.id}`) },
      }))

    const noteItems: PaletteItem[] = notes
      .filter((n) => match(n.title) || match(n.body))
      .slice(0, q ? 8 : 3)
      .map((n) => ({
        key: `note-${n.id}`,
        group: '速记',
        icon: 'pen',
        label: n.title || n.body.slice(0, 24) || '（无标题）',
        sub: relTime(n.updatedAt),
        run: () => { close(); navigate(`/input/notes/${n.id}`) },
      }))

    // 帮助组（用户反馈：Ctrl K 搜不到帮助内容）：常见问题按问题文本、术语按词条命中，
    // 命中即给一条「帮助」项，点击跳帮助页对应分类；有查询词才出现（列表态太吵）
    const helpItems: PaletteItem[] = q
      ? [
          ...FAQ.map((f) => ({ key: `help-faq-${f.q}`, label: f.q, sub: `常见问题 · ${f.group}`, to: '/help?tab=troubleshoot' })),
          ...GLOSSARY.map((g) => ({ key: `help-gl-${g.term}`, label: g.term, sub: `术语 · ${g.group}`, to: '/help?tab=glossary' })),
        ]
          .filter((it) => match(it.label))
          .slice(0, 6)
          .map((it) => ({
            key: it.key,
            group: '帮助',
            icon: 'helpCircle',
            label: it.label,
            sub: it.sub,
            run: () => { close(); navigate(it.to) },
          }))
      : []

    return [...actions, ...pages, ...filterItems, ...noteItems, ...helpItems]
  }, [query, notes, savedFilters, close, openQuick, navigate])

  // 使用处夹紧（代替 effect 内 setState）
  // 统一可导航列表：主列表 + 全库检索结果 + AI 问答入口——↑↓/Enter 覆盖全部条目
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
        icon: 'search',
        label: h.title,
        sub: `${KIND_LABEL[h.kind]} · ${h.sub}`,
        accent: false,
        run: () => {
          close()
          navigate(h.to)
        },
      })),
      ...(query.trim()
        ? [{
            key: 'ask-ai',
            group: '问小 P（AI 全库问答）',
            icon: 'zap',
            label: `问问小 P：「${query.trim().slice(0, 30)}」`,
            sub: '小 P 去速记、条目、洞察里找答案',
            accent: true,
            run: runAsk,
          }]
        : []),
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runAsk 由 query 派生（闭包读取最新 query）
    [items, libraryHits, query, close, navigate],
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
          <Icon name="search" size={14} />
          <input
            ref={inputRef}
            value={query}
            placeholder={via === 'littlep' ? '问小 P 一句话，或直接搜索全库…' : '搜索页面 / 速记 / 全库，或执行动作…'}
            onChange={(e) => {
              setQuery(e.target.value)
              setSel(0)
              setAsk({ phase: 'idle' })
            }}
            onKeyDown={onKeyDown}
            aria-label="搜索"
          />
          <kbd>Esc</kbd>
        </div>
        <div className="p-list">
          {ask.phase === 'asking' && (
            <div className="p-asking">
              <img src="favicon.svg" alt="" aria-hidden className="p-asking-mark" />
              <span className="p-asking-text">正在全库里找（速记正文、条目摘要与批注、洞察全文）…</span>
            </div>
          )}
          {ask.phase === 'error' && (
            <div className="p-group" style={{ padding: 'var(--sp-4)', color: 'var(--danger)' }}>问失败了：{ask.error}</div>
          )}
          {ask.phase === 'done' && (
            <div style={{ padding: 'var(--sp-3) var(--sp-4)' }}>
              <div className="p-group">小 P 回答（基于你库里的内容）</div>
              <div style={{ whiteSpace: 'pre-wrap', fontSize: 'var(--fs-sm)', lineHeight: 1.7, padding: 'var(--sp-2) 0' }}>{ask.answer}</div>
              {(ask.sources?.length ?? 0) > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--sp-2)', paddingTop: 'var(--sp-2)' }}>
                  {ask.sources!.map((s, i) => (
                    <button
                      key={`${s.kind}-${s.title}-${i}`}
                      type="button"
                      className="btn-ghost"
                      style={{ fontSize: 'var(--fs-xs)', padding: '2px 8px' }}
                      onClick={() => { close(); navigate(s.to) }}
                    >
                      {KIND_LABEL[s.kind]} · {s.title.slice(0, 20)} →
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
          {ask.phase === 'idle' && (
            <>
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
                      <span className={item.accent ? 'mark-act' : ''} aria-hidden><Icon name={item.icon} size={14} /></span>
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.label}</span>
                      {item.sub && <span className="p-sub">{item.sub}</span>}
                    </div>
                  </div>
                )
              })}
            </>
          )}
        </div>
        <div className="p-foot">
          {ask.phase === 'idle' ? (
            <>
              <span><kbd>↑</kbd><kbd>↓</kbd> 选择</span>
              <span><kbd>↵</kbd> 跳转</span>
              <span><kbd>Esc</kbd> 关闭</span>
            </>
          ) : (
            <span><kbd>Esc</kbd> 返回搜索（再按关闭）</span>
          )}
        </div>
      </div>
    </div>
  )
}
