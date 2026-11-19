//! 胶囊岛窗（伙伴常驻形态·自由拖拽+顶部吸附式）：
//! 双尺寸生命周期（2026-11-19 定稿）：**可见窗体永不变形**——一切尺寸/位置变化都在
//! 隐藏状态下完成（hide → set_size/set_position → show，三步原子切换）。
//! 收起隐藏态=72×72 小窗（logo 满窗 + 白环描边，缘停靠时小窗半探出屏幕外留把手，
//! 自由驻留小窗原地半透明淡出）；展开态=520×140 画布（毛玻璃横条：logo 滑至条内
//! 左侧+状态单行）。命中区域=整个小窗（无 SetWindowRgn——region 裁剪与可见窗变形
//! 是白闪/幻影蓝窗的根因，均已从机制上移除）。
//! 按住小窗/横条原生拖拽（start_dragging），松手驻留（位置持久化在 prefs.json），
//! 拖近屏幕上缘自动吸附为顶部居中（灵动岛站位）。装饰（边框/圆角/投影）在 lib.rs 统一关闭。
//!
//! 尺寸语义（CSS px，Rust 全部 ×scale 换物理）：
//!   画布 520×140；小窗 72×72（logo 64×64 居中 + 描边环余量 4px）
//!   画布内 logo 位：top/free (228,10)、left (10,10)、right (446,10)
//!   小窗内 logo 位：恒 (4,4)
//!   半探出：缘停靠小窗中心对齐屏幕边缘（各探出 36px，屏内留 36px 把手）

use std::thread;
use tauri::{AppHandle, Emitter, Manager};

const CANVAS_W: f64 = 520.0;
const CANVAS_H: f64 = 140.0;
const HANDLE_SIZE: f64 = 72.0; // 自由驻留收起态小窗边长（logo 64 + 描边余量 8）
const LOGO_INSET: f64 = 4.0; // 小窗内 logo 内缩（描边环余量）
const BAR_TOP: f64 = 10.0; // 横条在画布内的纵坐标（CSS px，与 .isle-bar top 一致）
const BAR_H: f64 = 64.0; // 横条高度（CSS px，与 .isle-bar height 一致）
const STRIP: f64 = 24.0; // 探边条：缘停靠收起态横条屏内可见宽度/高度（0.1.23 探边条形态）

/// 画布内 logo 位（CSS px，与 .isle-logo 各模式 CSS left/top 一致）：
/// top/free (228,10)、left (10,10)、right (446,10)。
const LOGO_X: f64 = 228.0;
const LOGO_X_LEFT: f64 = 10.0;
const LOGO_X_RIGHT: f64 = 446.0;
const LOGO_Y: f64 = 10.0;

fn canvas_size_phys(scale: f64) -> (f64, f64) {
  (CANVAS_W * scale, CANVAS_H * scale)
}
fn handle_size_phys(scale: f64) -> (f64, f64) {
  (HANDLE_SIZE * scale, HANDLE_SIZE * scale)
}

/// 光标所在显示器（失败回退主显示器）
fn cursor_monitor(app: &AppHandle) -> Result<tauri::Monitor, String> {
  let cursor = app.cursor_position().unwrap_or(tauri::PhysicalPosition::new(0.0, 0.0));
  match app.monitor_from_point(cursor.x, cursor.y) {
    Ok(Some(m)) => Ok(m),
    _ => app
      .primary_monitor()
      .map_err(|e| format!("读取主显示器失败：{}", e))
      .and_then(|m| m.ok_or_else(|| "找不到可用显示器".to_string())),
  }
}

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
  // 窗体实际物理宽（Windows 无边框窗会在配置值外多出不可见边距，用实况值居中才准）
  let win_w_phys = w.outer_size().map(|s| s.width as i32).unwrap_or((CANVAS_W * scale) as i32);
  let left = pos.x + ((msize.width as i32 - win_w_phys) / 2);
  let top = pos.y - (LOGO_Y * scale) as i32;
  let _ = w.set_position(tauri::PhysicalPosition::new(left, top));
  // 重置可从隐藏态发起（设置页「重置到屏幕顶部居中」）：重置的语义=把岛带回可点状态，
  // 隐藏窗补 show（禁用态的隐藏由前端按 enabled 门控，不会走到这里）
  if !w.is_visible().unwrap_or(false) {
    let _ = w.show();
  }
  Ok(())
}

/// 停靠屏幕右缘（垂直位置由拖拽落点决定，纵向钳进屏内）：画布右缘=屏幕右缘。
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
  // 画布右缘对齐屏幕右缘
  let x = mpos.x + msize.width as i32 - canvas_w_phys;
  let max_y = mpos.y + msize.height as i32 - size.height as i32;
  let cy = y.min(max_y).max(mpos.y);
  let _ = w.set_position(tauri::PhysicalPosition::new(x, cy));
  Ok(())
}

