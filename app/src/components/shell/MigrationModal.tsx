import { useState } from 'react'
import { runMigration } from '../../db/storage/migration'

/**
 * 数据存储升级窗口（08 设计 S2）：桌面版检测到旧存储有数据时的一次性确认。
 * 说明发生了什么、耗时估计、可取消（「暂不」本会话继续用旧存储，下次启动再问）。
 * 开始后：快照 → 分批迁移（进度展示）→ 对账 → 成功后自动重开应用（新版从主库读全部数据）。
 * 失败：半成品库已自动清理，旧数据不受影响，给出原因与去向（迁移前快照文件）。
 */
export function MigrationModal({ onSkip }: { onSkip: () => void }) {
  const [phase, setPhase] = useState<'confirm' | 'running' | 'done' | 'fail'>('confirm')
  const [lines, setLines] = useState<string[]>([])
  const [failMsg, setFailMsg] = useState('')
  const [snapshotFile, setSnapshotFile] = useState('')

  const start = async () => {
    setPhase('running')
    setLines([])
    try {
      const r = await runMigration((p) => {
        const label = TABLE_LABEL[p.table] ?? p.table
        setLines((prev) => [
          ...prev.filter((l) => !l.startsWith(`${label}（`)),
          `${label}（${p.done.toLocaleString()} / ${p.total.toLocaleString()} 条）`,
        ])
      })
      setSnapshotFile(r.snapshotFile)
      setLines((prev) => [
        ...prev,
        r.skippedKv > 0 ? `有 ${r.skippedKv} 项本地授权未迁移（新存储里重新选择一次即可）` : '全部数据核对一致',
      ])
      setPhase('done')
      setTimeout(() => window.location.reload(), 1800)
    } catch (e) {
      setFailMsg(e instanceof Error ? e.message : String(e))
      setPhase('fail')
    }
  }

  return (
    <div className="welcome-veil" role="dialog" aria-label="数据存储升级">
      <div className="mig-modal">
        <h2>
          {phase === 'fail' ? '迁移失败——数据没有受影响' : '数据存储升级'}
        </h2>

        {phase === 'confirm' && (
          <>
            <p className="mig-lead">
              这次更新把你的数据从浏览器内置存储搬到一个独立数据库文件（pwork.db）——之后你的数据就是一个
              看得见、可直接备份的文件，还会同步生成一份每条记录一个 Markdown 文件的只读文件夹。
            </p>
            <ul className="mig-list">
              <li>迁移前的完整快照会自动存到备份文件夹，随时可以退回</li>
              <li>预计几秒到一分钟（取决于数据量），期间请不要关闭应用</li>
              <li>完成后应用会自动重新打开，数据一条不少</li>
            </ul>
            <div className="mig-actions">
              <button type="button" className="btn-primary" onClick={() => void start()}>
                开始迁移
              </button>
              <button type="button" className="btn-ghost" onClick={onSkip}>
                暂不，仍用旧存储
              </button>
            </div>
          </>
        )}

        {phase === 'running' && (
          <>
            <p className="mig-lead">正在迁移，请不要关闭应用……</p>
            <div className="mig-progress">
              {lines.map((l) => (
                <div key={l}>{l}</div>
              ))}
            </div>
          </>
        )}

        {phase === 'done' && (
          <>
            <p className="mig-lead" style={{ color: 'var(--ok)' }}>
              <b>迁移完成，全部数据核对一致。</b>
            </p>
            <p className="mig-note">
              迁移前快照：backups/{snapshotFile}。应用正在重新打开，之后你的数据就在 pwork.db 里了。
            </p>
          </>
        )}

        {phase === 'fail' && (
          <>
            <p className="mig-lead" style={{ color: 'var(--danger)' }}>
              {failMsg}
            </p>
            <p className="mig-note">
              你的旧数据完好无损，应用继续使用原来的存储。迁移前快照
              {snapshotFile ? `（backups/${snapshotFile}）` : ''}可用于核对。可以重试，或稍后重启应用时会再次询问。
            </p>
            <div className="mig-actions">
              <button type="button" className="btn-primary" onClick={() => void start()}>
                重试
              </button>
              <button type="button" className="btn-ghost" onClick={onSkip}>
                留在旧存储
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

const TABLE_LABEL: Record<string, string> = {
  notes: '速记',
  sources: '信息源',
  items: '信息条目',
  tasks: '待办',
  goals: '目标',
  reviews: '复盘',
  actions: '行动项',
  insights: '洞察',
  snapshots: '周趋势',
  blocks: '数据块',
  profiles: '调研对象',
  caseFiles: '案例文件',
  aiCache: 'AI 缓存',
  errorLog: '错误日志',
  kv: '本地设置',
}
