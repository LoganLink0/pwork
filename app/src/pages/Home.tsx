import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { MODULE_NAV, MODULE_STATUS_LABEL } from '../content/nav'
import { useUi } from '../store/ui'
import { useNotes, todayNoteCount } from '../store/notes'
import { useCollect } from '../store/collect'
import { useTasks } from '../store/tasks'
import { useBlocks } from '../store/blocks'
import { greetWord, relTime, weekdayLocal } from '../engine/datetime'
import { gatherSignals, type Signal } from '../engine/signals'
import { db } from '../db/schema'
import { shouldRemindBackup, snoozeBackupReminder, getSnoozeDate } from '../engine/backupReminder'

/** 输入模块卡的直达行（三通道：速记 = 我想到的；信源 = 网上来的；外部数据 = 从别的系统带来的） */
function InputCardLinks({ noteCount, sourceCount, digestCount, blockCount }: { noteCount: number; sourceCount: number; digestCount: number; blockCount: number }) {
  return (
    <div className="m-links">
      <Link className="m-link" to="/input/notes">
        速记<span className="cnt">{noteCount} 条</span>
      </Link>
      <Link className="m-link" to="/input/digest">
        信息日报<span className="cnt">{digestCount > 0 ? `${digestCount} 条` : sourceCount > 0 ? '去抓取' : '可用'}</span>
      </Link>
      <Link className="m-link" to="/input/sources">
        信源<span className="cnt">{sourceCount} 个</span>
      </Link>
      <Link className="m-link" to="/input/blocks">
        外部数据<span className="cnt">{blockCount > 0 ? `${blockCount} 块` : '＋'}</span>
      </Link>
    </div>
  )
}

function ReviewCardLinks({ count }: { count: number }) {
  return (
    <div className="m-links">
      <Link className="m-link" to="/review">
        复盘档案<span className="cnt">{count > 0 ? `${count} 份` : '空'}</span>
      </Link>
      <Link className="m-link" to="/review/new">
        新建复盘<span className="cnt">开始 →</span>
      </Link>
      <Link className="m-link" to="/review/assets">
        认知资产<span className="cnt">查看 →</span>
      </Link>
    </div>
  )
}

