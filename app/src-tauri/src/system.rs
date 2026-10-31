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
