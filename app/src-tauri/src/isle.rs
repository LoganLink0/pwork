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
const HANDLE_SIZE: f64 = 72.0; // 收起态小窗边长（logo 64 + 描边余量 8）
const LOGO_INSET: f64 = 4.0; // 小窗内 logo 内缩（描边环余量）
const LOGO_Y: f64 = 10.0; // 横条内基准纵坐标（snap_top 贴顶用）
const BAR_TOP: f64 = 10.0; // 横条在画布内的纵坐标（CSS px，与 .isle-bar top 一致）
const BAR_H: f64 = 64.0; // 横条高度（CSS px，与 .isle-bar height 一致）

/// 展开态 logo 槽位（画布内 CSS px，与 .open .isle-logo 各模式 left/top 一致）：
/// top=画布居中槽（228,20，横条保持屏中）；right=条内右侧槽（458,20，贴右缘）；
/// left/free=条内左侧槽（10,20）。
fn open_slot(mode: &str) -> (f64, f64) {
  match mode {
    "top" => (228.0, 20.0),
    "right" => (458.0, 20.0),
    _ => (10.0, 20.0),
  }
}

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

/// 收起态（2026-11-20 用户拍板「只展示 LOGO」+「展开过程 LOGO 位置不变」）：
/// 四模式统一 72×72 小窗把手，**完全可见**（不再半探出屏外——半探出与「展开过程
/// logo 不动」数学上互斥：探出部分的 logo 展开时必然位移）。站位=logo 左上角贴缘
/// 完全可见：top=贴顶下方居中（灵动岛站位）/ left·right=贴缘纵向跟随 / free=原地。
/// 画布态收起：小窗 tl = 画布 tl + 展开槽位 - 内缩（logo 不跳位）。命中区=小窗本体。
fn handle_target(app: &AppHandle, w: &tauri::WebviewWindow, mode: &str, y: i32) -> Result<(i32, i32), String> {
  let scale = w.scale_factor().unwrap_or(1.0);
  let monitor = cursor_monitor(app)?;
  let mp = monitor.position();
  let ms = monitor.size();
  let hw = (HANDLE_SIZE * scale) as i32;
  let gap = (2.0 * scale) as i32;
  let inset = (LOGO_INSET * scale) as i32;
  let (slot_x, slot_y) = open_slot(mode);
  let sz = w.outer_size().unwrap_or(tauri::PhysicalSize::new(0, 0));
  let is_canvas = sz.width as f64 >= CANVAS_W * scale;
  let before = w.outer_position().unwrap_or_default();
  // 画布态：小窗 tl = 画布 tl + 槽位 - 内缩（logo 落在展开槽位=不跳位）；小窗态：原位
  let anchored = (
    before.x + ((slot_x - LOGO_INSET) * scale) as i32,
    before.y + ((slot_y - LOGO_INSET) * scale) as i32,
  );
  let kept = (before.x, before.y);
  let (x, yv) = match mode {
    "top" => {
      let x = if is_canvas { anchored.0 } else { mp.x + (ms.width as i32 - hw) / 2 + inset };
      // 顶站位 y=mp.y+6s（logo 上缘 10s）：展开钳制界=mp.y-10s，小窗-16s 恰好无钳制
      // （logo 展开全程零位移）
      (x, mp.y + gap + (4.0 * scale) as i32)
    }
    "left" => {
      // 左站位 x=mp.x+6s（logo 左缘 10s）：展开钳制界=mp.x，小窗-6s 恰好无钳制
      let x = mp.x + gap + (4.0 * scale) as i32;
      let y = if is_canvas { anchored.1 } else { y.clamp(mp.y + gap - inset, mp.y + ms.height as i32 - hw - gap + inset) };
      (x, y)
    }
    "right" => {
      let x = mp.x + ms.width as i32 - hw + gap - inset;
      let y = if is_canvas { anchored.1 } else { y.clamp(mp.y + gap - inset, mp.y + ms.height as i32 - hw - gap + inset) };
      (x, y)
    }
    _ => {
      let (bx, by) = if is_canvas { anchored } else { kept };
      (
        bx.clamp(mp.x + gap - inset, mp.x + ms.width as i32 - hw - gap + inset),
        by.clamp(mp.y + gap - inset, mp.y + ms.height as i32 - hw - gap + inset),
      )
    }
  };
  Ok((x, yv))
}

