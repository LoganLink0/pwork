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
/// 超时即 kill 子进程并返回人话错误。Windows 下带 CREATE_NO_WINDOW：后台抓取是
/// 无交互子进程，主程序本身无 console（windows_subsystem=windows），spawn console
/// 程序会新建终端窗闪现在用户桌面（2026-11-15 用户反馈「点开速记时弹 CMD」的根因
/// ——抓取循环恰好与用户操作同时发生，窗闪归属难以自察）
fn run_ytdlp(args: &[&str], timeout: Duration) -> Result<String, String> {
  let mut cmd = Command::new("yt-dlp");
  cmd.args(args).stdout(Stdio::piped()).stderr(Stdio::null());
  #[cfg(windows)]
  {
    use std::os::windows::process::CommandExt;
    cmd.creation_flags(0x0800_0000); // CREATE_NO_WINDOW
  }
  let mut child = cmd
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
/// 地址守卫与 RSS 抓取同口径（gateway::guard_public_http_url）：拒绝内网/回环/保留地址，
/// 防 yt-dlp 被当作内网探测探针。
#[tauri::command]
pub fn ytdlp_fetch_playlist(url: String) -> Result<String, String> {
  crate::gateway::guard_public_http_url(&url)?;
  let n = MAX_ENTRIES.to_string();
  run_ytdlp(
    &["--flat-playlist", "--dump-single-json", "--playlist-items", &format!("1:{n}"), "--no-warnings", &url],
    Duration::from_secs(TIMEOUT_SECS),
  )
}
