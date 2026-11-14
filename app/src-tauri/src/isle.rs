//! 胶囊岛窗（伙伴常驻形态·边缘停靠式）：贴屏幕右缘的细条 tab，鼠标靠近滑出面板。
//! 窗口固定 360×140 画布锚定右缘（垂直位置可调），内容在画布内滑入滑出——
//! 不做逐状态窗体缩放（内容测量与窗体尺寸循环依赖，0.1.22 教训）。

use tauri::{AppHandle, Emitter, Manager};

/// 画布尺寸（逻辑点）：展开面板 336×64 + 右缘留白。
const CANVAS_W: f64 = 360.0;
const CANVAS_H: f64 = 140.0;

/// 锚定：贴屏幕右缘、垂直位置按 yPercent（0=顶 50=中 100=底）。
/// 全程物理像素计算（逻辑/物理混算是首次锚定偏移的根因）：画布物理宽=360×scale，
/// 右缘留 8×scale 边距，垂直按 scale 换算上下安全边（各 64×scale，避开任务栏）。
fn anchor_isle(app: &AppHandle, y_percent: f64) -> Result<(), String> {
  let Some(w) = app.get_webview_window("isle") else { return Ok(()) };
  let size = w.outer_size().map_err(|e| format!("读取窗口尺寸失败：{}", e))?;
  let cursor = app.cursor_position().unwrap_or(tauri::PhysicalPosition::new(0.0, 0.0));
  let monitor = match app.monitor_from_point(cursor.x, cursor.y) {
    Ok(Some(m)) => Some(m),
    _ => app.primary_monitor().map_err(|e| format!("读取主显示器失败：{}", e))?,
  };
  let Some(monitor) = monitor else {
    return Err("找不到可用显示器".into());
  };
  let scale = monitor.scale_factor();
  let pos = monitor.position();
  let msize = monitor.size();
  let right_margin = (8.0 * scale) as i32;
  let v_margin = (64.0 * scale) as i32;
  let canvas_w_phys = (CANVAS_W * scale) as i32;
  let left = pos.x + msize.width as i32 - right_margin - canvas_w_phys;
  let top_band = pos.y as f64 + v_margin as f64;
  let bottom_band = pos.y as f64 + msize.height as f64 - v_margin as f64;
  let center_y = top_band + (bottom_band - top_band) * (y_percent / 100.0);
  let y = (center_y - size.height as f64 / 2.0).clamp(top_band, bottom_band - size.height as f64);
  let _ = w.set_position(tauri::PhysicalPosition::new(left, y as i32));
  Ok(())
}

/// 胶囊岛：显示并按垂直位置锚定（应用启动时调用；yPercent 由前端从设置读出）
#[tauri::command]
pub fn isle_show(app: AppHandle, y_percent: f64) -> Result<(), String> {
  let Some(w) = app.get_webview_window("isle") else { return Ok(()) };
  let _ = w.set_size(tauri::LogicalSize::new(CANVAS_W, CANVAS_H));
  anchor_isle(&app, y_percent)?;
  let _ = w.show();
  Ok(())
}

/// 胶囊岛：位置调整（设置页三档切换时调用）
#[tauri::command]
pub fn isle_set_y(app: AppHandle, y_percent: f64) -> Result<(), String> {
  anchor_isle(&app, y_percent)
}

/// 胶囊岛：隐藏（设置关闭时调用）
#[tauri::command]
pub fn isle_hide(app: AppHandle) -> Result<(), String> {
  let Some(w) = app.get_webview_window("isle") else { return Ok(()) };
  let _ = w.hide();
  Ok(())
}

/// 胶囊岛：主窗侧上报活动状态（JSON 数组），转发给 isle 窗渲染
#[tauri::command]
pub fn isle_set_activity(app: AppHandle, activities: Vec<serde_json::Value>) -> Result<(), String> {
  let Some(w) = app.get_webview_window("isle") else { return Ok(()) };
  let _ = w.emit("isle-activities", activities);
  Ok(())
}

/// 胶囊岛面板「打开 PWORK」：唤醒/聚焦主窗
#[tauri::command]
pub fn isle_open_main(app: AppHandle) -> Result<(), String> {
  if let Some(main) = app.get_webview_window("main") {
    let _ = main.unminimize();
    let _ = main.show();
    let _ = main.set_focus();
  }
  Ok(())
}

/// 胶囊岛面板「问小 P」：唤醒主窗并发事件，主窗打开命令面板（littlep 来源）
#[tauri::command]
pub fn isle_open_palette(app: AppHandle) -> Result<(), String> {
  if let Some(main) = app.get_webview_window("main") {
    let _ = main.unminimize();
    let _ = main.show();
    let _ = main.set_focus();
    let _ = app.emit("isle-open-palette", ());
  }
  Ok(())
}