/// 收起（四模式统一小窗把手，完全可见）。
#[tauri::command]
pub fn isle_peek(app: AppHandle, mode: String, y: i32) -> Result<(), String> {
  let Some(w) = app.get_webview_window("isle") else { return Ok(()) };
  let (hw, hh) = handle_size_phys(w.scale_factor().unwrap_or(1.0));
  let (x, yv) = handle_target(&app, &w, &mode, y)?;
  morph(&w, hw, hh, x, yv);
  Ok(())
}

/// 展开（2026-11-20 用户拍板「展开过程 LOGO 位置不变」）：窗体还原为 520×140 画布，
/// **画布左上 = 把手 logo 左上 - 展开槽位偏移**——logo 左上角坐标全程不变（仅按
/// .open 槽位 64→44 原地缩小），横条在 logo 周围淡入。钳制只保横条完整可见
/// （画布 y10..74、x0..520 进屏；画布透明余量允许悬出屏外）。
#[tauri::command]
pub fn isle_expand(app: AppHandle, mode: String, _y: i32) -> Result<(), String> {
  let Some(w) = app.get_webview_window("isle") else { return Ok(()) };
  let scale = w.scale_factor().unwrap_or(1.0);
  let (cw, ch) = canvas_size_phys(scale);
  let monitor = cursor_monitor(&app)?;
  let mp = monitor.position();
  let ms = monitor.size();
  let inset = (LOGO_INSET * scale) as i32;
  let (slot_x, slot_y) = open_slot(&mode);
  let bar_top_phys = (BAR_TOP * scale) as i32;
  let bar_h_phys = (BAR_H * scale) as i32;
  let sz = w.outer_size().unwrap_or(tauri::PhysicalSize::new(0, 0));
  let is_small = sz.width > 0 && (sz.width as f64) < CANVAS_W * scale;
  let before = w.outer_position().unwrap_or_default();
  let (x, yv) = if is_small {
    // 画布 tl = 把手 logo 左上 - 槽位偏移（logo 不动），钳横条完整可见
    let px = before.x + inset;
    let py = before.y + inset;
    (
      (px - (slot_x * scale) as i32).clamp(mp.x, mp.x + ms.width as i32 - cw as i32),
      (py - (slot_y * scale) as i32).clamp(mp.y - bar_top_phys, mp.y + ms.height as i32 - bar_top_phys - bar_h_phys),
    )
  } else {
    (before.x, before.y)
  };
  let _ = &_y;
  morph(&w, cw as f64, ch as f64, x, yv);
  // 从隐藏态呼出（设置页开关「打开」路径直接调 expand）：morph 不改可见性，
  // 隐藏窗必须补 show——呼出的语义=必可见（复盘 3.80「点开找不到 logo」同款根因）
  if !w.is_visible().unwrap_or(false) {
    let _ = w.show();
  }
  Ok(())
}

