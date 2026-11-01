//! 系统工具台（Windows 专用 Win32 调用）：作用于其他应用窗口的系统级功能。
//! 第一批：置顶窗口切换（PowerToys Always-on-Top 同款能力）。
//! macOS 对应实现在后续批次（NSWindow 级 API）。

/// 切换当前前台窗口的置顶状态（不夺取焦点，SWP_NOACTIVATE）。
/// 返回人话结果（含窗口标题），调用方发 toast 展示。
#[cfg(windows)]
pub fn toggle_topmost_window() -> Result<String, String> {
  use windows::Win32::UI::WindowsAndMessaging::{
    GetForegroundWindow, GetWindowLongW, GetWindowTextW, HWND_NOTOPMOST, HWND_TOPMOST,
    GWL_EXSTYLE, SetWindowPos, SWP_NOACTIVATE, SWP_NOMOVE, SWP_NOSIZE, WS_EX_TOPMOST,
  };
  unsafe {
    let hwnd = GetForegroundWindow();
    if hwnd.is_invalid() {
      return Err("没有找到可置顶的窗口".into());
    }
    let ex = GetWindowLongW(hwnd, GWL_EXSTYLE) as u32;
    let was_topmost = ex & WS_EX_TOPMOST.0 != 0;
    let insert = if was_topmost { HWND_NOTOPMOST } else { HWND_TOPMOST };
    let _ = SetWindowPos(hwnd, Some(insert), 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE);
    let mut buf = [0u16; 256];
    let len = GetWindowTextW(hwnd, &mut buf);
    let title = String::from_utf16_lossy(&buf[..len as usize]);
    let title = if title.is_empty() { "（无标题窗口）".to_string() } else { title };
    Ok(if was_topmost {
      format!("已取消置顶：{}", title)
    } else {
      format!("已置顶：{}", title)
    })
  }
}

#[cfg(not(windows))]
pub fn toggle_topmost_window() -> Result<String, String> {
  Err("置顶窗口当前仅支持 Windows，macOS 支持在后续版本提供".into())
}

#[tauri::command]
pub fn toggle_topmost() -> Result<String, String> {
  toggle_topmost_window()
}

/// Shell 通知桥一键配置（反馈批重做）：把 pdone 函数写进 PowerShell profile（幂等——
/// 已有标记块则直接返回）。函数体刻意全 ASCII：profile 文件可能是任意编码，中文写进去
/// 会随编码假设乱码；中文消息走运行时参数，发送时显式转 UTF-8 字节。
#[tauri::command]
pub fn shell_bridge_install() -> Result<String, String> {
  use std::io::Write;
  let out = std::process::Command::new("powershell")
    .args(["-NoProfile", "-Command", "$PROFILE"])
    .output()
    .map_err(|e| format!("启动 PowerShell 失败：{e}"))?;
  if !out.status.success() {
    return Err("获取 PowerShell 配置路径失败".into());
  }
  let path = String::from_utf8_lossy(&out.stdout).trim().to_string();
  if path.is_empty() {
    return Err("PowerShell 配置路径为空".into());
  }
  let p = std::path::PathBuf::from(&path);
  if let Some(dir) = p.parent() {
    std::fs::create_dir_all(dir).map_err(|e| format!("创建配置目录失败：{e}"))?;
  }
  const MARK: &str = "# >>> PWORK pdone >>>";
  let existing = std::fs::read_to_string(&p).unwrap_or_default();
  if existing.contains(MARK) {
    return Ok(format!("已经配置过了（{path}）——重开一个终端窗口即可用 pdone"));
  }
  let block = "\n# >>> PWORK pdone >>>\n\
    function global:pdone {\n\
      param([string]$Message = 'done')\n\
      try {\n\
        $json = @{ title = 'PWORK'; body = $Message } | ConvertTo-Json -Compress\n\
        $bytes = [System.Text.Encoding]::UTF8.GetBytes($json)\n\
        Invoke-RestMethod -Uri 'http://127.0.0.1:8788/notify' -Method Post -ContentType 'application/json; charset=utf-8' -Body $bytes | Out-Null\n\
      } catch { }\n\
    }\n\
    # <<< PWORK pdone <<<\n";
  let mut f = std::fs::OpenOptions::new()
    .create(true)
    .append(true)
    .open(&p)
    .map_err(|e| format!("打开配置文件失败：{e}"))?;
  f.write_all(block.as_bytes()).map_err(|e| format!("写入配置失败：{e}"))?;
  Ok(format!("配置完成（{path}）——重开一个终端窗口，在任意命令后面加上：pdone 你的消息"))
}
