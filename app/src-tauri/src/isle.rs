//! 胶囊岛窗（伙伴常驻形态·自由拖拽+顶部吸附式）：
//! 固定 520×140 透明画布，收起态=logo 本体（64px 品牌胶囊）居中画布，
//! 展开态=毛玻璃横条（logo 滑至条内左侧+状态单行）。
//! 按住 logo 原生拖拽（start_dragging），松手驻留（位置持久化在前端 localStorage），
//! 拖近屏幕上缘自动吸附为顶部居中（灵动岛站位）。装饰（边框/圆角/投影）在 lib.rs 统一关闭。

use tauri::{AppHandle, Emitter, Manager};

const CANVAS_W: f64 = 520.0;

/// 锚定到屏幕上缘居中（灵动岛站位·零间距）：横条内 CSS y=10，窗体顶=屏顶-10·缩放，
/// 让条的顶边正好压在屏幕上缘（画布透明部分悬出屏外，无任何可见间隙）。
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
  let top = pos.y - (10.0 * scale) as i32;
  let _ = w.set_position(tauri::PhysicalPosition::new(left, top));
  Ok(())
}

/// 停靠屏幕右缘（垂直位置由拖拽落点决定，纵向钳进屏内）：
/// 画布右缘=屏幕右缘，logo 停在画布右侧（CSS left 446），隐藏态向右平移半个身位探出边缘。
fn dock_right(app: &AppHandle, y: i32) -> Result<(), String> {
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
  let mpos = monitor.position();
  let msize = monitor.size();
  let size = w.outer_size().unwrap_or(tauri::PhysicalSize::new(CANVAS_W as u32, 140));
  let canvas_w_phys = (CANVAS_W * scale) as i32;
  // 画布右缘对齐屏幕右缘：右侧不可见边距条悬出屏外（透明+鼠标穿透，无副作用）
  let x = mpos.x + msize.width as i32 - canvas_w_phys;
  let max_y = mpos.y + msize.height as i32 - size.height as i32;
  let cy = y.min(max_y).max(mpos.y);
  let _ = w.set_position(tauri::PhysicalPosition::new(x, cy));
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
/// Windows 上 start_dragging 阻塞至松手：返回前判定停靠模式并落位，
/// 返回 {mode, x, y, moved} 供前端持久化。模式判定：
/// 落点近屏顶（窗顶距屏顶 ≤120·缩放）→ top（灵动岛，零间距贴顶居中）；
/// logo 中心近屏幕右缘（≤80·缩放）→ right（右缘停靠，纵向保持落点并钳进屏内）；
/// 其余 → free（自由驻留，全向钳回屏内）。
#[tauri::command]
pub fn isle_start_drag(app: AppHandle) -> Result<serde_json::Value, String> {
  let Some(w) = app.get_webview_window("isle") else {
    return Ok(serde_json::json!({ "mode": "free", "x": 0, "y": 0, "moved": false }));
  };
  let before = w.outer_position().map_err(|e| format!("读取位置失败：{}", e))?;
  w.start_dragging().map_err(|e| format!("启动拖拽失败：{}", e))?;
  let after = w.outer_position().map_err(|e| format!("读取位置失败：{}", e))?;
  let moved = before.x != after.x || before.y != after.y;

  let scale = w.scale_factor().unwrap_or(1.0);
  let cursor = app.cursor_position().unwrap_or(tauri::PhysicalPosition::new(0.0, 0.0));
  let monitor = app
    .monitor_from_point(cursor.x, cursor.y)
    .ok()
    .flatten()
    .or_else(|| app.primary_monitor().ok().flatten());
  let (mx, my, mw) = monitor
    .map(|m| (m.position().x, m.position().y, m.size().width as i32))
    .unwrap_or((0, 0, 0));

  let mode: String;
  let final_pos: tauri::PhysicalPosition<i32>;
  if after.y - my <= (120.0 * scale) as i32 {
    mode = "top".into();
    snap_top(&app)?;
    final_pos = w.outer_position().unwrap_or(after);
  } else if after.x + (260.0 * scale) as i32 >= mx + mw - (80.0 * scale) as i32 {
    mode = "right".into();
    dock_right(&app, after.y)?;
    final_pos = w.outer_position().unwrap_or(after);
  } else {
    mode = "free".into();
    let (cx, cy) = clamp_pos(&w, after.x, after.y);
    if cx != after.x || cy != after.y {
      let _ = w.set_position(tauri::PhysicalPosition::new(cx, cy));
    }
    final_pos = tauri::PhysicalPosition::new(cx, cy);
  }
  Ok(serde_json::json!({
    "mode": mode,
    "x": final_pos.x,
    "y": final_pos.y,
    "moved": moved,
  }))
}

/// 胶囊岛：恢复右缘停靠（挂载时按持久化模式调用；纵向位置取持久化值）
#[tauri::command]
pub fn isle_dock_right(app: AppHandle, y: i32) -> Result<(), String> {
  dock_right(&app, y)
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

/// 胶囊岛面板「问小 P」：独立 palette 窗（Spotlight 形态）置顶呼出——
/// 不唤醒主窗；窗位=光标所在显示器顶部居中（上缘下 14% 屏高），带焦点供直接输入。
#[tauri::command]
pub fn isle_open_palette(app: AppHandle) -> Result<(), String> {
  let Some(p) = app.get_webview_window("palette") else { return Ok(()) };
  let cursor = app.cursor_position().unwrap_or(tauri::PhysicalPosition::new(0.0, 0.0));
  let monitor = app
    .monitor_from_point(cursor.x, cursor.y)
    .ok()
    .flatten()
    .or_else(|| app.primary_monitor().ok().flatten());
  if let Some(m) = monitor {
    let mpos = m.position();
    let msize = m.size();
    let size = p.outer_size().unwrap_or(tauri::PhysicalSize::new(680, 480));
    let x = mpos.x + (msize.width as i32 - size.width as i32) / 2;
    let y = mpos.y + (msize.height as f64 * 0.14) as i32;
    let _ = p.set_position(tauri::PhysicalPosition::new(x, y));
  }
  let _ = p.show();
  let _ = p.set_focus();
  // 窗体常驻隐藏（只加载一次）：每次呼出都用事件通知前端重新打开面板——
  // 面板关闭即卸载，二次呼出不经历挂载流程
  let _ = app.emit("palette-open", ());
  Ok(())
}

/// palette 窗：隐藏（Esc / 点击窗外 / 动作执行后由前端调用）
#[tauri::command]
pub fn palette_hide(app: AppHandle) -> Result<(), String> {
  if let Some(p) = app.get_webview_window("palette") {
    let _ = p.hide();
  }
  Ok(())
}

/// palette 窗导航桥：面板内的页面/条目跳转在主窗执行——隐藏自己、唤醒主窗、
/// 发 isle-goto（App 侧监听后路由跳转）
#[tauri::command]
pub fn palette_goto(app: AppHandle, path: String) -> Result<(), String> {
  if let Some(p) = app.get_webview_window("palette") {
    let _ = p.hide();
  }
  if let Some(main) = app.get_webview_window("main") {
    let _ = main.unminimize();
    let _ = main.show();
    let _ = main.set_focus();
    let _ = app.emit("isle-goto", path);
  }
  Ok(())
}
