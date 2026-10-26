import { useRef, useState } from 'react'

/** ffmpeg 转换预设（音频 / 视频共用一个通用转换 UI） */
export interface ConvertPreset {
  accept: string
  sizeHint: string
  outputs: {
    label: string
    ext: string
    args: string[]
  }[]
}

export const AUDIO_PRESET: ConvertPreset = {
  accept: 'audio/*',
  sizeHint: '建议单文件 ≤100MB',
  outputs: [
    { label: '转 MP3（128k，通用）', ext: 'mp3', args: ['-vn', '-c:a', 'libmp3lame', '-b:a', '128k'] },
    { label: '转 WAV（无损）', ext: 'wav', args: ['-vn', '-c:a', 'pcm_s16le'] },
    { label: '转 M4A（体积小）', ext: 'm4a', args: ['-vn', '-c:a', 'aac', '-b:a', '128k'] },
  ],
}

export const VIDEO_PRESET: ConvertPreset = {
  accept: 'video/*',
  sizeHint: 'wasm 软编码，建议短视频（≤5 分钟或 ≤100MB）',
  outputs: [
    { label: '压缩为 MP4', ext: 'mp4', args: ['-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '28', '-c:a', 'aac'] },
    { label: '转 WebM', ext: 'webm', args: ['-c:v', 'libvpx', '-b:v', '1M', '-c:a', 'libvorbis'] },
    { label: '提取音频 MP3', ext: 'mp3', args: ['-vn', '-c:a', 'libmp3lame', '-b:a', '192k'] },
    { label: '转 GIF（前 10 秒 · 480p）', ext: 'gif', args: ['-t', '10', '-r', '10', '-vf', 'scale=480:-1'] },
  ],
}

interface ConvertState {
  stage: 'idle' | 'loading' | 'running' | 'done' | 'error'
  progress: number
  logTail: string
  errorMsg: string
  resultUrl: string | null
  resultSize: number
  outputName: string
}

/** FFmpeg 通用转换工具（音频/视频），本地处理不上传 */
export function ConvertTool({ preset, kindLabel }: { preset: ConvertPreset; kindLabel: string }) {
  const [file, setFile] = useState<File | null>(null)
  const [outIdx, setOutIdx] = useState(0)
  const [state, setState] = useState<ConvertState>({
    stage: 'idle',
    progress: 0,
    logTail: '',
    errorMsg: '',
    resultUrl: null,
    resultSize: 0,
    outputName: '',
  })
  const prevUrl = useRef<string | null>(null)

  const onFile = (f: File | undefined) => {
    if (!f) return
    setFile(f)
    if (state.resultUrl) URL.revokeObjectURL(state.resultUrl)
    setState({ stage: 'idle', progress: 0, logTail: '', errorMsg: '', resultUrl: null, resultSize: 0, outputName: '' })
  }

  const convert = async () => {
    if (!file || state.stage === 'loading' || state.stage === 'running') return
    const out = preset.outputs[outIdx]!
    const outputName = `output.${out.ext}`
    setState({ stage: 'loading', progress: 0, logTail: '加载本地引擎（首次约 30MB，一次即可）…', errorMsg: '', resultUrl: null, resultSize: 0, outputName: '' })
    try {
      const { convert: runConvert, toDownloadUrl } = await import('../../engine/ffmpegClient')
      const { data, mime } = await runConvert(
        {
          onProgress: (ratio) => setState((s) => ({ ...s, stage: 'running', progress: ratio })),
          onLog: (m) => setState((s) => ({ ...s, logTail: m.slice(0, 120) })),
        },
        file,
        'input' + (file.name.match(/\.[a-z0-9]+/i)?.[0] ?? '.bin'),
        outputName,
        out.args,
      )
      if (prevUrl.current) URL.revokeObjectURL(prevUrl.current)
      const url = toDownloadUrl(data, mime)
      prevUrl.current = url
      setState({ stage: 'done', progress: 1, logTail: '', errorMsg: '', resultUrl: url, resultSize: data.length, outputName })
    } catch (e) {
      setState({ stage: 'error', progress: 0, logTail: '', errorMsg: e instanceof Error ? e.message : String(e), resultUrl: null, resultSize: 0, outputName: '' })
    }
  }

  const busy = state.stage === 'loading' || state.stage === 'running'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-3)' }}>
      <div className="set-row">
        <label>选择{kindLabel}</label>
        <input type="file" accept={preset.accept} onChange={(e) => onFile(e.target.files?.[0])} aria-label={`选择${kindLabel}文件`} />
      </div>
      {file && (
        <div className="set-row">
          <label>目标格式</label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: 1 }}>
            {preset.outputs.map((o, i) => (
              <label key={o.ext + i} style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 'var(--fs-sm)', cursor: 'pointer' }}>
                <input type="radio" name="conv-out" checked={outIdx === i} onChange={() => setOutIdx(i)} />
                {o.label}
              </label>
            ))}
          </div>
        </div>
      )}
      <div className="set-row">
        <button type="button" className="btn-primary" disabled={!file || busy} onClick={() => void convert()} data-testid="convert-btn">
          {state.stage === 'loading' ? '加载引擎…' : state.stage === 'running' ? '转换中…' : '开始转换'}
        </button>
        <span className="val" style={{ color: 'var(--ink-faint)', fontSize: 'var(--fs-xs)' }}>{preset.sizeHint} · 本地处理，文件不上传</span>
      </div>
      {busy && (
        <div className="set-row">
          <progress value={state.progress} max={1} style={{ flex: 1 }} />
          <span className="val tnum">{Math.round(state.progress * 100)}%</span>
        </div>
      )}
      {busy && state.logTail && (
        <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--ink-faint)', fontFamily: 'ui-monospace, monospace', wordBreak: 'break-all' }}>
          {state.logTail}
        </div>
      )}
      {state.stage === 'error' && (
        <div className="notice" style={{ borderLeftColor: 'var(--danger)' }} role="alert">
          转换失败：{state.errorMsg}（引擎在应用内，无需联网；大文件易失败，先试小文件）
        </div>
      )}
      {state.stage === 'done' && state.resultUrl && (
        <div className="notice">
          <b>{state.outputName}</b>（{state.resultSize < 1024 * 1024 ? `${(state.resultSize / 1024).toFixed(0)} KB` : `${(state.resultSize / 1024 / 1024).toFixed(1)} MB`}）　
          <a href={state.resultUrl} download={state.outputName} className="btn-ghost" style={{ textDecoration: 'none' }}></a>
        </div>
      )}
    </div>
  )
}