/// 右键收纳：把岛收到指定去处（2026-11-19 用户需求，logo 右键菜单三项）。
/// 三目标与收起态同形（小窗把手完全可见贴缘）：top=贴顶下方 10px 居中（横向跟随
/// 画布 logo，横条居中→把手居中）；right=贴右缘内 2px **纵向居中**；left=贴左缘
/// 内 2px 纵向居中——纵向居中是既有共识（重构曾把 y=0 透传进画布锚定分支，把手
/// 被收到屏幕顶角）。**收纳是刻意搬家：定位不锚画布位置**（与 peek 的「纵向跟随
/// 展开位」不同语义）。返回落位供前端持久化。
#[tauri::command]
pub fn isle_stash_to(app: AppHandle, target: String) -> Result<serde_json::Value, String> {
  let Some(w) = app.get_webview_window("isle") else {
    return Err("找不到胶囊岛窗口".into());
  };
  let scale = w.scale_factor().unwrap_or(1.0);
  let monitor = cursor_monitor(&app)?;
  let mp = monitor.position();
  let ms = monitor.size();
  let hw = (HANDLE_SIZE * scale) as i32;
  let inset4 = (LOGO_INSET * scale) as i32;
  let gap_i = (2.0 * scale) as i32;
  let (slot_x, _slot_y) = open_slot(&target);
  let sz = w.outer_size().unwrap_or(tauri::PhysicalSize::new(0, 0));
  let is_canvas = sz.width as f64 >= CANVAS_W * scale;
  let before = w.outer_position().unwrap_or_default();
  let (x, y) = match target.as_str() {
    // 贴顶下方 10s，横向跟随画布 logo（横条居中→把手居中）
    "top" => {
      let ax = if is_canvas { before.x + ((slot_x - LOGO_INSET) * scale) as i32 } else { mp.x + (ms.width as i32 - hw) / 2 + inset4 };
      (ax, mp.y + gap_i + (4.0 * scale) as i32)
    }
    // 贴缘内 2s，纵向居中（刻意搬家：不锚画布位置）
    "left" => (mp.x + gap_i - inset4, mp.y + ((ms.height as i32 - hw) / 2).max(mp.y + gap_i)),
    "right" => (
      mp.x + ms.width as i32 - hw + gap_i - inset4,
      mp.y + ((ms.height as i32 - hw) / 2).max(mp.y + gap_i),
    ),
    _ => return Err(format!("未知的目标位置：{}", target)),
  };
  morph(&w, hw as f64, hw as f64, x, y);
  Ok(serde_json::json!({ "mode": target, "x": x, "y": y }))
}

/// 右键菜单前置：画布完整可见（菜单在小窗内放不下且不得出屏）——四模式统一
/// logo 锚定长回画布（画布 tl = 把手 logo 左上 - 展开槽位偏移，logo 不跳位）；
/// 已是画布尺寸（悬停展开后的右键）时原位不动。菜单位置由前端按点击点钳算。
#[tauri::command]
pub fn isle_grow(app: AppHandle, mode: String, _y: i32) -> Result<(), String> {
  let Some(w) = app.get_webview_window("isle") else { return Ok(()) };
  let scale = w.scale_factor().unwrap_or(1.0);
  let (cw, ch) = canvas_size_phys(scale);
  let monitor = cursor_monitor(&app)?;
  let mp = monitor.position();
  let ms = monitor.size();
  let inset = (LOGO_INSET * scale) as i32;
  let bar_top_phys = (BAR_TOP * scale) as i32;
  let bar_h_phys = (BAR_H * scale) as i32;
  let (slot_x, slot_y) = open_slot(&mode);
  let sz = w.outer_size().unwrap_or(tauri::PhysicalSize::new(0, 0));
  let is_canvas = sz.width as f64 >= CANVAS_W * scale;
  if is_canvas {
    return Ok(());
  }
  let before = w.outer_position().unwrap_or_default();
  let px = before.x + inset;
  let py = before.y + inset;
  let x = (px - (slot_x * scale) as i32).clamp(mp.x, mp.x + ms.width as i32 - cw as i32);
  let yv = (py - (slot_y * scale) as i32).clamp(mp.y - bar_top_phys, mp.y + ms.height as i32 - bar_top_phys - bar_h_phys);
  morph(&w, cw, ch, x, yv);
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
  let cursor0 = app.cursor_position().unwrap_or_default();
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
    // moved 判定用**光标位移**（≥3px）而非窗体位置：原地单击把手时，decide_and_place
    // 的贴缘重定位本身会移动窗体，把它算进 moved 会把单击误判成拖动 → 收回（
    // 「弹出即消失」复发，2026-11-20 右/左缘实测）。单击（光标没动）= 展开分支；
    // 真拖动才做停靠判定落位。
    let cursor1 = app.cursor_position().unwrap_or_default();
    let moved_cursor = (cursor1.x - cursor0.x).abs() > 3.0 || (cursor1.y - cursor0.y).abs() > 3.0;
    let moved = moved_cursor && before != final_pos;
    let (mode, pos) = if moved_cursor {
      decide_and_place(&app, final_pos)
    } else {
      (String::new(), final_pos)
    };
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
