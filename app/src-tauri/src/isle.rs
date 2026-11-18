//! 胶囊岛窗（伙伴常驻形态·自由拖拽+顶部吸附式）：
//! 固定 520×140 透明画布，收起态=logo 本体（64px 品牌胶囊）居中画布，
//! 展开态=毛玻璃横条（logo 滑至条内左侧+状态单行）。
//! 按住 logo 原生拖拽（start_dragging），松手驻留（位置持久化在前端 localStorage），
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

/// 完全隐藏（2026-11-18 三轮重做，用户反馈余量环仍拦截下层点击）：窗口缩到 logo
/// 精确尺寸（64×64）——「logo 以外」不复存在，余量环消失，下层必然点得到；
/// SetWindowRgn 把命中区裁成 logo 圆角矩形只作增强（裁掉圆角外四个小角），
/// 失效兜底=窗口本身已只有 logo 大小（SetWindowRgn 曾实测静默失效 rgn=NONE）。
/// free 模式（屏幕中间驻留）同样可隐藏：窗缩到 logo 尺寸并留在原位。
/// 呼出=鼠标进入小窗，isle_expand 恢复画布并清除 region。
const PEEK_LOGO: f64 = 64.0; // logo 本体尺寸（与前端 .isle-logo 一致）

/// 把窗口命中区裁为 logo 圆角矩形（物理 px；region 外系统级完全穿透）。
/// peek 窗口=logo 精确尺寸，region 只裁掉 logo 圆角外的四个小角。
/// 设置后立即回读验证：失败/被清非静默，console 留痕（此前实测静默失效 rgn=NONE）。
#[cfg(windows)]
fn clip_region_to_logo(w: &tauri::WebviewWindow) {
  use windows::Win32::Graphics::Gdi::{
    CreateRectRgn, CreateRoundRectRgn, GDI_REGION_TYPE, GetWindowRgn, SetWindowRgn,
  };
  let scale = w.scale_factor().unwrap_or(1.0);
  let Ok(hwnd) = w.hwnd() else { return };
  let logo = (PEEK_LOGO * scale) as i32;
  let radius = (18.0 * scale) as i32; // 与前端 .isle-logo border-radius 一致
  unsafe {
    let region = CreateRoundRectRgn(0, 0, logo, logo, radius, radius);
    let applied = SetWindowRgn(hwnd, Some(region), true);
    // 回读验证（SetWindowRgn 曾静默失效——不静默，留痕）：GetWindowRgn 只收 region 句柄
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
  let logo = (PEEK_LOGO * scale) as i32;
  match mode.as_str() {
    // 顶缘：logo 上半露出贴顶居中（窗=logo 精确尺寸——「logo 以外」不复存在，
    // 2026-11-18 用户反馈余量环仍拦截下层；命中裁剪 region 作为圆角增强保留）
    "top" => {
      let _ = w.set_size(tauri::PhysicalSize::new(logo as u32, logo as u32));
      let _ = w.set_position(tauri::PhysicalPosition::new(mp.x + (ms.width as i32 - logo) / 2, mp.y));
    }
    // 左缘：logo 左半露出贴左，纵向跟随停靠位 y
    "left" => {
      let _ = w.set_size(tauri::PhysicalSize::new(logo as u32, logo as u32));
      let _ = w.set_position(tauri::PhysicalPosition::new(mp.x, my_val(mp.y, y)));
    }
    // 右缘：logo 右半露出贴右
    "right" => {
      let _ = w.set_size(tauri::PhysicalSize::new(logo as u32, logo as u32));
      let _ = w.set_position(tauri::PhysicalPosition::new(mp.x + ms.width as i32 - logo, my_val(mp.y, y)));
    }
    // 自由驻留（用户反馈中间驻留无法隐藏）：窗口缩到 logo 尺寸并留在原位
    _ => {
      let _ = w.set_size(tauri::PhysicalSize::new(logo as u32, logo as u32));
      let cur = w.outer_position().unwrap_or(tauri::PhysicalPosition::new(mp.x, mp.y));
      let (cx, cy) = clamp_pos(&w, cur.x, cur.y);
      let _ = w.set_position(tauri::PhysicalPosition::new(cx, cy));
    }
  }
  // 命中裁剪增强（用户拍板方案 A）：region 把窗口四角（logo 圆角外）也裁掉——
  // SetWindowRgn 曾实测静默失效（rgn=NONE），故窗口尺寸已先缩到 logo 精确尺寸兜底；
  // region 成功则连四角也穿透，失败仅四小角拦截。失效会经回读留痕（不静默）。
  #[cfg(windows)]
  clip_region_to_logo(&w);
  Ok(())
}

/// peek 窗纵向定位：跟随停靠位 y（画布顶），上移一个 pad 内的视觉偏移并钳回屏内
fn my_val(monitor_y: i32, y: i32) -> i32 {
  monitor_y + y.max(0)
}

/// 从完全隐藏恢复：画布尺寸复位并按模式定位（top 吸顶居中 / left·right 保持纵向），
/// 清除命中裁剪，并显示窗口（2026-11-18 开关链路修复：设置页开关在窗隐藏态直接调
/// expand——旧交互 expand 前窗必然可见（鼠标靠近才展开），开关场景打破了这个前提，
/// 缺 show 时窗永远隐藏——「点开找不到 logo/闪现一下消失」的根因）
#[tauri::command]
pub fn isle_expand(app: AppHandle, mode: String, y: i32) -> Result<(), String> {
  let Some(w) = app.get_webview_window("isle") else { return Ok(()) };
  let scale = w.scale_factor().unwrap_or(1.0);
  let _ = w.set_size(tauri::PhysicalSize::new(
    (CANVAS_W * scale) as u32,
    (140.0 * scale) as u32,
  ));
  #[cfg(windows)]
  clear_region(&w);
  let _ = w.show();
  match mode.as_str() {
    "top" => snap_top(&app),
    "left" => dock_left(&app, y),
    "right" => dock_right(&app, y),
    _ => Ok(()),
  }
}

/// 拖拽落点的停靠模式判定与落位（拖拽真正结束后调用）：
/// 落点近屏顶（窗顶距屏顶 ≤120·缩放）→ top（灵动岛，零间距贴顶居中）；
/// logo 中心近屏幕右缘（≤80·缩放）→ right（右缘停靠，纵向保持落点并钳进屏内）；
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

  if after.y - my <= (120.0 * scale) as i32 {
    let _ = snap_top(app);
    let final_pos = w.outer_position().unwrap_or(after);
    return ("top".into(), final_pos);
  }
  // 左缘判定在右缘之前（窗宽大于落点偏移时两个条件可同时近似成立，先近者赢）
  if after.x - mx <= (80.0 * scale) as i32 {
    let _ = dock_left(app, after.y);
    let final_pos = w.outer_position().unwrap_or(after);
    return ("left".into(), final_pos);
  }
  if after.x + (260.0 * scale) as i32 >= mx + mw - (80.0 * scale) as i32 {
    let _ = dock_right(app, after.y);
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

/// 胶囊岛：按住 logo 原生拖拽（在 logo mousedown 时调用）。
/// 关键事实：Windows 上 start_dragging 是异步发起——立即返回，模态移动循环在其后由
/// 事件循环驱动（实测日志铁证：命令返回时窗口尚未动过）。因此拖拽结束检测放在
/// 轮询线程：左键松开（GetAsyncKeyState）且位置连续两拍稳定 → 真正松手，
/// 此时才做停靠判定/落位，并向 isle 窗发 isle-drag-end {mode,x,y,moved} 供前端持久化。
#[tauri::command]
pub fn isle_start_drag(app: AppHandle) -> Result<(), String> {
  let Some(w) = app.get_webview_window("isle") else { return Ok(()) };
  let before = w.outer_position().map_err(|e| format!("读取位置失败：{}", e))?;
  // 从隐藏态（region 裁剪）抓起：先清裁剪再恢复画布尺寸，否则拖动全程命中区缺失
  #[cfg(windows)]
  clear_region(&w);
  let scale = w.scale_factor().unwrap_or(1.0);
  let _ = w.set_size(tauri::PhysicalSize::new(
    (CANVAS_W * scale) as u32,
    (140.0 * scale) as u32,
  ));
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
