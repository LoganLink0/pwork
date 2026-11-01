//! yt-dlp 信源适配器（信源主动识别·yt-dlp 路线）：调用本机 yt-dlp 拉取平台投稿清单。
//! 只取清单不下载视频：--flat-playlist --dump-single-json 输出 entries（标题/链接），
//! 交由前端复用既有评分管线。进程级安全：参数数组传递不经 shell（无注入面）；
//! 30 秒看门狗——yt-dlp 偶发网络悬挂不能拖死抓取循环（迁移挂起的同型教训）。

use std::io::Read;
use std::process::{Command, Stdio};
use std::time::{Duration, Instant};

const TIMEOUT_SECS: u64 = 30;
const MAX_ENTRIES: usize = 30;
const MAX_STDOUT: usize = 8 * 1024 * 1024;

/// 带看门狗地运行 yt-dlp 并收集 stdout。Command 以参数数组构建（调用方保证），
/// 超时即 kill 子进程并返回人话错误。
fn run_ytdlp(args: &[&str], timeout: Duration) -> Result<String, String> {
  let mut child = Command::new("yt-dlp")
    .args(args)
    .stdout(Stdio::piped())
    .stderr(Stdio::null())
    .spawn()
    .map_err(|e| format!("启动 yt-dlp 失败：{e}——确认已安装（pip install yt-dlp）并在 PATH 中"))?;
  let started = Instant::now();
  loop {
    match child.try_wait().map_err(|e| format!("yt-dlp 进程状态读取失败：{e}"))? {
      Some(status) if status.success() => break,
      Some(_) => {
        return Err("yt-dlp 运行失败（退出码非 0）——检查地址是否有效、yt-dlp 版本是否过旧（yt-dlp -U 可自更新）".into());
      }
      None if started.elapsed() > timeout => {
        let _ = child.kill();
        return Err(format!("yt-dlp 超过 {} 秒无响应，已中止", timeout.as_secs()));
      }
      None => std::thread::sleep(Duration::from_millis(150)),
    }
  }
  let out = child.stdout.take().ok_or("无法读取 yt-dlp 输出")?;
  // 上限截断：异常巨型输出不能拖垮进程间传输
  let mut buf = String::new();
  out.take(MAX_STDOUT as u64).read_to_string(&mut buf).map_err(|e| format!("yt-dlp 输出读取失败：{e}"))?;
  Ok(buf)
}

/// 探测本机 yt-dlp：返回版本号；未安装/不可用时返回 Err（人话指引）
#[tauri::command]
pub fn ytdlp_probe() -> Result<String, String> {
  let out = run_ytdlp(&["--version"], Duration::from_secs(10))?;
  Ok(out.trim().to_string())
}

/// 拉取平台投稿清单：返回 flat JSON 的 stdout 原文（entries 由前端解析入库）。
/// --playlist-items 1:30 只取最新 30 条——信源轮询不需要全量历史。
#[tauri::command]
pub fn ytdlp_fetch_playlist(url: String) -> Result<String, String> {
  let parsed = url::Url::parse(&url).map_err(|_| "地址格式无效".to_string())?;
  if parsed.scheme() != "http" && parsed.scheme() != "https" {
    return Err("只支持 http/https 地址".into());
  }
  let n = MAX_ENTRIES.to_string();
  run_ytdlp(
    &["--flat-playlist", "--dump-single-json", "--playlist-items", &format!("1:{n}"), "--no-warnings", &url],
    Duration::from_secs(TIMEOUT_SECS),
  )
}
