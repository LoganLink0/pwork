import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { fetchVideoMeta, type VideoMeta } from '../../engine/ytdlp'
import { isDesktopApp } from '../../engine/platform'
import { useCollect } from '../../store/collect'

/**
 * 视频链接入库（C 路线·链接捕获）：粘贴视频链接 → 本机 yt-dlp 解析标题/作者/简介
 * → 确认后经采集管线入库（跳过预筛——手动捕获即用户明确意图，评分照常）。
 * 打开时自动读剪贴板预填（与剪贴板速记同一授权模型）；仅桌面版。
 */
export function CaptureTool() {
  const captureLink = useCollect((s) => s.captureLink)
  const [link, setLink] = useState('')
  const [busy, setBusy] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [meta, setMeta] = useState<VideoMeta | null>(null)
  const [doneMsg, setDoneMsg] = useState('')

  useEffect(() => {
    // 首次进入自动预填剪贴板：多数场景是「别处刚复制了链接」。读失败静默（授权未给/剪贴板空）
    void navigator.clipboard
      .readText()
      .then((t) => {
        const s = t.trim()
        if (/^https?:\/\//i.test(s)) setLink(s)
      })
      .catch(() => {})
  }, [])

  if (!isDesktopApp()) {
    return (
      <p style={{ color: 'var(--ink-soft)', fontSize: 'var(--fs-sm)' }}>
        视频链接入库需要本机 yt-dlp 解析，仅桌面版可用——网页版请直接把链接存为速记：
        <Link to="/input/notes" style={{ marginLeft: 6 }}>去速记 →</Link>
      </p>
    )
  }

  const parse = async () => {
    const url = link.trim()
    setError('')
    setDoneMsg('')
    setMeta(null)
    if (!/^https?:\/\//i.test(url)) {
      setError('请先粘贴一个 http/https 开头的视频链接')
      return
    }
    setBusy(true)
    const r = await fetchVideoMeta(url)
    setBusy(false)
    if (!r.ok || !r.meta) {
      setError(r.error ?? '解析失败——确认链接有效且本机 yt-dlp 可用')
      return
    }
    setMeta(r.meta)
  }

  const save = async () => {
    if (!meta) return
    setSaving(true)
    setError('')
    // try/finally 兜底（盲审 P1：写库 reject 时按钮永久卡「入库中…」且无提示）
    try {
      const r = await captureLink(meta)
      if (!r.ok) {
        setError(r.duplicated ? '这个链接已经在条目库里了（按链接与标题去重）' : r.error ?? '入库失败')
        return
      }
      setDoneMsg('已存入条目库——可在条目库检索、投票，当日评分靠前会进信息日报')
      setMeta(null)
      setLink('')
    } catch (e) {
      setError(`入库失败：${e instanceof Error ? e.message : String(e)}——可到错误日志看详情`)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-3)' }}>
      <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        视频链接
        <textarea
          className="input"
          rows={2}
          value={link}
          placeholder="粘贴视频页面链接（B站 / YouTube / 抖音 等）"
          onChange={(e) => setLink(e.target.value)}
        />
      </label>
      <div style={{ display: 'flex', gap: 'var(--sp-2)', alignItems: 'center' }}>
        <button type="button" className="btn-primary" disabled={busy || !link.trim()} onClick={() => void parse()}>
          {busy ? '解析中…' : '解析'}
        </button>
        {meta && (
          <button type="button" className="btn-primary" disabled={saving} onClick={() => void save()}>
            {saving ? '入库中…' : '确认存入条目库'}
          </button>
        )}
        {busy && <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--ink-soft)' }}>调本机 yt-dlp，最长 30 秒</span>}
      </div>
      {error && <div style={{ color: 'var(--danger)', fontSize: 'var(--fs-sm)' }}>{error}</div>}
      {meta && (
        <div className="mig-progress" style={{ fontFamily: 'inherit' }}>
          <div><b>{meta.title}</b></div>
          {meta.author && <div style={{ marginTop: 4 }}>作者：{meta.author}</div>}
          {meta.description && (
            <div style={{ marginTop: 4, color: 'var(--ink-soft)' }}>
              {meta.description.length > 200 ? `${meta.description.slice(0, 200)}…` : meta.description}
            </div>
          )}
          <div style={{ marginTop: 6, fontSize: 12, color: 'var(--ink-faint)' }}>{meta.url}</div>
        </div>
      )}
      {doneMsg && <div style={{ color: 'var(--ok)', fontSize: 'var(--fs-sm)' }}>{doneMsg}</div>}
    </div>
  )
}
