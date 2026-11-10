import { useEffect, useRef, useState } from 'react'
import { useNotes } from '../../store/notes'
import { useCollect } from '../../store/collect'
import { useTasks } from '../../store/tasks'
import { useGoals } from '../../store/goals'
import { wipeAndImport } from '../../db/backup'
import { confirmDialog } from '../../engine/confirm'
import {
  acknowledgeCurrentState,
  latestDesktopBackup,
  refreshReferenceAfterRestore,
  type GuardResult,
} from '../../engine/dbGuard'
import { tableLabel } from '../../db/tableLabels'
import { isDesktopApp } from '../../engine/platform'

/**
 * 主库突变守卫恢复窗口（2026-11-10 定稿设计）：启动比对发现某类数据骤减 95% 以上时
 * 全屏弹出——先隔离现状（守卫引擎在触发时已做），这里给两条明路：从备份一键恢复（桌面版
 * 自动找最近一份自动备份；网页版选备份文件），或确认数据没丢保留现状。没有第三条路——
 * 数据丢失级别的决定必须显式做出，Esc 与遮罩都关不掉它。
 */
export function DbGuardModal({ result, onKeep }: { result: GuardResult; onKeep: () => void }) {
  const [phase, setPhase] = useState<'info' | 'restoring' | 'done' | 'fail'>('info')
  const [failMsg, setFailMsg] = useState('')
  // 桌面版：找 backups/ 里最新的自动备份（undefined=还在找；null=没找到；网页版恒 null）
  const [latest, setLatest] = useState<{ name: string; text: string } | null | undefined>(() => (isDesktopApp() ? undefined : null))
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!isDesktopApp()) return
    void latestDesktopBackup().then(setLatest)
  }, [])

  const keep = () => {
    void acknowledgeCurrentState(result.counts).finally(onKeep)
  }

  const restore = async (text: string) => {
    if (phase === 'restoring') return
    const ok = await confirmDialog({
      title: '确认用这份备份恢复？',
      body: '恢复会先清空当前数据，再把备份内容完整导回。当前状态已另存隔离副本，恢复错了也能再回来。',
      danger: true,
      confirmLabel: '开始恢复',
    })
    if (!ok) return
    setPhase('restoring')
    try {
      await wipeAndImport(text)
      await Promise.all([useNotes.getState().load(), useCollect.getState().load(), useTasks.getState().load(), useGoals.getState().load()])
      await refreshReferenceAfterRestore()
      setPhase('done')
      setTimeout(() => window.location.reload(), 1800)
    } catch (e) {
      setFailMsg(e instanceof Error ? e.message : String(e))
      setPhase('fail')
    }
  }

  return (
    <div className="welcome-veil mig-veil" role="presentation">
      <div className="mig-modal guard-modal" role="alertdialog" aria-modal="true" aria-label="数据大幅减少提醒">
        {phase === 'info' && (
          <>
            <h2>数据量突然大幅减少</h2>
            <p className="mig-lead">启动检查发现，下面这些数据比上次使用时少了 95% 以上：</p>
            <div className="guard-drops">
              {result.triggers.map((t) => (
                <div key={t.table}>
                  {tableLabel(t.table)}：<b>{t.prev.toLocaleString()} 条 → {t.cur.toLocaleString()} 条</b>
                </div>
              ))}
            </div>
            <p className="guard-quo">
              这可能是更新安装过程中的意外，也可能是一次有意的批量清理。减少后剩下的数据已完整保存了一份副本
              （{result.quarantine
                ? result.quarantine.where === 'file'
                  ? `备份文件夹里的 ${result.quarantine.fileName}`
                  : '应用本地存储里'
                : '——保存失败，请先在下方用备份恢复，不要继续使用'}），
              恢复或保留现状都不会丢这份副本。
            </p>
            <div className="mig-actions">
              {latest !== null && (
                <button
                  type="button"
                  className="btn-primary"
                  data-testid="guard-restore-latest"
                  disabled={latest === undefined}
                  onClick={() => latest && void restore(latest.text)}
                >
                  {latest === undefined ? '正在查找备份…' : `从最近备份恢复（${latest.name}）`}
                </button>
              )}
              <button type="button" className="btn-primary" data-testid="guard-restore-file" onClick={() => fileRef.current?.click()}>
                选择备份文件恢复
              </button>
              <button type="button" className="btn-ghost" data-testid="guard-keep" onClick={keep}>
                数据没丢，是我自己清理的，保留现状
              </button>
              <input
                ref={fileRef}
                className="guard-file"
                type="file"
                accept=".json,application/json"
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (f) void f.text().then((t) => void restore(t))
                  e.target.value = ''
                }}
              />
            </div>
          </>
        )}

        {phase === 'restoring' && <p className="mig-lead">正在恢复，请不要关闭应用……</p>}

        {phase === 'done' && (
          <p className="mig-lead" style={{ color: 'var(--ok)' }}>
            <b>恢复完成，应用正在重新打开。</b>
          </p>
        )}

        {phase === 'fail' && (
          <>
            <h2>恢复失败——当前数据没有被动过</h2>
            <p className="mig-lead" style={{ color: 'var(--danger)' }}>{failMsg}</p>
            <p className="guard-quo">备份文件可能损坏或不是本应用的备份格式。可以换一份备份文件再试。</p>
            <div className="mig-actions">
              <button type="button" className="btn-primary" onClick={() => fileRef.current?.click()}>
                换一份备份文件
              </button>
              <button type="button" className="btn-ghost" onClick={keep}>
                暂时保留现状
              </button>
              <input
                ref={fileRef}
                className="guard-file"
                type="file"
                accept=".json,application/json"
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (f) void f.text().then((t) => void restore(t))
                  e.target.value = ''
                }}
              />
            </div>
          </>
        )}
      </div>
    </div>
  )
}