/// 停靠屏幕左缘：画布左缘=屏幕左缘，纵向位置由拖拽落点决定并钳进屏内。
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

/// 画布内各模式 logo 位（CSS px）→ 用于小窗⇄画布切换时的锚定换算
fn logo_anchor_phys(mode: &str, scale: f64) -> (i32, i32) {
  let x = match mode {
    "left" => LOGO_X_LEFT,
    "right" => LOGO_X_RIGHT,
    _ => LOGO_X,
  };
  ((x * scale) as i32, (LOGO_Y * scale) as i32)
}

/// 实况外框-客户边距（无边框窗应为 0；防御性读取，为 0 时 SetWindowPos 尺寸语义
/// 与 tauri set_size 一致）
fn frame_margins(w: &tauri::WebviewWindow) -> (i32, i32) {
  let inner = w.inner_size().unwrap_or_default();
  let outer = w.outer_size().unwrap_or_default();
  (
    (outer.width as i32 - inner.width as i32).max(0),
    (outer.height as i32 - inner.height as i32).max(0),
  )
}

/// 变形（尺寸/位置）：单次 SetWindowPos 同帧落定。两步 set_size→set_position 之间
/// 会被 40ms 窗口轮询 / 30fps 相机捕到中间矩形（小窗先出现在旧位再跳目标位）——
/// 即用户反复拍到的残余闪烁源。可见状态直接变形，窗口全程不消失（hide→show 的
/// 隐藏帧完全露出壁纸=「蓝色窗体闪现」，全生命周期禁用）。
#[cfg(windows)]
fn morph(w: &tauri::WebviewWindow, width: f64, height: f64, x: i32, y: i32) {
  use windows::Win32::UI::WindowsAndMessaging::{SetWindowPos, SWP_NOACTIVATE, SWP_NOZORDER};
  let Ok(hwnd) = w.hwnd() else { return };
  let (dx, dy) = frame_margins(w);
  unsafe {
    let _ = SetWindowPos(hwnd, None, x, y, width as i32 + dx, height as i32 + dy, SWP_NOZORDER | SWP_NOACTIVATE);
  }
}
#[cfg(not(windows))]
fn morph(w: &tauri::WebviewWindow, width: f64, height: f64, x: i32, y: i32) {
  let _ = w.set_size(tauri::PhysicalSize::new(width as u32, height as u32));
  let _ = w.set_position(tauri::PhysicalPosition::new(x, y));
}

/// 收起态（2026-11-20 用户拍板「直观可见」，复刻 0.1.23 探边条形态）：
/// 缘停靠=窗体保持画布尺寸、原子定位到探边位——横条探出屏幕外，屏内留 STRIP(24)px
/// 毛玻璃探边条（显眼可寻，靠近滑出展开）；自由驻留=72×72 小窗 logo 满窗原地驻留
/// （中央无边缘可探）。命中区=屏内可见部分（窗体探出屏外的部分收不到点击，无需
/// region——region 裁剪与可见窗变形是白闪/幻影蓝窗根因，已移除）。
#[tauri::command]
pub fn isle_peek(app: AppHandle, mode: String, y: i32) -> Result<(), String> {
  let Some(w) = app.get_webview_window("isle") else { return Ok(()) };
  let scale = w.scale_factor().unwrap_or(1.0);
  let monitor = cursor_monitor(&app)?;
  let mp = monitor.position();
  let ms = monitor.size();
  let (cw, ch) = canvas_size_phys(scale);
  let strip = (STRIP * scale) as i32;
  let bar_top_phys = (BAR_TOP * scale) as i32;
  let bar_h_phys = (BAR_H * scale) as i32;
  // 缘停靠探边位：top 露条底部 24px（窗顶=屏顶-(BAR_TOP+BAR_H-STRIP)），
  // right 露条左部 24px / left 露条右部 24px（纵向整条在屏内并跟随停靠点）
  let (x, yv) = match mode.as_str() {
    "top" => (
      mp.x + (ms.width as i32 - cw as i32) / 2,
      mp.y - (bar_top_phys + bar_h_phys - strip),
    ),
    "left" => (
      mp.x - (cw as i32 - strip),
      y.clamp(mp.y - bar_top_phys, mp.y + ms.height as i32 - bar_top_phys - bar_h_phys),
    ),
    "right" => (
      mp.x + ms.width as i32 - strip,
      y.clamp(mp.y - bar_top_phys, mp.y + ms.height as i32 - bar_top_phys - bar_h_phys),
    ),
    // 自由驻留：72×72 小窗 logo 满窗原地驻留（钳屏内）。画布态收起时以 logo 为锚
    // （画布 logo 位 (228,10) → 小窗 logo 位 (4,4)）——留在画布左上角会让 logo 跳位
    // 224px，且后续 grow 以小窗位置回锚会累计漂移（复盘 3.80 ⑤ 同款相对锚定教训）
    _ => {
      let hw = (HANDLE_SIZE * scale) as i32;
      let sz = w.outer_size().unwrap_or(tauri::PhysicalSize::new(0, 0));
      let is_canvas = sz.width as f64 >= CANVAS_W * scale;
      let before = w.outer_position().unwrap_or_default();
      let (bx, by) = if is_canvas {
        (
          before.x + ((LOGO_X - LOGO_INSET) * scale) as i32,
          before.y + ((LOGO_Y - LOGO_INSET) * scale) as i32,
        )
      } else {
        (before.x, before.y)
      };
      (
        bx.clamp(mp.x, mp.x + ms.width as i32 - hw),
        by.clamp(mp.y, mp.y + ms.height as i32 - hw),
      )
    }
  };
  let (mw, mh) = match mode.as_str() {
    "top" | "left" | "right" => (cw, ch),
    _ => handle_size_phys(scale),
  };
  morph(&w, mw, mh, x, yv);
  Ok(())
}

