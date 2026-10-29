/** ffmpeg 转换预设（音频 / 视频共用一个通用转换 UI）：数据与组件分离，fast-refresh 友好 */

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
