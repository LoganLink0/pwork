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
  // 窗体实际物理宽（Windows 无边框窗会在配置值外多出不可见边距，实测 536>520，用实况值居中才准）
  let win_w_phys = w.outer_size().map(|s| s.width as i32).unwrap_or((CANVAS_W * scale) as i32);
  let left = pos.x + ((msize.width as i32 - win_w_phys) / 2);
  let top = pos.y + (8.0 * scale) as i32;
  let _ = w.set_position(tauri::PhysicalPosition::new(left, top));
  Ok(())
}

/// 把窗口位置钳制进其中心所在显示器的可见范围（防拖出屏幕/旧位置数据落在屏外导致岛消失）。
/// 用 min/max 链而非 clamp（窗大于屏时 clamp 的 min>max 会 panic）。
fn clamp_pos(w: &tauri::WebviewWindow, x: i32, y: i32) -> (i32, i32) {
  let size = w.outer_size().unwrap_or(tauri::PhysicalSize::new(CANVAS_W as u32, 140));
  let app = w.app_handle();
  let center_x = x as f64 + size.width as f64 / 2.0;
  let center_y = y as f64 + size.height as f64 / 2.0;
  let monitor = app
    .monitor_from_point(center_x, center_y)
    .ok()
    .flatten()
    .or_else(|| app.primary_monitor().ok().flatten());
  let Some(m) = monitor else { return (x, y) };
  let mp = m.position();
  let ms = m.size();
  let max_x = mp.x + ms.width as i32 - size.width as i32;
  let max_y = mp.y + ms.height as i32 - size.height as i32;
  (x.min(max_x).max(mp.x), y.min(max_y).max(mp.y))
}

/// 胶囊岛：放置到指定物理坐标（自由拖拽驻留；越界坐标钳回屏内）
#[tauri::command]
pub fn isle_place(app: AppHandle, x: i32, y: i32) -> Result<(), String> {
  let Some(w) = app.get_webview_window("isle") else { return Ok(()) };
  let (cx, cy) = clamp_pos(&w, x, y);
  let _ = w.set_position(tauri::PhysicalPosition::new(cx, cy));
  Ok(())
}

/// 胶囊岛：吸附到屏幕上缘居中（灵动岛站位）
#[tauri::command]
pub fn isle_snap_top(app: AppHandle) -> Result<(), String> {
  snap_top(&app)
}

/// 胶囊岛：按住 logo 原生拖拽（在 logo mousedown 时调用，窗口跟随鼠标直到松开）。
/// Windows 上 start_dragging 阻塞至松手：返回前读落点→钳回屏内→落位，
/// 并把钳制后的终位返回给前端持久化（省一次 isle_get_pos 往返）。
#[tauri::command]
pub fn isle_start_drag(app: AppHandle) -> Result<serde_json::Value, String> {
  let Some(w) = app.get_webview_window("isle") else {
    return Ok(serde_json::json!({ "x": 0, "y": 0, "moved": false }));
  };
  let before = w.outer_position().map_err(|e| format!("读取位置失败：{}", e))?;
  w.start_dragging().map_err(|e| format!("启动拖拽失败：{}", e))?;
  let after = w.outer_position().map_err(|e| format!("读取位置失败：{}", e))?;
  let moved = before.x != after.x || before.y != after.y;
  let (cx, cy) = clamp_pos(&w, after.x, after.y);
  if cx != after.x || cy != after.y {
    let _ = w.set_position(tauri::PhysicalPosition::new(cx, cy));
  }
  Ok(serde_json::json!({ "x": cx, "y": cy, "moved": moved }))
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
