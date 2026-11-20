//! 胶囊岛（双窗架构 · 2026-11-20 用户拍板定稿）：
//! **常驻锚点窗**（isle-anchor，100×32 深色迷你胶囊：白 P + 白色状态词 + 橙色活动点）
//! 永远完全可见=肉眼提示，拖到哪驻留到哪（任意位置，不限预设）；
//! **本体横条窗**（isle，520×140 毛玻璃横条）仅在悬停/单击锚点时出现，其余时间完全
//! 隐藏（屏上无残留、不拦点击）——「任意位置完全隐藏」与「肉眼可见提示」由两个
//! 窗体分别承担，结构上消解单窗「既要藏又要可见」的矛盾（此前十余轮返工根因）。
//!
//! 交互：悬停锚点 → 本体在锚点旁展开（锚点窗隐藏、本体窗显示，位置锚定：本体左上
//! = 锚点左上 - (16,26)·缩放，胶囊落在横条左端帽内，**锚点/胶囊坐标全程不变**）；
//! 光标离开横条 1 秒 → 本体隐藏、锚点原位回归；拖锚点=移动驻留位置（任意位置）；
//! 拖横条=移动+松手收成锚点。窗体 show/hide 即时切换，无 morph、无合成事件竞态。
//!
//! 设置：开关「关」=锚点+本体全部隐藏；「开」=本体展开；「重置」=锚点回顶部居中。

use std::thread;
use tauri::{AppHandle, Emitter, Manager};

const ANCHOR_W: f64 = 100.0; // 锚点胶囊宽（CSS px）
const ANCHOR_H: f64 = 32.0; // 锚点胶囊高
const CANVAS_W: f64 = 520.0; // 本体横条画布宽
const CANVAS_H: f64 = 140.0; // 本体横条画布高
const BAR_TOP: f64 = 10.0; // 横条在画布内的纵坐标
const BAR_H: f64 = 64.0; // 横条高度
const LOGO_INSET: f64 = 4.0; // 锚点内 logo 内缩
/// 本体相对锚点的展开偏移（本体 tl = 锚点 tl + EXPAND 偏移，胶囊落在横条左端帽内）
const EXPAND_DX: f64 = -16.0;
const EXPAND_DY: f64 = -26.0;

