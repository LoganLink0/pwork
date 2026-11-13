//! 胶囊岛窗（41 批之后的伙伴常驻形态）：桌面右下角的呼吸点/活动胶囊/展开面板。
//! 窗口本体在 tauri.conf（label=isle，透明右下锚定），命令负责尺寸调整、活动转发与显示。

use tauri::{Emitter, AppHandle, Manager};

/// 胶囊岛窗锚定到所在显示器工作区的右下角（保持右/下边距，随尺寸变化向左上扩展）。
/// 首选跟随鼠标所在显示器（与轮盘同款判定），兜底主显示器。
fn anchor_isle(app: &AppHandle, w: &tauri::WebviewWindow) -> Result<(), String> {
  let size = w.outer_size().map_err(|e| format!("读取窗口尺寸失败：{}", e))?;
  let cursor = app.cursor_position().unwrap_or(tauri::PhysicalPosition::new(0.0, 0.0));
  let monitor = match app.monitor_from_point(cursor.x, cursor.y) {
    Ok(Some(m)) => Some(m),
    _ => app.primary_monitor().map_err(|e| format!("读取主显示器失败：{}", e))?,
  };
  let Some(monitor) = monitor else {
    return Err("找不到可用显示器".into());
  };
  let pos = monitor.position();
  let msize = monitor.size();
  let right = pos.x as f64 + msize.width as f64 - 12.0;
  let bottom = pos.y as f64 + msize.height as f64 - 12.0;
  let _ = w.set_position(tauri::PhysicalPosition::new(
    (right - size.width as f64) as i32,
    (bottom - size.height as f64) as i32,
  ));
  Ok(())
}

/// 胶囊岛：设置窗体尺寸并保持右下锚定（idle 44×44 / live ~280×44 / open 360×420 由前端决定）
#[tauri::command]
pub fn isle_resize(app: AppHandle, width: f64, height: f64) -> Result<(), String> {
  let Some(w) = app.get_webview_window("isle") else { return Ok(()) };
  let _ = w.set_size(tauri::LogicalSize::new(width, height));
  anchor_isle(&app, &w)
}

/// 胶囊岛：主窗侧上报活动状态（JSON 数组），转发给 isle 窗渲染
#[tauri::command]
pub fn isle_set_activity(app: AppHandle, activities: Vec<serde_json::Value>) -> Result<(), String> {
  let Some(w) = app.get_webview_window("isle") else { return Ok(()) };
  let _ = w.emit("isle-activities", activities);
  Ok(())
}

/// 胶囊岛：显示（应用启动时常驻呼吸点）
#[tauri::command]
pub fn isle_show(app: AppHandle) -> Result<(), String> {
  let Some(w) = app.get_webview_window("isle") else { return Ok(()) };
  anchor_isle(&app, &w)?;
  let _ = w.show();
  Ok(())
}

/// 胶囊岛面板「打开 PWORK」：唤醒/聚焦主窗（最小化则还原），并收回面板
#[tauri::command]
pub fn isle_open_main(app: AppHandle) -> Result<(), String> {
  if let Some(main) = app.get_webview_window("main") {
    let _ = main.unminimize();
    let _ = main.show();
    let _ = main.set_focus();
  }
  if let Some(w) = app.get_webview_window("isle") {
    let _ = w.emit("isle-close", ());
  }
  Ok(())
}
