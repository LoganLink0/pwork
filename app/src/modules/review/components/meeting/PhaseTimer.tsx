import { useEffect, useState } from 'react'

/**
 * 阶段计时器（课程 12 讲：整体时间不超，节奏可以变换）。
 * 倒计时归零后转入琥珀色超时提示，不强制中断。
 */
export function PhaseTimer({ minutes, label }: { minutes: number; label?: string }) {
  const [started, setStarted] = useState(false)
  const [elapsed, setElapsed] = useState(0)

  useEffect(() => {
    if (!started) return
    const t = setInterval(() => setElapsed((s) => s + 1), 1000)
    return () => clearInterval(t)
  }, [started])

  const total = minutes * 60
  const remain = total - elapsed
  const fmt = (s: number) => `${String(Math.floor(Math.abs(s) / 60)).padStart(2, '0')}:${String(Math.abs(s) % 60).padStart(2, '0')}`

  if (!started)
    return (
      <button className="btn-small" onClick={() => setStarted(true)} aria-label={label ? `开始${label}计时` : '开始计时'}>
        ⏱ 开始计时（建议 {minutes} 分钟）
      </button>
    )

  if (remain >= 0)
    return (
      <span className="timer tnum" role="timer" aria-label={label ? `${label}剩余时间` : '剩余时间'}>
        ⏱ {fmt(remain)}
      </span>
    )

  return (
    <span className="timer timer--over tnum" role="timer" aria-label={`${label ?? '本阶段'}已超时`}>
      ⏱ 超时 {fmt(remain)}——整体不超即可，节奏可以变换
    </span>
  )
}
