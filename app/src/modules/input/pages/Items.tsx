import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useCollect } from '../../../store/collect'
import { useTasks } from '../../../store/tasks'
import { useNotes } from '../../../store/notes'
import { confirmDialog } from '../../../engine/confirm'
import { fmtLocal } from '../../../engine/datetime'
import { ItemCard } from '../components/ItemCard'
import { itemTiers } from '../engine/itemTier'
import { rejectionStats } from '../engine/rejectionStats'
import { relTime } from '../../../engine/datetime'
import { toast } from '../../../engine/toast'
import { listSavedFilters, saveSavedFilter, deleteSavedFilter, describeFilterState, type SavedFilter, type ItemsFilterState } from '../../../engine/savedFilters'
import type { Item } from '../../../types/models'

type StageFilter = 'all' | 'must' | 'kept' | 'discarded'

/** 条目库页（PRD §4.4）：分层/状态筛选 + 搜索 + 展开详情与标注；回收站 + 搜索定位（2026-11-10 走查补） */
export function Items() {
  const { items, loaded, setVote, setNotes, toggleKeep, cycleOt, deleteItem, restoreItem, listDeleted } = useCollect()
  const [stage, setStage] = useState<StageFilter>('all')
  const [query, setQuery] = useState('')
  const [otOnly, setOtOnly] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const createTask = useTasks((s) => s.create)
  const [converted, setConverted] = useState<Set<string>>(new Set())
  const [searchParams, setSearchParams] = useSearchParams()

  // 按月切片（2026-11-08 走查 P1：全量渲染单页 2000+ 按钮）：默认最新有数据的月份，
  // 可翻历史月份——顺带解除旧版「只看近 30 天」的硬窗口（更早的条目从此可达）
  const months = useMemo(() => {
    const set = new Set<string>()
    for (const i of items) set.add(i.fetchedAt.slice(0, 7))
    return Array.from(set).sort().reverse()
  }, [items])
  const [selMonth, setSelMonth] = useState<string | null>(null) // null=跟随最新有数据的月份
  const curMonth = selMonth ?? months[0] ?? ''
  const monthItems = useMemo(() => items.filter((i) => i.fetchedAt.slice(0, 7) === curMonth), [items, curMonth])

  // 搜索/待办溯源定位（走查断点修复：按月分页后命中旧条目点过去看不到）：?focus=id →
  // 切到条目所在月份并展开滚动到位，随后清参防重复滚动
  const focusId = searchParams.get('focus')
  const focusDoneRef = useRef(false)
  useEffect(() => {
    if (!focusId || focusDoneRef.current || !loaded) return
    const target = items.find((i) => i.id === focusId)
    if (!target) return
    focusDoneRef.current = true
    setTrashMode(false)  // 回收站视图挡列表（走查抓出：回收站里点搜索跳转看不到目标）
    setSelMonth(target.fetchedAt.slice(0, 7))
    setExpandedId(focusId)
    setSearchParams({}, { replace: true })
    requestAnimationFrame(() => {
      document.querySelector(`[data-item-id="${focusId}"]`)?.scrollIntoView({ block: 'center', behavior: 'smooth' })
    })
  }, [focusId, items, loaded, setSearchParams])

  // 回收站（与速记回收站对称）：软删条目就地恢复，别让「14 天可找回」停留在备份导入的重路上
  const [trashMode, setTrashMode] = useState(false)
  const [trash, setTrash] = useState<Item[]>([])
  const reloadTrash = () => void listDeleted().then(setTrash)
  useEffect(() => {
    reloadTrash()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 挂载取一次
  }, [])

  // 保存的过滤器（1.2 批）：把当前筛选组合存个名字，一键套用、命令面板直达；月份不入档（会过期）
  const [filters, setFilters] = useState<SavedFilter[]>([])
  const [saveOpen, setSaveOpen] = useState(false)
  const [saveName, setSaveName] = useState('')
  const reloadFilters = () => void listSavedFilters().then(setFilters)
  useEffect(() => {
    reloadFilters()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 挂载取一次
  }, [])
  const applyFilterState = (s: ItemsFilterState) => {
    setStage(s.stage)
    setQuery(s.query)
    setOtOnly(s.otOnly)
  }
  const filterActive = (f: SavedFilter) => f.state.stage === stage && f.state.query === query && f.state.otOnly === otOnly
  const doSaveFilter = () => {
    const name = saveName.trim()
    if (!name) {
      toast('error', '先给这个筛选起个名字')
      return
    }
    void saveSavedFilter(name, { stage, query, otOnly })
      .then(() => {
        setSaveOpen(false)
        setSaveName('')
        reloadFilters()
        toast('ok', `筛选「${name}」已保存，命令面板输入名字可直接调用`)
      })
      .catch((e: unknown) => toast('error', e instanceof Error ? e.message : String(e)))
  }
  const doDeleteFilter = (f: SavedFilter) => {
    void confirmDialog({ title: `删除筛选「${f.name}」？`, body: '只删除这个筛选入口，不影响任何条目数据。', danger: true, confirmLabel: '删除' }).then((ok) => {
      if (ok) void deleteSavedFilter(f.id).then(reloadFilters)
    })
  }
  // URL 直达（命令面板/收藏入口同机制）：?flt=<id> → 套用后清参防重复
  const fltId = searchParams.get('flt')
  const fltDoneRef = useRef(false)
  useEffect(() => {
    if (!fltId || fltDoneRef.current) return
    fltDoneRef.current = true
    void listSavedFilters().then((list) => {
      const f = list.find((x) => x.id === fltId)
      if (f) applyFilterState(f.state)
      setSearchParams({}, { replace: true })
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 只依赖 fltId：套用一次即清参
  }, [fltId, setSearchParams])
  const doRestore = (id: string) => {
    void restoreItem(id).then(() => reloadTrash())
  }
  const monthShift = (ym: string, delta: number): string => {
    const [y, m] = ym.split('-').map(Number)
    const d = new Date(y, m - 1 + delta, 1)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  }

  // 分层按同日排名得出（必看=当天前 2 名）：徽章与「必看」筛选共用
  const tiers = useMemo(() => itemTiers(items), [items])

  const convert = (id: string, title: string) => {
    void createTask({ title, origin: { kind: 'item', refId: id } })
    setConverted((prev) => new Set(prev).add(id))
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return monthItems.filter((i) => {
      if (stage === 'must' && tiers.get(i.id) !== 'must') return false
      if (stage === 'kept' && i.stage !== 'kept') return false
      if (stage === 'discarded' && i.stage !== 'discarded') return false
      if (otOnly && !i.otFlag) return false
      if (q && !(i.title.toLowerCase().includes(q) || i.summary.toLowerCase().includes(q) || i.sourceName.toLowerCase().includes(q))) return false
      return true
    })
  }, [monthItems, stage, tiers, query, otOnly])

  const counts = useMemo(() => {
    let must = 0
    let kept = 0
    let discarded = 0
    for (const i of monthItems) {
      if (tiers.get(i.id) === 'must') must += 1
      if (i.stage === 'kept') kept += 1
      if (i.stage === 'discarded') discarded += 1
    }
    return { all: monthItems.length, must, kept, discarded }
  }, [monthItems, tiers])

  const stageChips: { key: StageFilter; label: string }[] = [
    { key: 'all', label: `全部 ${counts.all}` },
    { key: 'must', label: `必看 ${counts.must}` },
    { key: 'kept', label: `评分入选 ${counts.kept}` },
    { key: 'discarded', label: `已筛除 ${counts.discarded}` },
  ]

  // 筛除原因聚合（控制论"系统辨识"落地）：只在本视图有数据时出现——
  // 哪类原因最多、哪个屏蔽词杀得最狠、哪个源独占垃圾产量，调源/调词有依据
  const rejects = useMemo(() => rejectionStats(monthItems), [monthItems])

  // 右栏「我的评分」分布（宽幅双栏第二批）：本月各档投票计数
  const voteDist = useMemo(() => {
    const dist = { want: 0, meh: 0, no: 0 }
    for (const i of monthItems) {
      const v = i.annotation?.vote
      if (v === 'want') dist.want++
      else if (v === 'meh') dist.meh++
      else if (v === 'no') dist.no++
    }
    return dist
  }, [monthItems])

  // 详情右栏面板（第三批）：宽屏点「详情」右栏整体切换为该条目详情，主列卡片保持紧凑
  //（窄屏无右栏，ItemCard 保持卡内展开现状——expanded 由 wide 取反驱动）
  const wide = useMinWidth(1440)
  const detailItem = useMemo(() => (wide ? filtered.find((i) => i.id === expandedId) : undefined), [wide, filtered, expandedId])

  return (
    <section className="content-wide">
      <div className="page-head">
        <h1>条目库</h1>
        <span className="sub">全库 {items.length} 条 · 已筛除的条目保留 14 天后自动清除（有标注的除外）</span>
      </div>

      {!trashMode && (
      <div style={{ display: 'flex', gap: 'var(--sp-2)', marginBottom: 'var(--sp-4)', alignItems: 'center' }}>
        <button type="button" className="chip" disabled={!months.includes(monthShift(curMonth, -1))} onClick={() => setSelMonth(monthShift(curMonth, -1))} aria-label="上一个有条目的月份">◀</button>
        <b style={{ fontSize: 16 }}>{curMonth || '—'}</b>
        <button type="button" className="chip" disabled={!months.includes(monthShift(curMonth, 1))} onClick={() => setSelMonth(monthShift(curMonth, 1))} aria-label="下一个有条目的月份">▶</button>
        <span style={{ color: 'var(--ink-faint)', fontSize: 13 }}>本月 {monthItems.length} 条</span>
      </div>
      )}

      <div style={{ display: 'flex', gap: 'var(--sp-2)', marginBottom: 'var(--sp-4)', flexWrap: 'wrap', alignItems: 'center' }}>
        {stageChips.map((c) => (
          <button key={c.key} type="button" className={`chip${stage === c.key ? ' on' : ''}`} onClick={() => setStage(c.key)}>
            {c.label}
          </button>
        ))}
        <button type="button" className={`chip${otOnly ? ' on' : ''}`} onClick={() => setOtOnly(!otOnly)}>🎯 机会/威胁/趋势</button>
        <button
          type="button"
          className={`chip${trashMode ? ' on' : ''}`}
          onClick={() => { setTrashMode(!trashMode); if (!trashMode) reloadTrash() }}
          aria-pressed={trashMode}
        >
          回收站（{trash.length}）
        </button>
        <input
          className="input"
          style={{ maxWidth: 220, marginLeft: 'auto' }}
          placeholder="搜索标题/摘要/来源…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="搜索条目"
        />
        <button
          type="button"
          className={`chip${saveOpen ? ' on' : ''}`}
          onClick={() => { setSaveOpen(!saveOpen); setSaveName('') }}
          title="把当前筛选组合存个名字，之后一键套用，命令面板也能直达"
        >
          存为筛选
        </button>
      </div>

      {saveOpen && (
        <div style={{ display: 'flex', gap: 'var(--sp-2)', marginBottom: 'var(--sp-4)', flexWrap: 'wrap', alignItems: 'center' }}>
          <input
            className="input"
            style={{ maxWidth: 240 }}
            placeholder="给这个筛选起个名字，如「AI 周刊必看」"
            value={saveName}
            onChange={(e) => setSaveName(e.target.value)}
            onKeyDown={(e) => {
              if (e.nativeEvent.isComposing) return // 中文输入法选词回车不触发（MWG ime-safe-enter-submit）
              if (e.key === 'Enter') doSaveFilter()
              if (e.key === 'Escape') setSaveOpen(false)
            }}
            autoFocus
            aria-label="筛选名称"
          />
          <span className="val" style={{ color: 'var(--ink-faint)', fontSize: 'var(--fs-xs)' }}>
            将保存：{describeFilterState({ stage, query, otOnly })}
          </span>
          <button type="button" className="btn-primary" onClick={doSaveFilter}>保存</button>
          <button type="button" className="btn-ghost" onClick={() => setSaveOpen(false)}>取消</button>
        </div>
      )}

      {!trashMode && filters.length > 0 && (
        <div style={{ display: 'flex', gap: 'var(--sp-2)', marginBottom: 'var(--sp-4)', flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ color: 'var(--ink-faint)', fontSize: 13 }}>我的筛选：</span>
          {filters.map((f) => (
            <span key={f.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}>
              <button
                type="button"
                className={`chip${filterActive(f) ? ' on' : ''}`}
                title={describeFilterState(f.state)}
                aria-pressed={filterActive(f)}
                onClick={() => applyFilterState(f.state)}
              >
                {f.name}
              </button>
              <button
                type="button"
                className="chip"
                aria-label={`删除筛选 ${f.name}`}
                title="删除这个筛选"
                onClick={() => doDeleteFilter(f)}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}

      {/* 宽幅双栏（第二批）：主列列表 + 右栏库概览（≥1440；窄屏右栏整体隐藏） */}
      <div className="wide-grid">
        <div className="main-col" style={{ minWidth: 0 }}>
      {trashMode && (
        trash.length === 0 ? (
          <div className="empty">
            <div className="e-ico" aria-hidden>🗑</div>
            <p>回收站是空的。删除的条目会在这里保留，随时可恢复。</p>
          </div>
        ) : (
          <div className="set-card" style={{ marginBottom: 'var(--sp-4)' }}>
            {trash.map((t) => (
              <div key={t.id} className="set-row" style={{ alignItems: 'center' }}>
                <label style={{ fontWeight: 600, color: 'var(--ink)', maxWidth: 320, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {t.title || '（无标题）'}
                </label>
                <span className="val" style={{ color: 'var(--ink-soft)' }}>
                  {t.sourceName} · 删除于 {relTime(t.deletedAt ?? t.updatedAt)}
                </span>
                <button type="button" className="btn-ghost" style={{ marginLeft: 'auto' }} onClick={() => doRestore(t.id)}>
                  恢复
                </button>
              </div>
            ))}
          </div>
        )
      )}

      {!trashMode && stage === 'discarded' && rejects && (
        <div className="notice" style={{ marginBottom: 'var(--sp-3)' }}>
          本月筛除 {rejects.total} 条：
          {rejects.byReason
            .map((b) => `${b.reason} ${b.count} 条${b.topWord ? `（最多的是「${b.topWord.word}」${b.topWord.count} 次）` : ''}`)
            .join(' · ')}
          {rejects.topSource && rejects.topSource.share >= 0.4
            ? `。「${rejects.topSource.name}」独占 ${Math.round(rejects.topSource.share * 100)}%——可去信源管理停用它，或检查是不是该源的抓取解析出了问题。`
            : '。屏蔽词误杀多就去 设置 → 采集设置 调整词表。'}
        </div>
      )}

      {!trashMode && (filtered.length === 0 ? (
        <div className="empty">
          <div className="e-ico" aria-hidden>🗂</div>
          <p>{!loaded ? '正在读取条目…' : monthItems.length === 0 ? '这个月还没有条目。去信息日报抓取，或先在信源管理添加源。' : '没有匹配的条目。'}</p>
          {loaded && monthItems.length === 0 && (
            <div style={{ display: 'flex', gap: 'var(--sp-3)', justifyContent: 'center' }}>
              <Link to="/input/digest" className="btn-ghost">去信息日报 →</Link>
              <Link to="/input/sources?catalog=1" className="btn-ghost">去推荐信源目录挑几个 →</Link>
            </div>
          )}
        </div>
      ) : (
        filtered.map((item: Item) => (
          <div key={item.id} data-item-id={item.id}>
            <ItemCard
              item={item}
              showStage
              expanded={!wide && expandedId === item.id}
              onToggle={() => setExpandedId(expandedId === item.id ? null : item.id)}
              onVote={(v) => void setVote(item.id, v)}
              tier={tiers.get(item.id)}
              onNotes={(t) => void setNotes(item.id, t)}
              onKeep={() => void toggleKeep(item.id)}
              onCycleOt={() => void cycleOt(item.id)}
              onConvert={() => convert(item.id, item.title)}
              onDelete={() => {
                void confirmDialog({ title: `删除「${item.title.slice(0, 24)}」？`, body: '软删除：移入条目库回收站，可随时恢复。', danger: true, confirmLabel: '删除' }).then((ok) => {
                  if (ok) void deleteItem(item.id).then(reloadTrash)  // 等写库完成再刷计数（竞争修复 2026-11-10）
                })
              }}
              converted={converted.has(item.id)}
            />
          </div>
        ))
      ))}
        </div>

        <aside className="wide-aside" aria-label={detailItem ? '条目详情' : '库概览'}>
          {detailItem ? (
            <ItemDetailPanel
              key={detailItem.id}
              item={detailItem}
              tier={tiers.get(detailItem.id)}
              converted={converted.has(detailItem.id)}
              onClose={() => setExpandedId(null)}
              onVote={(v) => void setVote(detailItem.id, v)}
              onNotes={(t) => void setNotes(detailItem.id, t)}
              onKeep={() => void toggleKeep(detailItem.id)}
              onCycleOt={() => void cycleOt(detailItem.id)}
              onConvert={() => convert(detailItem.id, detailItem.title)}
              onDelete={() => {
                void confirmDialog({ title: `删除「${detailItem.title.slice(0, 24)}」？`, body: '软删除：移入条目库回收站，可随时恢复。', danger: true, confirmLabel: '删除' }).then((ok) => {
                  if (ok) void deleteItem(detailItem.id).then(reloadTrash).then(() => setExpandedId(null))
                })
              }}
            />
          ) : (
            <>
              <div className="aside-card">
                <h3>{curMonth || '本月'}库概览</h3>
                <div className="kv"><span>入库</span><b>{counts.all} 条</b></div>
                <div className="kv"><span>评分入选</span><b>{counts.kept} 条</b></div>
                <div className="kv"><span>已筛除（14 天后清理）</span><b>{counts.discarded} 条</b></div>
              </div>
              <div className="aside-card">
                <h3>我的评分</h3>
                <div className="dist-bar"><span className="lbl">多推</span><div className="bar"><i style={{ width: `${monthItems.length ? (voteDist.want / monthItems.length) * 100 : 0}%`, background: 'var(--accent)' }} /></div><b>{voteDist.want}</b></div>
                <div className="dist-bar"><span className="lbl">没想好</span><div className="bar"><i style={{ width: `${monthItems.length ? (voteDist.meh / monthItems.length) * 100 : 0}%`, background: 'var(--line-strong)' }} /></div><b>{voteDist.meh}</b></div>
                <div className="dist-bar"><span className="lbl">少推</span><div className="bar"><i style={{ width: `${monthItems.length ? (voteDist.no / monthItems.length) * 100 : 0}%`, background: 'var(--surface-2)', outline: '1px solid var(--line)' }} /></div><b>{voteDist.no}</b></div>
              </div>
              {rejects && rejects.total > 0 && (
                <div className="aside-card">
                  <h3>本月筛除 {rejects.total} 条</h3>
                  {rejects.byReason.slice(0, 3).map((b) => (
                    <div className="kv" key={b.reason}><span>{b.reason}</span><b>{b.count} 条</b></div>
                  ))}
                </div>
              )}
            </>
          )}
        </aside>
      </div>
    </section>
  )
}

/** 视口宽度判定（≥px 为 true，matchMedia 变化实时跟随）——详情右栏只在大屏出现。
 *  能力检测：测试环境（jsdom）无 matchMedia，恒 false（详情面板不出现，卡内展开兜底） */
function useMinWidth(px: number): boolean {
  const [ok, setOk] = useState(() => typeof window.matchMedia === 'function' && window.matchMedia(`(min-width: ${px}px)`).matches)
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return
    const m = window.matchMedia(`(min-width: ${px}px)`)
    const on = () => setOk(m.matches)
    m.addEventListener('change', on)
    return () => m.removeEventListener('change', on)
  }, [px])
  return ok
}

/** 条目详情右栏面板（第三批）：宽屏点「详情」时右栏整体切换为该条目的详情与操作。
 *  key=条目 id 由调用方给出，切换条目时批注草稿自然重置。 */
function ItemDetailPanel(opts: {
  item: Item
  tier: 'must' | 'may' | 'skip' | undefined
  converted: boolean
  onClose: () => void
  onVote: (v: 'want' | 'meh' | 'no' | null) => void
  onNotes: (t: string) => void
  onKeep: () => void
  onCycleOt: () => void
  onConvert: () => void
  onDelete: () => void
}) {
  const item = opts.item
  const [draft, setDraft] = useState<string | null>(null)
  const navigate = useNavigate()
  const createNote = useNotes((s) => s.create)

  // 写速记：以这条条目为引，速记自动挂回本条目（与 ItemCard 卡内按钮同一行为）
  const writeNote = async () => {
    const note = await createNote({
      body: `【${item.title}】(${item.url})\n\n`,
      tags: [],
      source: 'manual',
      links: { itemIds: [item.id], reviewIds: [], taskIds: [] },
    })
    navigate(`/input/notes/${note.id}`)
  }

  return (
    <>
      <div className="aside-card">
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--sp-2)' }}>
          <h3 style={{ margin: 0, flex: 1, minWidth: 0, lineHeight: 1.5 }}>{item.title}</h3>
          <button type="button" className="mini-btn" onClick={opts.onClose} aria-label="关闭详情">收起</button>
        </div>
        <div className="kv"><span>来源 / 入库</span><b>{item.sourceName} · {fmtLocal(item.fetchedAt)}</b></div>
        <div className="kv"><span>分层</span><b>{opts.tier === 'must' ? '必看' : opts.tier === 'may' ? '可看' : '可略'}</b></div>
        <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--ink-soft)', marginTop: 'var(--sp-2)', lineHeight: 1.8 }}>
          筛选理由：{item.scoreReason || '—'}
        </div>
        {/^https?:\/\//i.test(item.url) && (
          <a href={item.url} target="_blank" rel="noreferrer noopener" style={{ fontSize: 'var(--fs-xs)', color: 'var(--accent-text)', display: 'inline-block', marginTop: 'var(--sp-2)' }}>
            阅读原文 ↗
          </a>
        )}
      </div>

      <div className="aside-card">
        <h3>我的批注</h3>
        <textarea
          value={draft ?? item.annotation?.notes ?? ''}
          placeholder="批注（永久保留，随备份）"
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => { if (draft !== null && draft !== item.annotation?.notes) opts.onNotes(draft) }}
          aria-label={`批注：${item.title}`}
          style={{ width: '100%', minHeight: 84, border: '1px solid var(--line)', borderRadius: 'var(--r-sm)', padding: 'var(--sp-2)', fontSize: 'var(--fs-xs)', background: 'var(--bg)', color: 'var(--ink)', resize: 'vertical' }}
        />
      </div>

      <div className="aside-card">
        <h3>操作</h3>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          <button type="button" className={`chip${item.annotation?.vote === 'want' ? ' on' : ''}`} onClick={() => opts.onVote(item.annotation?.vote === 'want' ? null : 'want')}>✦ 多推</button>
          <button type="button" className={`chip${item.annotation?.vote === 'meh' ? ' on' : ''}`} onClick={() => opts.onVote(item.annotation?.vote === 'meh' ? null : 'meh')}>◦ 没想好</button>
          <button type="button" className={`chip${item.annotation?.vote === 'no' ? ' on' : ''}`} onClick={() => opts.onVote(item.annotation?.vote === 'no' ? null : 'no')}>✗ 少推</button>
          <button type="button" className="chip" onClick={opts.onCycleOt}>{item.otFlag ? `${item.otFlag === 'opportunity' ? '机会' : item.otFlag === 'threat' ? '威胁' : '趋势'}（换/取消）` : '标记机会/威胁/趋势'}</button>
          <button type="button" className="chip" onClick={opts.onKeep}>{item.annotation?.keepForever ? '★ 取消永久保留' : '永久保留'}</button>
          <button type="button" className="chip" disabled={opts.converted} onClick={opts.onConvert}>{opts.converted ? '已转待办 ✓' : '转待办'}</button>
          <button type="button" className="chip" onClick={() => void writeNote()}>写速记</button>
          <button type="button" className="chip" onClick={opts.onDelete}>删除</button>
        </div>
      </div>
    </>
  )
}
