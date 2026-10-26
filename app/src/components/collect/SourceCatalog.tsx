import { useMemo, useState } from 'react'
import { SOURCE_CATALOG, DOMAIN_LABEL, type CatalogEntry } from '../../content/collect'
import { useCollect } from '../../store/collect'

/**
 * 信源挑选目录（首访引导与信源页共用）：按领域分组、勾选订阅——
 * Feedly/Inoreader 首启同款形态。默认预选各领域 tier 1 源；与已存信源按地址去重，可安全重复导入。
 * 导入走 store（importCatalog）——写库后信源页计数与列表立即刷新（2026-10-26 修复绕过 store 的不刷新问题）。
 */
export function SourceCatalog({ onDone }: { onDone?: (msg: string) => void }) {
  const { sources, importCatalog } = useCollect()
  const [domain, setDomain] = useState<string>(SOURCE_CATALOG[0]!.domain)
  const [picked, setPicked] = useState<Set<string>>(() => {
    const s = new Set<string>()
    for (const g of SOURCE_CATALOG) for (const e of g.sources) if (e.tier === 1) s.add(e.url)
    return s
  })
  const [busy, setBusy] = useState(false)

  const allSources = useMemo(() => SOURCE_CATALOG.flatMap((g) => g.sources), [])
  const importedUrls = useMemo(() => new Set(sources.map((s) => s.url)), [sources])
  const group = SOURCE_CATALOG.find((g) => g.domain === domain)!
  const countOf = (d: string) =>
    (SOURCE_CATALOG.find((g) => g.domain === d)?.sources ?? []).filter((e) => picked.has(e.url)).length

  const toggle = (e: CatalogEntry) => {
    setPicked((prev) => {
      const next = new Set(prev)
      if (next.has(e.url)) next.delete(e.url)
      else next.add(e.url)
      return next
    })
  }

  const importPicked = async () => {
    if (busy || picked.size === 0) return
    setBusy(true)
    try {
      const chosen = allSources.filter((e) => picked.has(e.url))
      const r = await importCatalog(chosen)
      onDone?.(r.imported > 0 ? `已导入 ${r.imported} 个信源（跳过 ${r.skipped} 个已存在）` : '所选信源都已导入过（按地址去重）')
    } catch (e) {
      // 失败必须显性反馈：静默的 unhandled rejection 用户只看到按钮复位，不知道没导进去
      onDone?.(`导入失败：${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="src-catalog" data-testid="source-catalog">
      <div className="src-catalog-domains" role="tablist" aria-label="信源领域">
        {SOURCE_CATALOG.map((g) => (
          <button
            key={g.domain}
            type="button"
            className={`chip${domain === g.domain ? ' on' : ''}`}
            role="tab"
            aria-selected={domain === g.domain}
            onClick={() => setDomain(g.domain)}
          >
            {DOMAIN_LABEL[g.domain]}
            <span className="tnum"> {countOf(g.domain)}/{g.sources.length}</span>
          </button>
        ))}
      </div>

      <div className="src-catalog-list" role="tabpanel" aria-label={DOMAIN_LABEL[domain]}>
        {group.sources.map((e) => (
          <label key={e.url} className="src-catalog-item">
            <input type="checkbox" checked={picked.has(e.url)} onChange={() => toggle(e)} />
            <span className="name">{e.name}</span>
            {importedUrls.has(e.url) && <span className="cat imported">已导入</span>}
            <span className="cat">{DOMAIN_LABEL[e.domain]}</span>
          </label>
        ))}
      </div>

      <div className="src-catalog-foot">
        <span className="sub">已选 {picked.size} 个 · 按地址去重，重复导入安全</span>
        <button type="button" className="btn-primary" disabled={busy || picked.size === 0} onClick={() => void importPicked()}>
          {busy ? '导入中…' : `导入所选 ${picked.size} 个`}
        </button>
      </div>
    </div>
  )
}