/// 展开（2026-11-19）：窗体还原为 520×140 画布并按模式定位，单次原子变形。
/// 缘停靠目标位与 snap_top/dock_right/dock_left 同式（那里服务设置重置/拖拽落位，
/// 窗体已是画布尺寸）；自由驻留以 logo 为锚（小窗 logo 位 (4,4) → 画布 logo 位），
/// 按目标画布尺寸钳屏内——先算目标再原子落位，无中间帧。
#[tauri::command]
pub fn isle_expand(app: AppHandle, mode: String, y: i32) -> Result<(), String> {
  let Some(w) = app.get_webview_window("isle") else { return Ok(()) };
  let scale = w.scale_factor().unwrap_or(1.0);
  let (cw, ch) = canvas_size_phys(scale);
  let monitor = cursor_monitor(&app)?;
  let mp = monitor.position();
  let ms = monitor.size();
  let (dx, dy) = frame_margins(&w);
  let was_small = {
    let sz = w.outer_size().unwrap_or(tauri::PhysicalSize::new(0, 0));
    sz.width > 0 && sz.width < (CANVAS_W * scale) as u32
  };
  let before = w.outer_position().unwrap_or_default();
  let (x, yv) = match mode.as_str() {
    "top" => (mp.x + (ms.width as i32 - (cw as i32 + dx)) / 2, mp.y - (LOGO_Y * scale) as i32),
    "right" => (
      mp.x + ms.width as i32 - cw as i32,
      y.clamp(mp.y, mp.y + ms.height as i32 - (ch as i32 + dy)),
    ),
    "left" => (
      mp.x,
      y.clamp(mp.y, mp.y + ms.height as i32 - (ch as i32 + dy)),
    ),
    _ => {
      if was_small {
        let (ax, ay) = logo_anchor_phys("free", scale);
        let nx = before.x - ax + (LOGO_INSET * scale) as i32;
        let ny = before.y - ay + (LOGO_INSET * scale) as i32;
        (
          nx.clamp(mp.x, mp.x + ms.width as i32 - (cw as i32 + dx)),
          ny.clamp(mp.y, mp.y + ms.height as i32 - (ch as i32 + dy)),
        )
      } else {
        (before.x, before.y)
      }
    }
  };
  morph(&w, cw as f64, ch as f64, x, yv);
  // 从隐藏态呼出（设置页开关「打开」路径直接调 expand）：morph 不改可见性，
  // 隐藏窗必须补 show——呼出的语义=必可见（复盘 3.80「点开找不到 logo」同款根因）
  if !w.is_visible().unwrap_or(false) {
    let _ = w.show();
  }
  Ok(())
}

