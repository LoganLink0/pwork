//! 胶囊岛窗（伙伴常驻形态·自由拖拽+顶部吸附式）：
//! 固定 520×140 透明画布，收起态=logo 本体（64px 品牌胶囊）居中画布，
//! 展开态=毛玻璃横条（logo 滑至条内左侧+状态单行）。
//! 按住 logo 原生拖拽（start_dragging），松手驻留（位置持久化在前端 localStorage），
//! 拖近屏幕上缘自动吸附为顶部居中（灵动岛站位）。装饰（边框/圆角/投影）在 lib.rs 统一关闭。

use tauri::{AppHandle, Emitter, Manager};

const CANVAS_W: f64 = 520.0;

/// 锚定到屏幕上缘居中（灵动岛站位）：画布顶=屏顶+8（条内 y=10 → 条顶落在屏顶 18 逻辑位）。
fn snap_top(app: &AppHandle) -> Result<(), String> {
  let Some(w) = app.get_webview_window("isle") else { return Ok(()) };
  let scale = w.scale_factor().map_err(|e| format!("读取缩放失败：{}", e))?;
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
  let canvas_w_phys = (CANVAS_W * scale) as i32;
  let left = pos.x + ((msize.width as i32 - canvas_w_phys) / 2);
  let top = pos.y + (8.0 * scale) as i32;
  let _ = w.set_position(tauri::PhysicalPosition::new(left, top));
  Ok(())
}

/// 胶囊岛：放置到指定物理坐标（自由拖拽驻留）
#[tauri::command]
pub fn isle_place(app: AppHandle, x: i32, y: i32) -> Result<(), String> {
  let Some(w) = app.get_webview_window("isle") else { return Ok(()) };
  let _ = w.set_position(tauri::PhysicalPosition::new(x, y));
  Ok(())
}

/// 胶囊岛：吸附到屏幕上缘居中（灵动岛站位）
#[tauri::command]
pub fn isle_snap_top(app: AppHandle) -> Result<(), String> {
  snap_top(&app)
}

/// 胶囊岛：读取当前物理位置（拖拽驻留持久化用）
#[tauri::command]
pub fn isle_get_pos(app: AppHandle) -> Result<serde_json::Value, String> {
  let Some(w) = app.get_webview_window("isle") else { return Ok(serde_json::json!({ "x": 0, "y": 0 })) };
  let pos = w.outer_position().map_err(|e| format!("读取位置失败：{}", e))?;
  Ok(serde_json::json!({ "x": pos.x, "y": pos.y }))
}

/// 胶囊岛：按住 logo 原生拖拽（在 logo mousedown 时调用，窗口跟随鼠标直到松开）
#[tauri::command]
pub fn isle_start_drag(app: AppHandle) -> Result<(), String> {
  let Some(w) = app.get_webview_window("isle") else { return Ok(()) };
  w.start_dragging().map_err(|e| format!("启动拖拽失败：{}", e))
}

/// 胶囊岛：显示
#[tauri::command]
pub fn isle_show(app: AppHandle) -> Result<(), String> {
  let Some(w) = app.get_webview_window("isle") else { return Ok(()) };
  let _ = w.show();
  Ok(())
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
