import { useEffect, useMemo, useState } from 'react'
import { marked } from 'marked'
import DOMPurify from 'dompurify'
import { useProduce } from '../../../store/produce'
import { downloadFile } from '../../../db/repo'
import { toast } from '../../../engine/toast'
import { articleToMarkdown, exportArticleDocx, type ArticleDraft } from '../engine/articleWriter'
import { exportWriterPptx } from '../engine/pptWriter'

/**
 * 一键成稿页（2026-11-15 外部研读报告改动 1 · v2）：一次 LLM 调用统一产出三产物，
 * 页内卡片预览（Markdown 渲染）——用户先看内容再决定导出，不再直接落盘下载
 * （v1 的"生成即下载、内容没看过"被用户否决，推倒重做）。
 * 每卡带复制与导出按钮（导出复用既有引擎：周报 md / 文章 docx+md / 演示 pptx）。
 * 未配 AI 也能生成（纯数据周报、结构草稿、默认模板）。
 */
export function ProducePage() {
  const { running, title, assets, notice, start } = useProduce()
  const [focus, setFocus] = useState('')
  useEffect(() => {
    void useProduce.getState().settle()
  }, [])

  return (
    <div style={{ maxWidth: 780 }}>
      <div className="set-card">
        <h2>一键成稿</h2>
        <div className="desc">
          把近 7 天的速记与洞察统一整理成三种产物：本周信息日报、演示大纲、文章草稿——先在页内预览，
          满意再复制或导出。配了 AI 出完整成稿；没配 AI 生成结构草稿。
        </div>
        <div className="set-body">
          <div className="set-row">
            <label>关注点</label>
            <input
              className="input"
              value={focus}
              placeholder="可选。比如：本周的增长实验、给团队的复盘……"
              onChange={(e) => setFocus(e.target.value)}
              disabled={running}
              aria-label="关注点"
            />
          </div>
          <div className="set-row">
            <label>生成</label>
            <button type="button" className="btn-primary" disabled={running} onClick={() => void start(focus)} data-testid="produce-start">
              {running ? '生成中……（约 1 分钟）' : '生成三种产物'}
            </button>
          </div>
        </div>
        {notice && (
          <div className="notice" style={{ marginTop: 'var(--sp-2)' }}>
            {notice}
          </div>
        )}
      </div>

      {assets && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-3)', marginTop: 'var(--sp-3)' }} data-testid="produce-assets">
          <h2 style={{ fontSize: 'var(--fs-lg)' }}>{title || '成稿产物'}</h2>

          <AssetCard
            testid="asset-weekly"
            icon="barChart"
            name="本周信息日报"
            format="Markdown"
            copyText={assets.weeklyMd}
            onExport={() => {
              downloadFile(`${assets.title}-周报.md`, assets.weeklyMd, 'text/markdown')
              toast('ok', '周报 Markdown 已下载')
            }}
            html={renderMd(assets.weeklyMd)}
          />

          <AssetCard
            testid="asset-article"
            icon="pen"
            name="文章草稿"
            format="可复制 · 导出 docx/md"
            copyText={articleToMarkdown(assets.article)}
            onExport={async () => {
              const name = await exportArticleDocx(assets.article)
              downloadFile(`${assets.article.title}.md`, articleToMarkdown(assets.article), 'text/markdown')
              toast('ok', `已下载 ${name} 与配套 Markdown`)
            }}
            html={renderArticle(assets.article)}
          />

          <AssetCard
            testid="asset-ppt"
            icon="grid"
            name="演示大纲"
            format="导出 pptx"
            copyText={outlineToText(assets.ppt)}
            onExport={async () => {
              const name = await exportWriterPptx(assets.ppt)
              toast('ok', `已下载 ${name}`)
            }}
            html={renderPpt(assets.ppt)}
          />
        </div>
      )}
    </div>
  )
}

function renderMd(md: string): string {
  return DOMPurify.sanitize(marked.parse(md, { async: false }))
}

function renderArticle(d: ArticleDraft): string {
  const esc = (s: string) => DOMPurify.sanitize(s)
  const secs = d.sections
    .map((s) => `<h3>${esc(s.heading)}</h3>${s.body.split(/\n\n+/).map((p) => `<p>${esc(p)}</p>`).join('')}`)
    .join('')
  return `<h2>${esc(d.title)}</h2><p>${esc(d.intro)}</p>${secs}`
}

function renderPpt(o: { title: string; slides: Array<{ layout: string; title: string; bullets?: string[] }> }): string {
  const esc = (s: string) => DOMPurify.sanitize(s)
  return o.slides
    .map((s) => `<div style="margin-bottom:var(--sp-2)"><b>${esc(s.title)}</b>${s.bullets?.length ? `<ul style="margin:4px 0 0 1em">${s.bullets.map((b) => `<li>${esc(b)}</li>`).join('')}</ul>` : ''}</div>`)
    .join('')
}

function outlineToText(o: { title: string; slides: Array<{ title: string; bullets?: string[] }> }): string {
  return o.slides.map((s) => `## ${s.title}${s.bullets?.length ? `\n${s.bullets.map((b) => `- ${b}`).join('\n')}` : ''}`).join('\n\n')
}

function AssetCard(opts: {
  testid: string
  icon: string
  name: string
  format: string
  copyText: string
  onExport: () => void | Promise<void>
  html: string
}) {
  const [busy, setBusy] = useState(false)
  const html = useMemo(() => opts.html, [opts.html])
  return (
    <div className="set-card" data-testid={opts.testid}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-2)' }}>
        <h2 style={{ margin: 0, fontSize: 'var(--fs-md)' }}>{opts.name}</h2>
        <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--ink-faint)' }}>{opts.format}</span>
        <span style={{ marginLeft: 'auto', display: 'flex', gap: 'var(--sp-2)' }}>
          <button
            type="button"
            className="btn-ghost"
            onClick={() => {
              void navigator.clipboard.writeText(opts.copyText).then(() => toast('ok', '已复制全文'))
            }}
          >
            复制全文
          </button>
          <button
            type="button"
            className="btn-ghost"
            disabled={busy}
            onClick={() => {
              setBusy(true)
              void Promise.resolve(opts.onExport()).finally(() => setBusy(false))
            }}
          >
            {busy ? '导出中…' : '导出'}
          </button>
        </span>
      </div>
      <div
        className="md-body"
        style={{ maxHeight: 320, overflow: 'auto', fontSize: 'var(--fs-sm)', marginTop: 'var(--sp-2)', paddingTop: 'var(--sp-2)', borderTop: '1px solid var(--line)' }}
        // 产物内容经 DOMPurify 清洗后展示
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  )
}