/** 首页「今日」（PRD §4.2）：摘要瓦片 = 闭环状态一览；模块卡片 = 四模块直达 */
export function Home() {
  const openQuick = useUi((s) => s.openQuick)
  const notes = useNotes((s) => s.notes)
  const blockCount = useBlocks((s) => s.blocks.length)
  const importRecommended = useCollect((s) => s.importRecommended)
  const [importMsg, setImportMsg] = useState<string | null>(null)
  const loaded = useNotes((s) => s.loaded)
  const digest = useCollect((s) => s.digest)
  const sources = useCollect((s) => s.sources)
  const config = useCollect((s) => s.config)
  const runFetchAll = useCollect((s) => s.runFetchAll)
  const taskStats = useTasks((s) => s.stats)
  const [reviewInfo, setReviewInfo] = useState<{ count: number; lastAt: string | null } | null>(null)
  const [signals, setSignals] = useState<Signal[]>([])
  const [backupWarn, setBackupWarn] = useState(false)
  const now = new Date()
  const today = todayNoteCount(notes, now)
  const recent = notes.slice(0, 3)
  const activeSources = sources.filter((s) => s.active).length

  // 复盘节奏 + 信号（W5 信号触发，03 §4）：挂载时装配一次
  useEffect(() => {
    void (async () => {
      const [last, count, sig] = await Promise.all([
        db.reviews.orderBy('createdAt').reverse().limit(1).toArray(),
        db.reviews.count(),
        gatherSignals(now),
      ])
      setReviewInfo({ count, lastAt: last[0]?.createdAt ?? null })
      setSignals(sig)
      setBackupWarn(shouldRemindBackup(localStorage.getItem('pwork-last-backup'), getSnoozeDate(), now))
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 装配一次即可
  }, [])

  const input = MODULE_NAV.find((m) => m.key === 'input')!
  const process = MODULE_NAV.find((m) => m.key === 'process')!
  const output = MODULE_NAV.find((m) => m.key === 'output')!
  const review = MODULE_NAV.find((m) => m.key === 'review')!

  return (
    <section>
      <div className="greet-row">
        <div className="greet">
          <div className="date">
            {now.getMonth() + 1}月{now.getDate()}日 · 周{weekdayLocal(now)}
          </div>
          <h1>{greetWord(now)}。</h1>
          <p className="lede">
            {today > 0 ? `今天已记 ${today} 条速记。` : '今天还没记速记——想到什么，随手记下来。'}
          </p>
        </div>
        <button type="button" className="btn-primary" onClick={openQuick}>
          ⚡ 记一条
        </button>
      </div>

      {activeSources === 0 && (
        <div className="run-banner" style={{ marginBottom: 'var(--sp-4)' }} role="status" data-testid="sources-reminder">
          📰 还没有添加信源——可一键导入 13 个按主题精选、实测可达的推荐信源（AI / 云计算 / 架构 / 数据治理 / PM / 政策）。
          <button
            type="button"
            className="mini-btn"
            style={{ marginLeft: 'var(--sp-2)', fontWeight: 600 }}
            data-testid="import-recommended"
            onClick={() => {
              setImportMsg(null)
              void importRecommended().then((r) => {
                setImportMsg(`已导入 ${r.imported} 个信源（跳过 ${r.skipped} 个已存在）。去「信息日报」点⟳立即抓取试试。`)
              })
            }}
          >
            ⬇ 一键导入推荐信源
          </button>
          <Link to="/input/sources" style={{ marginLeft: 'var(--sp-2)' }}>去信源管理 →</Link>
          {importMsg && <div style={{ marginTop: 'var(--sp-1)', fontSize: 'var(--fs-xs)' }}>{importMsg}</div>}
        </div>
      )}
      {backupWarn && (
        <div className="run-banner" style={{ marginBottom: 'var(--sp-4)' }} role="status" data-testid="backup-reminder">
          ⏳ 距上次全量备份已超过 30 天——本地优先应用，备份是唯一的安全网。
          <Link to="/settings" style={{ marginLeft: 'var(--sp-2)', fontWeight: 600 }}>去导出 →</Link>
          <button
            type="button"
            className="text-btn"
            style={{ marginLeft: 'var(--sp-2)' }}
            onClick={() => {
              snoozeBackupReminder()
              setBackupWarn(false)
            }}
          >
            暂缓 7 天
          </button>
        </div>
      )}

      {/* 三瓦片按 PRD §4.2：Digest 已随 W2 点亮；待办/复盘为引导态，随 W3 点亮 */}
      <div className="tiles">
      {digest.length > 0 ? (
        <Link to="/input/digest" className="tile mark-input">
          <div className="t-label">信息日报</div>
          <div className="t-num">{digest.length} 条 · 2 分钟</div>
          <div className="t-sub">每天最多 {config.topN} 条 · 规则评分（云端 AI 两级筛选随同步并入）</div>
          <span className="t-link">去扫读 →</span>
        </Link>
      ) : (
        <Link
          to="/input/digest"
          className={`tile ${activeSources > 0 ? '' : 'quiet '}mark-input`}
          onClick={(e) => { if (activeSources > 0) { e.preventDefault(); void runFetchAll() } }}
        >
          <div className="t-label">信息日报</div>
          <div className="t-num weak">{activeSources > 0 ? '待抓取' : '还没有信源'}</div>
          <div className="t-sub">{activeSources > 0 ? `${activeSources} 个活跃源 · 点击立即抓取` : '先去信源管理添加 5–10 个源'}</div>
          <span className="t-link">{activeSources > 0 ? '立即抓取 →' : '去添加信源 →'}</span>
        </Link>
      )}
        {taskStats.total > 0 ? (
          <Link to="/tasks" className="tile mark-workspace">
            <div className="t-label">到期待办</div>
            <div className="t-num">{taskStats.today > 0 ? `${taskStats.today} 件今天` : `本周 ${taskStats.week} 件`}</div>
            <div className="t-sub">共 {taskStats.open} 件没做完</div>
            <span className="t-link">去处理 →</span>
          </Link>
        ) : (
          <Link to="/review/new" className="tile quiet mark-workspace">
            <div className="t-label">到期待办</div>
            <div className="t-num weak">还没有任务</div>
            <div className="t-sub">复盘产出的行动项会自动出现在任务库</div>
            <span className="t-link">去做一次复盘 →</span>
          </Link>
        )}
        {reviewInfo && reviewInfo.count > 0 ? (
          <Link to={signals.length > 0 ? '/review/new' : '/review'} className="tile mark-review">
            <div className="t-label">复盘节奏</div>
            <div className="t-num">
              {reviewInfo.lastAt
                ? `距上次 ${Math.max(0, Math.floor((Date.now() - new Date(reviewInfo.lastAt).getTime()) / 86_400_000))} 天`
                : `${reviewInfo.count} 份档案`}
            </div>
            <div className="t-sub">
              {signals.length > 0 ? `⚡ ${signals[0]!.message}` : `${reviewInfo.count} 份档案 · 节奏保持中`}
            </div>
            <span className={`t-link${signals.length > 0 ? ' hot' : ''}`}>
              {signals.length > 0 ? '开始复盘 →' : '看复盘档案 →'}
            </span>
          </Link>
        ) : (
          <Link to="/review" className="tile quiet mark-review">
            <div className="t-label">复盘节奏</div>
            <div className="t-num weak">已建成</div>
            <div className="t-sub">复盘工作台已迁入 · 做一次复盘，行动项自动进待办</div>
            <span className="t-link">了解回路模块 →</span>
          </Link>
        )}
      </div>

      <div className="sec-title">模块</div>
      <div className="module-grid">
        <div className={`mcard ${input.mark}`}>
          <div className="m-head">
            <span className="m-ico" aria-hidden>{input.icon}</span>
            <span className="m-name">{input.label}</span>
            <span className="m-tag">{MODULE_STATUS_LABEL[input.status]}</span>
          </div>
          <div className="m-sub">捕获想法，进入后续处理</div>
          <InputCardLinks noteCount={notes.length} sourceCount={activeSources} digestCount={digest.length} blockCount={blockCount} />
        </div>

        <Link to={process.to ?? '/'} className={`mcard ${process.mark}`}>
          <div className="m-head">
            <span className="m-ico" aria-hidden>{process.icon}</span>
            <span className="m-name">{process.label}</span>
            <span className="m-tag">{MODULE_STATUS_LABEL[process.status]}</span>
          </div>
          <div className="m-sub">工具箱 · AI 问答</div>
          <div className="m-links">
            <div className="m-link">工具箱<span className="cnt">文字/音频/图片/视频/专题</span></div>
            <div className="m-link">AI 问答<span className="cnt">→</span></div>
          </div>
        </Link>

        <Link to={output.to ?? '/output'} className={`mcard ${output.mark}`}>
          <div className="m-head">
            <span className="m-ico" aria-hidden>{output.icon}</span>
            <span className="m-name">{output.label}</span>
            <span className="m-tag">{MODULE_STATUS_LABEL[output.status]}</span>
          </div>
          <div className="m-sub">周期成稿 · 听觉 · 分享</div>
          <div className="m-links">
            <div className="m-link">HTML/PPT 导出<span className="cnt">→</span></div>
            <div className="m-link">朗读音频<span className="cnt">→</span></div>
          </div>
        </Link>

        <div className={`mcard ${review.mark}`}>
          <div className="m-head">
            <span className="m-ico" aria-hidden>{review.icon}</span>
            <span className="m-name">{review.label}</span>
            <span className="m-tag">{MODULE_STATUS_LABEL[review.status]}</span>
          </div>
          <div className="m-sub">CLAP 复盘 · 因果循环 · 认知资产</div>
          <ReviewCardLinks count={reviewInfo?.count ?? 0} />
        </div>
      </div>

      {loaded && recent.length > 0 && (
        <>
          <div className="sec-title" style={{ marginTop: 'var(--sp-6)' }}>最近速记</div>
          <div className="note-list" style={{ maxWidth: 560 }}>
            {recent.map((n) => (
              <Link key={n.id} to={`/input/notes/${n.id}`} className="note-item">
                <div className="n-time">{relTime(n.updatedAt)}</div>
                <div className="n-title">{n.title || '（无标题）'}</div>
                <div className="n-meta">{n.tags.length ? n.tags.map((t) => `#${t}`).join(' ') : '无标签'}</div>
              </Link>
            ))}
          </div>
        </>
      )}
    </section>
  )
}