/// 右键收纳：把岛收到指定去处（2026-11-19 用户需求，logo 右键菜单三项）。
/// 三目标与收起态同形（画布探边位，2026-11-20 探边条形态）：top=条底 24px 探边条
/// 贴顶居中；right=条左部 24px 探边条贴右缘；left=条右部 24px 贴左缘（纵向居中）。
/// 返回落位供前端持久化。
#[tauri::command]
pub fn isle_stash_to(app: AppHandle, target: String) -> Result<serde_json::Value, String> {
  let Some(w) = app.get_webview_window("isle") else {
    return Err("找不到胶囊岛窗口".into());
  };
  let scale = w.scale_factor().unwrap_or(1.0);
  let monitor = cursor_monitor(&app)?;
  let mp = monitor.position();
  let ms = monitor.size();
  let (cw, ch) = canvas_size_phys(scale);
  let strip = (STRIP * scale) as i32;
  let bar_top_phys = (BAR_TOP * scale) as i32;
  let bar_h_phys = (BAR_H * scale) as i32;
  let (mode, x, y) = match target.as_str() {
    "top" => {
      let x = mp.x + (ms.width as i32 - cw as i32) / 2;
      let y = mp.y - (bar_top_phys + bar_h_phys - strip);
      ("top", x, y)
    }
    "right" => {
      let x = mp.x + ms.width as i32 - strip;
      let y = mp.y + (ms.height as i32 - bar_top_phys - bar_h_phys) / 2;
      ("right", x, y)
    }
    "left" => {
      let x = mp.x - (cw as i32 - strip);
      let y = mp.y + (ms.height as i32 - bar_top_phys - bar_h_phys) / 2;
      ("left", x, y)
    }
    _ => return Err(format!("未知的目标位置：{}", target)),
  };
  morph(&w, cw, ch, x, y);
  Ok(serde_json::json!({ "mode": mode, "x": x, "y": y }))
}

/// 右键菜单前置：画布完整可见（菜单 136×112 在探边条/72×72 小窗内放不下，且菜单
/// 必须完整在屏内）。缘停靠=变形到展开位（与 expand 同式）；自由驻留=以 logo 为锚
/// 原位长回画布（logo 不跳位）。菜单位置由前端按点击点钳算。
#[tauri::command]
pub fn isle_grow(app: AppHandle, mode: String, y: i32) -> Result<(), String> {
  let Some(w) = app.get_webview_window("isle") else { return Ok(()) };
  let scale = w.scale_factor().unwrap_or(1.0);
  let (cw, ch) = canvas_size_phys(scale);
  let before = w.outer_position().unwrap_or_default();
  match mode.as_str() {
    // 缘停靠收起态（探边位）→ 展开位（与 isle_expand 缘停靠目标同式）
    "top" => {
      let monitor = cursor_monitor(&app)?;
      let mp = monitor.position();
      let ms = monitor.size();
      let (dx, _dy) = frame_margins(&w);
      let x = mp.x + (ms.width as i32 - (cw as i32 + dx)) / 2;
      let yv = mp.y - (LOGO_Y * scale) as i32;
      morph(&w, cw, ch, x, yv);
    }
    "right" | "left" => {
      let monitor = cursor_monitor(&app)?;
      let mp = monitor.position();
      let ms = monitor.size();
      let (_dx, dy) = frame_margins(&w);
      let x = if mode == "right" { mp.x + ms.width as i32 - cw as i32 } else { mp.x };
      let yv = y.clamp(mp.y, mp.y + ms.height as i32 - (ch as i32 + dy));
      morph(&w, cw, ch, x, yv);
    }
    // 自由驻留：logo 为锚原位长回（小窗 logo 位 (4,4) → 画布 logo 位），logo 不跳位。
    // 已是画布尺寸（悬停展开后的右键）时原位不动——再减一次锚点会把画布推走 224px
    _ => {
      let sz = w.outer_size().unwrap_or(tauri::PhysicalSize::new(0, 0));
      let is_canvas = sz.width as f64 >= CANVAS_W * scale;
      if is_canvas {
        morph(&w, cw, ch, before.x, before.y);
      } else {
        let (ax, ay) = logo_anchor_phys("free", scale);
        let nx = before.x - ax + (LOGO_INSET * scale) as i32;
        let ny = before.y - ay + (LOGO_INSET * scale) as i32;
        morph(&w, cw, ch, nx, ny);
      }
    }
  }
  Ok(())
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
/// 关键事实：Windows 上 start_dragging 是异步发起——立即返回，模态移动循环在其后由
/// 事件循环驱动（实测日志铁证：命令返回时窗口尚未动过）。因此拖拽结束检测放在
/// 轮询线程：左键松开（GetAsyncKeyState）且位置连续两拍稳定 → 真正松手，
/// 此时才做停靠判定/落位，并向 isle 窗发 isle-drag-end {mode,x,y,moved} 供前端持久化。
#[tauri::command]
pub fn isle_start_drag(app: AppHandle) -> Result<(), String> {
  let Some(w) = app.get_webview_window("isle") else { return Ok(()) };
  let before = w.outer_position().map_err(|e| format!("读取位置失败：{}", e))?;
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
