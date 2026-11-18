//! 胶囊岛窗（伙伴常驻形态·自由拖拽+顶部吸附式）：
//! 固定 520×140 透明画布（窗体从不变形——可见窗 resize 会白闪）。
//! 收起隐藏态=「藏进去、留把手」：缘停靠 logo 半探出屏幕外（屏内留 32px 贴边把手），
//! 自由驻留 logo 半透明淡出原地；命中区经 SetWindowRgn 裁为 logo 屏内可见部分
//! （region 外穿透给下层）。展开态=毛玻璃横条（logo 滑至条内左侧+状态单行）。
//! 按住画布原生拖拽（start_dragging），松手驻留（位置持久化在 prefs.json），
//! 拖近屏幕上缘自动吸附为顶部居中（灵动岛站位）。装饰（边框/圆角/投影）在 lib.rs 统一关闭。

use std::thread;
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

/// 停靠屏幕左缘（2026-11-15 用户要求补左停靠）：画布左缘=屏幕左缘，
/// logo 停画布左侧（CSS left 10），纵向位置由拖拽落点决定并钳进屏内。
fn dock_left(app: &AppHandle, y: i32) -> Result<(), String> {
  let Some(w) = app.get_webview_window("isle") else { return Ok(()) };
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
  let max_y = mpos.y + msize.height as i32 - size.height as i32;
  let cy = y.min(max_y).max(mpos.y);
  // 画布左缘对齐屏幕左缘：左侧不可见边距条悬出屏外（透明+鼠标穿透，无副作用）
  let _ = w.set_position(tauri::PhysicalPosition::new(mpos.x, cy));
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

/// 收起隐藏（2026-11-18 五轮定稿，用户拍板）：**藏进去、留把手**——缘停靠把 logo
/// 半探出屏幕外（屏内留 32·缩放贴边可见当把手），free 驻留 logo 半透明淡出停在
/// 原地；鼠标靠近把手滑出展开。窗体从不变形（可见窗 resize 是白闪根因），命中区
/// 经 SetWindowRgn 裁为 logo 屏内可见部分（region 外穿透给下层，不重演整条边拦点击）。
const TUCK: f64 = 32.0; // 半探入深度：屏内留出的把手宽度/高度（logo 64 的一半）

/// 画布内 logo 位（逻辑 px，与 .isle-logo 各模式的 CSS left/top 一致）：
/// top/free 居画布中上 (228,10)、left 贴左 (10,10)、right 贴右 (446,10)。
/// 半探入定位与热区换算全靠它们。
const CANVAS_LOGO_X: f64 = 228.0;
const CANVAS_LOGO_X_LEFT: f64 = 10.0;
const CANVAS_LOGO_X_RIGHT: f64 = 446.0;
const CANVAS_LOGO_Y: f64 = 10.0;

/// 把窗口命中区裁为指定矩形热区（x/y/w/h 为**客户区**物理 px；region 外系统级完全
/// 穿透且不可见）。region 坐标系=窗口原点，无边框窗的不可见边距使客户原点 ≠ 窗口
/// 原点（实测外框 536×149 vs 客户 520×140）——先换算客户原点偏移再落 region。
/// 设置后立即回读验证：失败非静默，console 留痕（rgn 实测生效 COMPLEX，留痕是兜底）。
#[cfg(windows)]
fn clip_region_to_hotspot(w: &tauri::WebviewWindow, x: i32, y: i32, width: i32, height: i32) {
  // ClientToScreen 在 windows crate 里归 Gdi 模块（官方分区如此），非 WindowsAndMessaging
  use windows::Win32::Foundation::{POINT, RECT};
  use windows::Win32::Graphics::Gdi::{ClientToScreen, CreateRectRgn, GDI_REGION_TYPE, GetWindowRgn, SetWindowRgn};
  use windows::Win32::UI::WindowsAndMessaging::GetWindowRect;
  let Ok(hwnd) = w.hwnd() else { return };
  unsafe {
    let mut win = RECT::default();
    let _ = GetWindowRect(hwnd, &mut win);
    let mut org = POINT { x: 0, y: 0 };
    let _ = ClientToScreen(hwnd, &mut org);
    // 热区目标在客户区坐标（=画布坐标），落 region 前补客户原点-窗口原点偏移
    let off_x = org.x - win.left;
    let off_y = org.y - win.top;
    let region = CreateRectRgn(off_x + x, off_y + y, off_x + x + width, off_y + y + height);
    let applied = SetWindowRgn(hwnd, Some(region), true);
    // 回读验证（失效不静默，留痕）：GetWindowRgn 只收 region 句柄
    let probe = CreateRectRgn(0, 0, 1, 1);
    let kind = GetWindowRgn(hwnd, probe);
    if applied == 0 || kind == GDI_REGION_TYPE(0) {
      web_console_log(w, format!("SetWindowRgn applied={} rgnKind={:?} —— 命中裁剪未生效", applied, kind));
    }
  }
}

/// 前端 console 转发（进 tauri-plugin-log 运行日志，错误页可见）
#[cfg(windows)]
fn web_console_log(w: &tauri::WebviewWindow, msg: String) {
  let _ = w.eval(&format!("console.warn('[isle] {}')", msg.replace('\'', "")));
}

/// 清除命中裁剪（展开态恢复整个窗口可命中）
#[cfg(windows)]
fn clear_region(w: &tauri::WebviewWindow) {
  use windows::Win32::Graphics::Gdi::SetWindowRgn;
  let Ok(hwnd) = w.hwnd() else { return };
  unsafe {
    SetWindowRgn(hwnd, None, true);
  }
}

/// 收起隐藏态的命中裁剪：logo 屏内可见部分（把手）；region 外穿透给下层应用
#[cfg(windows)]
fn apply_peek_region(w: &tauri::WebviewWindow, mode: &str, scale: f64) {
  let tuck = (TUCK * scale) as i32;
  let logo = (64.0 * scale) as i32;
  let logo_x = (CANVAS_LOGO_X * scale) as i32;
  let logo_y = (CANVAS_LOGO_Y * scale) as i32;
  let (hx, hy, hw, hh) = match mode {
    // 顶缘：屏内段=logo 下半（y 从 logo_y+tuck 到 logo_y+64）
    "top" => (logo_x, logo_y + tuck, logo, logo - tuck),
    // 左缘：屏内段=logo 右半（x 从 logo_x+tuck 到 logo_x+64）
    "left" => ((CANVAS_LOGO_X_LEFT * scale) as i32 + tuck, logo_y, logo - tuck, logo),
    // 右缘：屏内段=logo 左半（x 从 logo_x 到 logo_x+tuck）
    "right" => ((CANVAS_LOGO_X_RIGHT * scale) as i32, logo_y, tuck, logo),
    // 自由：完整 logo
    _ => (logo_x, logo_y, logo, logo),
  };
  clip_region_to_hotspot(w, hx, hy, hw, hh);
}

/// 右键收纳：把岛完全隐藏到指定去处（2026-11-19 用户需求，logo 右键菜单三项）。
/// top=半探入屏幕上缘（贴顶居中）；right=半探入屏幕右缘；left=半探入屏幕左缘
/// （右/左纵向居中）。落位后即套收起命中裁剪，返回落位供前端持久化。
#[tauri::command]
pub fn isle_stash_to(app: AppHandle, target: String) -> Result<serde_json::Value, String> {
  let Some(w) = app.get_webview_window("isle") else {
    return Err("找不到胶囊岛窗口".into());
  };
  let scale = w.scale_factor().unwrap_or(1.0);
  let cursor = app.cursor_position().unwrap_or(tauri::PhysicalPosition::new(0.0, 0.0));
  let monitor = match app.monitor_from_point(cursor.x, cursor.y) {
    Ok(Some(m)) => Some(m),
    _ => app.primary_monitor().map_err(|e| format!("读取主显示器失败：{}", e))?,
  };
  let Some(monitor) = monitor else {
    return Err("找不到可用显示器".into());
  };
  let mp = monitor.position();
  let ms = monitor.size();
  let canvas_w = (CANVAS_W * scale) as i32;
  let canvas_h = (140.0 * scale) as i32;
  let tuck = (TUCK * scale) as i32;
  let logo_y = (CANVAS_LOGO_Y * scale) as i32;
  let (mode, px, py) = match target.as_str() {
    // 上缘：贴顶居中 + logo 上半探出屏外（与收起态顶缘定位同式）
    "top" => {
      let win_w = w.outer_size().map(|s| s.width as i32).unwrap_or(canvas_w);
      let x = mp.x + (ms.width as i32 - win_w) / 2;
      let y = mp.y - logo_y - tuck;
      let _ = w.set_position(tauri::PhysicalPosition::new(x, y));
      ("top", x, y)
    }
    // 右缘：logo 右缘探出屏外 tuck，纵向居中
    "right" => {
      let x = mp.x + ms.width as i32 - (CANVAS_LOGO_X_RIGHT * scale) as i32 - tuck;
      let y = mp.y + (ms.height as i32 - canvas_h) / 2;
      let _ = w.set_position(tauri::PhysicalPosition::new(x, y));
      ("right", x, y)
    }
    // 左缘：logo 左缘探出屏外 tuck，纵向居中
    "left" => {
      let x = mp.x - (CANVAS_LOGO_X_LEFT * scale) as i32 - tuck;
      let y = mp.y + (ms.height as i32 - canvas_h) / 2;
      let _ = w.set_position(tauri::PhysicalPosition::new(x, y));
      ("left", x, y)
    }
    _ => return Err(format!("未知的目标位置：{}", target)),
  };
  #[cfg(windows)]
  apply_peek_region(&w, mode, scale);
  #[cfg(not(windows))]
  let _ = &w;
  Ok(serde_json::json!({ "mode": mode, "x": px, "y": py }))
}

/// 右键菜单前置：仅清除命中裁剪（整窗可绘制可命中，菜单才能在画布内渲染），
/// 不改尺寸、不定位、不展开横条。
#[tauri::command]
pub fn isle_unclip(app: AppHandle) -> Result<(), String> {
  let Some(w) = app.get_webview_window("isle") else { return Ok(()) };
  #[cfg(windows)]
  clear_region(&w);
  #[cfg(not(windows))]
  let _ = w;
  Ok(())
}

#[tauri::command]
pub fn isle_peek(app: AppHandle, mode: String, y: i32) -> Result<(), String> {
  let Some(w) = app.get_webview_window("isle") else { return Ok(()) };
  let scale = w.scale_factor().unwrap_or(1.0);
  let cursor = app.cursor_position().unwrap_or(tauri::PhysicalPosition::new(0.0, 0.0));
  let monitor = match app.monitor_from_point(cursor.x, cursor.y) {
    Ok(Some(m)) => Some(m),
    _ => app.primary_monitor().map_err(|e| format!("读取主显示器失败：{}", e))?,
  };
  let Some(monitor) = monitor else {
    return Err("找不到可用显示器".into());
  };
  let mp = monitor.position();
  let ms = monitor.size();
  let tuck = (TUCK * scale) as i32;
  let logo_y = (CANVAS_LOGO_Y * scale) as i32;
  // 画布定位（窗体不变形）：缘停靠把 logo 半探出屏幕外（屏内留 tuck 把手），free 原位
  match mode.as_str() {
    // 顶缘：logo 上缘探出屏外 tuck，屏内留下半贴顶居中（水平与 snap_top 同法按外框宽居中）
    "top" => {
      let win_w = w.outer_size().map(|s| s.width as i32).unwrap_or((CANVAS_W * scale) as i32);
      let left = mp.x + (ms.width as i32 - win_w) / 2;
      let _ = w.set_position(tauri::PhysicalPosition::new(left, mp.y - logo_y - tuck));
    }
    // 左缘：logo 左缘探出屏外 tuck，屏内留右半贴左；纵向跟随停靠位并钳屏内
    "left" => {
      let win_h = w.outer_size().map(|s| s.height as i32).unwrap_or((140.0 * scale) as i32);
      let cy = y.clamp(mp.y, mp.y + ms.height as i32 - win_h);
      let _ = w.set_position(tauri::PhysicalPosition::new(
        mp.x - (CANVAS_LOGO_X_LEFT * scale) as i32 - tuck,
        cy,
      ));
    }
    // 右缘：logo 右缘探出屏外 tuck，屏内留左半贴右
    "right" => {
      let win_h = w.outer_size().map(|s| s.height as i32).unwrap_or((140.0 * scale) as i32);
      let cy = y.clamp(mp.y, mp.y + ms.height as i32 - win_h);
      let _ = w.set_position(tauri::PhysicalPosition::new(
        mp.x + ms.width as i32 - (CANVAS_LOGO_X_RIGHT * scale) as i32 - tuck,
        cy,
      ));
    }
    // 自由驻留：留在原位（半透明淡出由 CSS 完成），命中区=完整 logo
    _ => {}
  }
  #[cfg(windows)]
  apply_peek_region(&w, &mode, scale);
  Ok(())
}

/// 从完全隐藏恢复（窗口从未变形，无需尺寸复位）：清除命中裁剪整窗恢复并显示，
/// 按模式定位（top 吸顶居中 / left·right 贴缘 / free 原位即画布位）。设置页开关
/// 在隐藏态直接调 expand——缺 show 时窗永远隐藏（「点开找不到 logo」根因）
#[tauri::command]
pub fn isle_expand(app: AppHandle, mode: String, y: i32) -> Result<(), String> {
  let Some(w) = app.get_webview_window("isle") else { return Ok(()) };
  #[cfg(windows)]
  clear_region(&w);
  let _ = w.show();
  match mode.as_str() {
    "top" => snap_top(&app),
    "left" => dock_left(&app, y),
    "right" => dock_right(&app, y),
    // 自由驻留：窗从未变形，原位即画布位（logo 从未离开画布中上）
    _ => Ok(()),
  }
}

/// 拖拽落点的停靠模式判定与落位（拖拽真正结束后调用）：
/// 判定基准=光标（用户手里拖的就是 logo）——旧实现用窗口矩形边缘做阈值，从右缘
/// 隐藏态抓 logo 拖放时画布中心永远到不了右缘 80px 阈值内（光标最多到屏幕边缘），
/// 右缘落点全部误判 free：
/// 光标近屏顶（≤120·缩放）→ top（灵动岛，零间距贴顶居中）；
/// 近屏幕左/右缘（≤80·缩放）→ left/right（缘停靠，logo 竖向中心跟随光标并钳进屏内）；
/// 其余 → free（自由驻留，全向钳回屏内）。返回 (mode, 终位)。
fn decide_and_place(app: &AppHandle, after: tauri::PhysicalPosition<i32>) -> (String, tauri::PhysicalPosition<i32>) {
  let Some(w) = app.get_webview_window("isle") else { return ("free".into(), after) };
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
  let cx_phys = cursor.x as i32;
  let cy_phys = cursor.y as i32;

  if cy_phys - my <= (120.0 * scale) as i32 {
    let _ = snap_top(app);
    let final_pos = w.outer_position().unwrap_or(after);
    return ("top".into(), final_pos);
  }
  // 左缘判定在右缘之前（近角落落点两个条件可同时成立，先近者赢）
  if cx_phys - mx <= (80.0 * scale) as i32 {
    // 画布顶=光标 y-logo 竖向中心（画布内 top 10+半高 32）→ logo 竖向正对光标落点
    let _ = dock_left(app, cy_phys - (42.0 * scale) as i32);
    let final_pos = w.outer_position().unwrap_or(after);
    return ("left".into(), final_pos);
  }
  if mx + mw - cx_phys <= (80.0 * scale) as i32 {
    let _ = dock_right(app, cy_phys - (42.0 * scale) as i32);
    let final_pos = w.outer_position().unwrap_or(after);
    return ("right".into(), final_pos);
  }
  let (cx, cy) = clamp_pos(&w, after.x, after.y);
  if cx != after.x || cy != after.y {
    let _ = w.set_position(tauri::PhysicalPosition::new(cx, cy));
  }
  ("free".into(), tauri::PhysicalPosition::new(cx, cy))
}

/// Windows：左键当前是否已松开（GetAsyncKeyState 高位=按下）
#[cfg(windows)]
fn left_button_up() -> bool {
  use windows::Win32::UI::Input::KeyboardAndMouse::{GetAsyncKeyState, VK_LBUTTON};
  unsafe { GetAsyncKeyState(VK_LBUTTON.0 as i32) >= 0 }
}

#[cfg(not(windows))]
fn left_button_up() -> bool {
  true
}

/// 胶囊岛：按住横条/logo 原生拖拽（在画布 mousedown 时调用）。
/// 从隐形热区抓起：先清命中裁剪整窗恢复（横条随抓起立即显示，拖动全程完整可见）。
/// 关键事实：Windows 上 start_dragging 是异步发起——立即返回，模态移动循环在其后由
/// 事件循环驱动（实测日志铁证：命令返回时窗口尚未动过）。因此拖拽结束检测放在
/// 轮询线程：左键松开（GetAsyncKeyState）且位置连续两拍稳定 → 真正松手，
/// 此时才做停靠判定/落位，并向 isle 窗发 isle-drag-end {mode,x,y,moved} 供前端持久化。
#[tauri::command]
pub fn isle_start_drag(app: AppHandle) -> Result<(), String> {
  let Some(w) = app.get_webview_window("isle") else { return Ok(()) };
  let before = w.outer_position().map_err(|e| format!("读取位置失败：{}", e))?;
  #[cfg(windows)]
  clear_region(&w);
  w.start_dragging().map_err(|e| format!("启动拖拽失败：{}", e))?;
  let app = app.clone();
  thread::spawn(move || {
    let deadline = std::time::Instant::now() + std::time::Duration::from_secs(30);
    let mut last = before;
    let mut stable = 0u32;
    loop {
      if std::time::Instant::now() > deadline {
        break;
      }
      thread::sleep(std::time::Duration::from_millis(50));
      let now = app
        .get_webview_window("isle")
        .and_then(|w| w.outer_position().ok())
        .unwrap_or(last);
      let moved_now = now != last;
      last = now;
      let up = left_button_up();
      if up && !moved_now {
        stable += 1;
      } else {
        stable = 0;
      }
      if up && stable >= 2 {
        break;
      }
    }
    let final_pos = app
      .get_webview_window("isle")
      .and_then(|w| w.outer_position().ok())
      .unwrap_or(before);
    let moved = before != final_pos;
    let (mode, pos) = decide_and_place(&app, final_pos);
    let _ = app.emit(
      "isle-drag-end",
      serde_json::json!({ "mode": mode, "x": pos.x, "y": pos.y, "moved": moved }),
    );
  });
  Ok(())
}

/// 胶囊岛：恢复右缘停靠（挂载时按持久化模式调用；纵向位置取持久化值）
#[tauri::command]
pub fn isle_dock_right(app: AppHandle, y: i32) -> Result<(), String> {
  dock_right(&app, y)
}

/// 胶囊岛：恢复左缘停靠（同上，2026-11-15 用户要求补左停靠）
#[tauri::command]
pub fn isle_dock_left(app: AppHandle, y: i32) -> Result<(), String> {
  dock_left(&app, y)
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

/// 胶囊岛：主窗侧上报活动状态（JSON 数组）+ 可选结果瞬态（完成 ✓ / 失败 ✗），
/// 转发给 isle 窗渲染
#[tauri::command]
pub fn isle_set_activity(
  app: AppHandle,
  activities: Vec<serde_json::Value>,
  notice: Option<serde_json::Value>,
) -> Result<(), String> {
  let Some(w) = app.get_webview_window("isle") else { return Ok(()) };
  let _ = w.emit(
    "isle-activities",
    serde_json::json!({ "activities": activities, "notice": notice }),
  );
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
