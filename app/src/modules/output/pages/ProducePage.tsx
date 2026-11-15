import { useEffect, useState } from 'react'
import { useProduce, settleProduceJobs } from '../../../store/produce'

/**
 * 一键成稿页（2026-11-15 外部研读报告改动 1）：输入可选关注点 → 一次点击，
 * 三种产物（本周信息日报 / 演示 pptx / 文章草稿 docx+md）逐个生成、状态格实时可见。
 * 未配 AI 也能用（三层降级：周报纯数据、文章结构草稿、PPT 默认模板）；
 * 产物落下载文件夹；离开期间中断的任务下次进入时回收并汇报。
 */
export function ProducePage() {
  const { running, planTitle, tasks, notice, files, start } = useProduce()
  const [focus, setFocus] = useState('')
  useEffect(() => {
    void settleProduceJobs()
  }, [])

  return (
    <div className="set-card" style={{ maxWidth: 720 }}>
      <h2>一键成稿</h2>
      <div className="desc">
        一次点击，把近 7 天的速记与洞察整理成三种产物：本周信息日报（Markdown）、演示文稿（pptx）、文章草稿（docx 与
        Markdown），生成后自动下载。配了 AI 会先出一版标题与聚焦提示；没配 AI 也能生成（周报为纯数据版，文章与
        PPT 走结构草稿）。
      </div>
      <div className="set-body">
        <div className="set-row">
          <label>关注点</label>
          <input
            className="input"
            value={focus}
            placeholder="可选。比如：本周的增长实验、给团队看的复盘……"
            onChange={(e) => setFocus(e.target.value)}
            disabled={running}
            aria-label="关注点"
          />
        </div>
        <div className="set-row">
          <label>生成</label>
          <button type="button" className="btn-primary" disabled={running} onClick={() => void start(focus)} data-testid="produce-start">
            {running ? '生成中……' : '开始生成三种产物'}
          </button>
          <span className="val">产物保存到下载文件夹</span>
        </div>
      </div>

      {tasks.length > 0 && (
        <div className="set-body" data-testid="produce-tasks">
          {planTitle && <div className="p-group" style={{ marginBottom: 'var(--sp-1)' }}>{planTitle}</div>}
          {tasks.map((t) => (
            <div className="set-row" key={t.id} data-status={t.status}>
              <label>{t.title}</label>
              <span className="val">
                {t.status === 'pending' && '排队中'}
                {t.status === 'running' && '生成中……'}
                {t.status === 'done' && <>✓ 已下载 {t.fileName}</>}
                {t.status === 'failed' && <>✗ 失败：{t.error}</>}
              </span>
            </div>
          ))}
        </div>
      )}
      {notice && (
        <div className="notice" style={{ marginTop: 'var(--sp-2)' }} data-testid="produce-notice">
          {notice}
        </div>
      )}
      {files.length > 0 && (
        <div className="set-body">
          <div className="set-row">
            <label>产物清单</label>
            <span className="val">{files.join('、')}</span>
          </div>
        </div>
      )}
    </div>
  )
}