fn anchor_window(app: &AppHandle) -> Option<tauri::WebviewWindow> {
  app.get_webview_window("isle-anchor")
}
fn body_window(app: &AppHandle) -> Option<tauri::WebviewWindow> {
  app.get_webview_window("isle")
}
fn canvas_size_phys(scale: f64) -> (f64, f64) {
  (CANVAS_W * scale, CANVAS_H * scale)
}
fn anchor_size_phys(scale: f64) -> (f64, f64) {
  (ANCHOR_W * scale, ANCHOR_H * scale)
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

/// 实况外框-客户边距（无边框窗应为 0；防御性读取）
fn frame_margins(w: &tauri::WebviewWindow) -> (i32, i32) {
  let inner = w.inner_size().unwrap_or_default();
  let outer = w.outer_size().unwrap_or_default();
  (
    (outer.width as i32 - inner.width as i32).max(0),
    (outer.height as i32 - inner.height as i32).max(0),
  )
}

/// 窗体定位（物理 px；防御性读取边距）
fn place_at(w: &tauri::WebviewWindow, x: i32, y: i32) {
  let (dx, dy) = frame_margins(w);
  let _ = w.set_position(tauri::PhysicalPosition::new(x + dx, y + dy));
}

/// 锚点完全可见钳制：tl ∈ [屏幕+2s, 屏幕-尺寸-2s]（物理 px）
fn clamp_anchor(mp: &tauri::PhysicalPosition<i32>, ms: &tauri::PhysicalSize<u32>, x: i32, y: i32, aw: i32, ah: i32) -> (i32, i32) {
  let sw = ms.width as i32;
  let sh = ms.height as i32;
  (
    x.clamp(mp.x + 2, mp.x + sw - aw - 2),
    y.clamp(mp.y + 2, mp.y + sh - ah - 2),
  )
}

/// 锚点还原（最小化的锚点=完全不可见，Win+D/显示桌面会连置顶窗一起最小化）：
/// 岛的任何交互命令执行前先还原，用户下一次接触岛屿即回到可见态。
fn unminimize_anchor(a: &tauri::WebviewWindow) {
  if a.is_minimized().unwrap_or(false) {
    let _ = a.unminimize();
  }
}

/// 锚点窗归位（恢复持久化驻留位置，越界钳回屏内）
#[tauri::command]
pub fn isle_anchor_place(app: AppHandle, x: i32, y: i32) -> Result<(), String> {
  let Some(a) = anchor_window(&app) else { return Ok(()) };
  unminimize_anchor(&a);
  let (aw, ah) = anchor_size_phys(a.scale_factor().unwrap_or(1.0));
  let monitor = cursor_monitor(&app)?;
  let mp = monitor.position();
  let ms = monitor.size();
  let (cx, cy) = clamp_anchor(&mp, &ms, x, y, aw as i32, ah as i32);
  place_at(&a, cx, cy);
  Ok(())
}

/// 悬停/单击锚点：本体在锚点旁展开（本体 tl = 锚点 tl + 展开偏移，钳横条完整可见），
/// 锚点窗隐藏（横条左端帽区域由本体接管），并启动**光标监视**：光标离开横条客户区
/// 持续 1 秒 → 本体隐藏、锚点回归（收回逻辑下沉 Rust 光标轮询——窗体显隐时 Chromium
/// 的 hover 状态不可靠，鼠标事件可能不派发，任何页面侧收回逻辑都会死）。
/// 呼出的语义=必可见（补 show）。
#[tauri::command]
pub fn isle_anchor_hover_show_body(app: AppHandle) -> Result<(), String> {
  let Some(a) = anchor_window(&app) else { return Ok(()) };
  let Some(b) = body_window(&app) else { return Ok(()) };
  unminimize_anchor(&a);
  let scale = b.scale_factor().unwrap_or(1.0);
  let (cw, _ch) = canvas_size_phys(scale);
  let monitor = cursor_monitor(&app)?;
  let mp = monitor.position();
  let ms = monitor.size();
  let ap = a.outer_position().unwrap_or_default();
  let bar_top_phys = (BAR_TOP * scale) as i32;
  let bar_h_phys = (BAR_H * scale) as i32;
  let bx = (ap.x + (EXPAND_DX * scale) as i32).clamp(mp.x, mp.x + ms.width as i32 - cw as i32);
  let by = (ap.y + (EXPAND_DY * scale) as i32).clamp(
    mp.y - bar_top_phys,
    mp.y + ms.height as i32 - bar_top_phys - bar_h_phys,
  );
  let _ = b.set_position(tauri::PhysicalPosition::new(bx, by));
  let _ = b.show();
  let _ = a.hide();
  // 光标监视线程：光标在横条客户区外持续 1 秒 → 收回（本体隐藏+锚点回归）。
  // 轮询 300ms；本体窗隐藏（任何路径）即退出；无 deadline（用户可以一直看着横条）。
  let app2 = app.clone();
  thread::spawn(move || {
    let mut outside_since: Option<std::time::Instant> = None;
    loop {
      thread::sleep(std::time::Duration::from_millis(300));
      let Some(b) = body_window(&app2) else { break };
      if !b.is_visible().unwrap_or(false) {
        break;
      }
      let cursor = app2.cursor_position().unwrap_or_default();
      let bpos = b.outer_position().unwrap_or_default();
      let bsize = b.outer_size().unwrap_or_default();
      let inside = cursor.x >= bpos.x as f64
        && cursor.x < (bpos.x + bsize.width as i32) as f64
        && cursor.y >= bpos.y as f64
        && cursor.y < (bpos.y + bsize.height as i32) as f64;
      if inside {
        outside_since = None;
      } else if outside_since.is_none() {
        outside_since = Some(std::time::Instant::now());
      } else if outside_since.as_ref().unwrap().elapsed() >= std::time::Duration::from_secs(1) {
        let _ = b.hide();
        if let Some(a) = anchor_window(&app2) {
          unminimize_anchor(&a);
          let _ = a.show();
        }
        break;
      }
    }
  });
  Ok(())
}

/// 收起（拖横条结束等路径调用）：本体隐藏、锚点原位回归。
/// 常规收回由光标监视线程承担（见 isle_anchor_hover_show_body）。
#[tauri::command]
pub fn isle_body_hide_show_anchor(app: AppHandle) -> Result<(), String> {
  let Some(a) = anchor_window(&app) else { return Ok(()) };
  let Some(b) = body_window(&app) else { return Ok(()) };
  let _ = b.hide();
  let _ = a.show();
  Ok(())
}

/// 拖拽结束等待：左键松开且窗体位置连续两拍稳定（30 秒兜底超时）。
fn wait_release_stable(app: &AppHandle) {
  let deadline = std::time::Instant::now() + std::time::Duration::from_secs(30);
  let mut last = app
    .get_webview_window("isle")
    .and_then(|w| w.outer_position().ok())
    .unwrap_or_default();
  let mut stable = 0u32;
  loop {
    if std::time::Instant::now() > deadline {
      return;
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
      return;
    }
  }
}

/// 左键当前是否已松开（GetAsyncKeyState 高位=按下）
#[cfg(windows)]
fn left_button_up() -> bool {
  use windows::Win32::UI::Input::KeyboardAndMouse::{GetAsyncKeyState, VK_LBUTTON};
  unsafe { GetAsyncKeyState(VK_LBUTTON.0 as i32) >= 0 }
}
#[cfg(not(windows))]
fn left_button_up() -> bool {
  true
}

/// 拖锚点：原生拖拽锚点窗；松手后按光标位移区分单击/拖动——单击（位移 <3px）=
/// 本体在锚点旁展开；拖动=锚点驻留到落点（缘吸附：近顶 ≤120s 贴顶、近左右缘 ≤80s
/// 贴缘，其余任意位置），并通知锚点页持久化。
#[tauri::command]
pub fn isle_anchor_drag_start(app: AppHandle) -> Result<(), String> {
  let Some(a) = anchor_window(&app) else { return Ok(()) };
  let cursor0 = app.cursor_position().unwrap_or_default();
  let _ = a.start_dragging();
  let app = app.clone();
  thread::spawn(move || {
    wait_release_stable(&app);
    let cursor1 = app.cursor_position().unwrap_or_default();
    let moved = (cursor1.x - cursor0.x).abs() > 3.0 || (cursor1.y - cursor0.y).abs() > 3.0;
    if moved {
      let scale = app
        .get_webview_window("isle-anchor")
        .and_then(|w| w.scale_factor().ok())
        .unwrap_or(1.0);
      let monitor = cursor_monitor(&app).unwrap_or_else(|_| {
        app.primary_monitor().ok().flatten().expect("找不到可用显示器")
      });
      let mp = monitor.position();
      let ms = monitor.size();
      let (aw, ah) = (100.0 * scale, 32.0 * scale);
      let cx = cursor1.x as i32;
      let cy = cursor1.y as i32;
      let (sx, sy) = if cy - mp.y <= (120.0 * scale) as i32 {
        (mp.x + ((ms.width as i32 - aw as i32) / 2), mp.y + gap_i(scale))
      } else if cx - mp.x <= (80.0 * scale) as i32 {
        (mp.x + gap_i(scale), cy)
      } else if mp.x + ms.width as i32 - cx <= (80.0 * scale) as i32 {
        (mp.x + ms.width as i32 - aw as i32 - gap_i(scale), cy)
      } else {
        (cx - (aw as f64 / 2.0) as i32, cy - (ah as f64 / 2.0) as i32)
      };
      if let Some(a) = app.get_webview_window("isle-anchor") {
        place_at(&a, sx, sy);
      }
      let _ = app.emit("isle-anchor-drag-end", serde_json::json!({ "x": sx, "y": sy, "moved": true }));
    } else {
      // 单击=本体在锚点旁展开并保持；drag-end(moved:false) 同时让前端清拖拽态
      let _ = app.emit("isle-anchor-drag-end", serde_json::json!({ "moved": false }));
      let _ = isle_anchor_hover_show_body(app.clone());
    }
  });
  Ok(())
}

fn gap_i(scale: f64) -> i32 {
  (2.0 * scale) as i32
}

/// 拖本体横条：原生拖拽本体窗；松手后锚点落到「横条左端帽」槽位（本体 tl + 展开偏移，
/// 钳完全可见），本体隐藏——拖动=移动+收成锚点。单击横条不收（光标在其上，:hover 守卫
/// 由前端处理）。
#[tauri::command]
pub fn isle_body_drag_start(app: AppHandle) -> Result<(), String> {
  let Some(b) = body_window(&app) else { return Ok(()) };
  let cursor0 = app.cursor_position().unwrap_or_default();
  let _ = b.start_dragging();
  let app = app.clone();
  thread::spawn(move || {
    wait_release_stable(&app);
    let cursor1 = app.cursor_position().unwrap_or_default();
    let moved = (cursor1.x - cursor0.x).abs() > 3.0 || (cursor1.y - cursor0.y).abs() > 3.0;
    if moved {
      let scale = app
        .get_webview_window("isle")
        .and_then(|w| w.scale_factor().ok())
        .unwrap_or(1.0);
      let bp = app
        .get_webview_window("isle")
        .and_then(|w| w.outer_position().ok())
        .unwrap_or_default();
      let (aw, ah) = anchor_size_phys(scale);
      let monitor = cursor_monitor(&app).unwrap_or_else(|_| {
        app.primary_monitor().ok().flatten().expect("找不到可用显示器")
      });
      let mp = monitor.position();
      let ms = monitor.size();
      // 锚点站位（本体 tl + (16,26)，缘吸附：近顶贴顶居中、近缘贴缘纵向跟随）
      let cx = cursor1.x as i32;
      let cy = cursor1.y as i32;
      let (sx, sy, st) = if cy - mp.y <= (120.0 * scale) as i32 {
        (mp.x + ((ms.width as i32 - aw as i32) / 2), mp.y + gap_i(scale), "top")
      } else if cx - mp.x <= (80.0 * scale) as i32 {
        (mp.x + gap_i(scale), cy, "left")
      } else if mp.x + ms.width as i32 - cx <= (80.0 * scale) as i32 {
        (mp.x + ms.width as i32 - aw as i32 - gap_i(scale), cy, "right")
      } else {
        (bp.x + (16.0 * scale) as i32, bp.y + (26.0 * scale) as i32, "free")
      };
      if let Some(a) = anchor_window(&app) {
        place_at(&a, sx, sy);
        let _ = a.show();
      }
      if let Some(b2) = body_window(&app) {
        let _ = b2.hide();
      }
      let _ = app.emit("isle-body-drag-end", serde_json::json!({ "mode": st, "x": sx, "y": sy, "moved": true }));
    }
  });
  Ok(())
}

/// 设置「重置到屏幕顶部居中」：锚点回顶缘下方居中（本体保持隐藏）。
#[tauri::command]
pub fn isle_anchor_snap_top(app: AppHandle) -> Result<(), String> {
  let Some(a) = anchor_window(&app) else { return Ok(()) };
  unminimize_anchor(&a);
  let scale = a.scale_factor().unwrap_or(1.0);
  let (aw, _ah) = anchor_size_phys(scale);
  let monitor = cursor_monitor(&app)?;
  let mp = monitor.position();
  let ms = monitor.size();
  let x = mp.x + ((ms.width as i32 - aw as i32) / 2);
  let y = mp.y + gap_i(scale);
  place_at(&a, x, y);
  let _ = a.show();
  Ok(())
}

/// 设置开关「关」：锚点+本体全部隐藏（屏上无任何物）。
#[tauri::command]
pub fn isle_hide_all(app: AppHandle) -> Result<(), String> {
  if let Some(a) = anchor_window(&app) {
    let _ = a.hide();
  }
  if let Some(b) = body_window(&app) {
    let _ = b.hide();
  }
  Ok(())
}

/// 设置开关「开」：本体在锚点站位展开并保持（既有反馈：开关打开直接展开完整横条）。
#[tauri::command]
pub fn isle_show_expanded(app: AppHandle) -> Result<(), String> {
  let Some(a) = anchor_window(&app) else { return Ok(()) };
  let Some(b) = body_window(&app) else { return Ok(()) };
  unminimize_anchor(&a);
  let scale = b.scale_factor().unwrap_or(1.0);
  let monitor = cursor_monitor(&app)?;
  let mp = monitor.position();
  let ms = monitor.size();
  let ap = a.outer_position().unwrap_or_default();
  let (cw, _ch) = canvas_size_phys(scale);
  let bar_top_phys = (BAR_TOP * scale) as i32;
  let bar_h_phys = (BAR_H * scale) as i32;
  let bx = ap.x.clamp(mp.x, mp.x + ms.width as i32 - cw as i32);
  let by = (ap.y - (26.0 * scale) as i32).clamp(
    mp.y - bar_top_phys,
    mp.y + ms.height as i32 - bar_top_phys - bar_h_phys,
  );
  let _ = b.set_position(tauri::PhysicalPosition::new(bx, by));
  let _ = b.show();
  let _ = a.hide();
  Ok(())
}

/// 自由驻留落位（挂载恢复持久化位置，越界钳回屏内）。
#[tauri::command]
pub fn isle_place(app: AppHandle, x: i32, y: i32) -> Result<(), String> {
  let Some(a) = anchor_window(&app) else { return Ok(()) };
  let (aw, ah) = anchor_size_phys(a.scale_factor().unwrap_or(1.0));
  let monitor = cursor_monitor(&app)?;
  let mp = monitor.position();
  let ms = monitor.size();
  let (cx, cy) = clamp_anchor(&mp, &ms, x, y, aw as i32, ah as i32);
  place_at(&a, cx, cy);
  Ok(())
}

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
