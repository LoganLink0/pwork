//! 胶囊岛（双窗架构 · 2026-11-21 用户定案语义）：
//! **锚点=收纳态专属形态**，只存在于贴边带（近顶 ≤120px / 近左右缘 ≤80px）；
//! **非贴边区只有本体横条**（自由驻留=稳定态，屏上只有胶囊岛，无锚点、无自动收回）。
//! 状态机：
//!   贴顶收纳   锚点横排(100×32)贴顶居中，本体完全隐藏
//!   贴缘收纳   锚点竖排(44×100)贴左/右缘（贴缘侧直角），本体完全隐藏
//!   临时展开   悬停/单击锚点呼出，本体在锚点旁展开；光标离开 1 秒→回收纳态
//!   自由驻留   拖横条/锚点到非贴边区松手，本体原位驻留（离开不收回）
//!   隐藏       设置开关「关」，锚点+本体全无
//! 拖拽落点统一定形态：贴边带内→收纳锚点（顶横排/缘竖排），非贴边→本体驻留。
//! 窗体 show/hide 即时切换，无 morph、无合成事件竞态。
//!
//! 设置：开关「关」=全隐藏；「开」=恢复持久化状态（isle_restore）；「重置」=锚点
//! 回顶部收纳。

use std::sync::atomic::{AtomicBool, Ordering};
use std::thread;
use tauri::{AppHandle, Emitter, Manager};

const ANCHOR_W: f64 = 100.0; // 锚点横排宽（CSS px，顶站位）
const ANCHOR_H: f64 = 32.0; // 锚点横排高
const ANCHOR_VERT_W: f64 = 44.0; // 锚点竖排宽（左右缘站位）
const ANCHOR_VERT_H: f64 = 100.0; // 锚点竖排高
const CANVAS_W: f64 = 320.0; // 本体横条画布宽（320 无按钮紧凑条）
const CANVAS_H: f64 = 84.0; // 本体横条画布高（bar 64 + 上下余量）
const BAR_TOP: f64 = 10.0; // 横条在画布内的纵坐标
const BAR_H: f64 = 64.0; // 横条高度
const SNAP_TOP: f64 = 120.0; // 贴顶吸附带（CSS px，光标 y 距屏顶）
const SNAP_EDGE: f64 = 80.0; // 贴缘吸附带（光标 x 距左/右缘）
const STASH_TOP_GAP: f64 = 16.0; // 顶站位锚点离屏顶距离（16px：与呼出后横条内
// LOGO 白圆的纵坐标精确对齐——LOGO 屏幕位置一个像素不动的几何前提）
const EXPAND_DX: f64 = -16.0; // 顶站位展开偏移：本体 tl = 锚点 tl + 偏移。
// 几何：锚点内白 P 圆中心在锚点 (16,16)，横条内 LOGO 白圆中心在画布 (32,42)，
// 偏移 (16-32, 16-42)=(-16,-26) 让两个白圆中心重合=「LOGO 位置不变」
const EXPAND_DY: f64 = -26.0;
const EXPAND_GAP: f64 = 2.0; // 缘站位展开间隙：横条与竖排锚点之间

/// 光标监视启停（true=临时展开监视中；自由驻留/收纳/隐藏必须为 false，
/// 否则稳定驻留的横条会被误收回——2026-11-21 语义：监视只属于临时展开）
static WATCH_ENABLED: AtomicBool = AtomicBool::new(false);
/// 监视线程在跑标记（防重复 spawn：重复呼出只复用现有线程）
static WATCH_RUNNING: AtomicBool = AtomicBool::new(false);

/// 锚点站位形态
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
enum AnchorMode {
  Top,
  Left,
  Right,
}

fn anchor_window(app: &AppHandle) -> Option<tauri::WebviewWindow> {
  app.get_webview_window("isle-anchor")
}
fn body_window(app: &AppHandle) -> Option<tauri::WebviewWindow> {
  app.get_webview_window("isle")
}
fn canvas_size_phys(scale: f64) -> (f64, f64) {
  (CANVAS_W * scale, CANVAS_H * scale)
}
/// 锚点形态尺寸（物理 px）：顶=横排，缘=竖排
fn anchor_size_phys(mode: AnchorMode, scale: f64) -> (f64, f64) {
  match mode {
    AnchorMode::Top => (ANCHOR_W * scale, ANCHOR_H * scale),
    AnchorMode::Left | AnchorMode::Right => (ANCHOR_VERT_W * scale, ANCHOR_VERT_H * scale),
  }
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

/// 客户区左上的屏幕坐标（Win11 无边框窗的 DWM 隐形边让外框≠客户区，
/// 所有站位计算一律用客户区语义——外框坐标差 (8,1) 的分量与总差 (16,9) 不同，
/// 用总差补偿会整体偏 (8,8)，曾致全部落位偏 (24,10)）
#[cfg(windows)]
fn client_origin(w: &tauri::WebviewWindow) -> (i32, i32) {
  use windows::Win32::Foundation::POINT;
  use windows::Win32::Graphics::Gdi::ClientToScreen;
  let hwnd = w.hwnd().unwrap_or_default();
  let mut pt = POINT::default();
  let ok = unsafe { ClientToScreen(windows::Win32::Foundation::HWND(hwnd.0), &mut pt) };
  if !ok.as_bool() {
    return (0, 0); // 调用失败（窗已销毁等）：回退原点，落位走钳制保底
  }
  (pt.x, pt.y)
}
#[cfg(not(windows))]
fn client_origin(w: &tauri::WebviewWindow) -> (i32, i32) {
  let p = w.outer_position().unwrap_or_default();
  (p.x, p.y)
}

/// 窗体定位（x/y=客户区左上目标；实测「客户区相对外框的左上偏移」精确补偿）
fn place_at(w: &tauri::WebviewWindow, x: i32, y: i32) {
  let outer = w.outer_position().unwrap_or_default();
  let (cox, coy) = client_origin(w);
  let _ = w.set_position(tauri::PhysicalPosition::new(x - (cox - outer.x), y - (coy - outer.y)));
}

/// 锚点还原（最小化的锚点=完全不可见，Win+D/显示桌面会连置顶窗一起最小化）：
/// 岛的任何交互命令执行前先还原，用户下一次接触岛屿即回到可见态。
fn unminimize_anchor(a: &tauri::WebviewWindow) {
  if a.is_minimized().unwrap_or(false) {
    let _ = a.unminimize();
  }
}

/// 「隐藏」=真 hide（ShowWindow SW_HIDE）。实测结论矩阵（多轮实验的最终版）：
/// - hide→show 循环本身不破坏鼠标分发（0d687d1 初版全程验证）
/// - **显示状态下**的 set_size / place（含「移到屏外再 place 回屏内」的 park 模式）
///   会让 WebView2 停止派发 mousedown（move 仍可达）——多轮返工的真凶
/// - SetWindowRgn 隐藏/恢复会让透明窗渲染退化（白底/窗装饰/rgn 外泄漏）——已废弃
/// 组合规则：set_size 与 place 只在 hide 状态下做，show 最后一步，显示态零重排。
/// （各调用点直接使用 w.hide() / w.show()，不设包装。）

/// 锚点完全可见钳制：tl ∈ [屏幕+2s, 屏幕-尺寸-2s]（物理 px）
fn clamp_anchor(mp: &tauri::PhysicalPosition<i32>, ms: &tauri::PhysicalSize<u32>, x: i32, y: i32, aw: i32, ah: i32) -> (i32, i32) {
  let sw = ms.width as i32;
  let sh = ms.height as i32;
  (
    x.clamp(mp.x + 2, mp.x + sw - aw - 2),
    y.clamp(mp.y + 2, mp.y + sh - ah - 2),
  )
}

/// 拖拽落点 → 收纳形态（贴边带判定：顶带优先，其次左右缘带）
fn decide_anchor_mode(mp: &tauri::PhysicalPosition<i32>, ms: &tauri::PhysicalSize<u32>, scale: f64, cx: f64, cy: f64) -> AnchorMode {
  let top_band = (SNAP_TOP * scale) as f64;
  let edge_band = (SNAP_EDGE * scale) as f64;
  if cy - mp.y as f64 <= top_band {
    AnchorMode::Top
  } else if cx - mp.x as f64 <= edge_band {
    AnchorMode::Left
  } else if (mp.x + ms.width as i32) as f64 - cx <= edge_band {
    AnchorMode::Right
  } else {
    AnchorMode::Top // 非贴边区不落锚点（调用方先判带再调用）
  }
}

/// 落点在贴边带内？（顶带 / 左右缘带任一命中）
fn in_snap_band(mp: &tauri::PhysicalPosition<i32>, ms: &tauri::PhysicalSize<u32>, scale: f64, cx: f64, cy: f64) -> bool {
  let top_band = SNAP_TOP * scale;
  let edge_band = SNAP_EDGE * scale;
  cy - mp.y as f64 <= top_band
    || cx - mp.x as f64 <= edge_band
    || (mp.x + ms.width as i32) as f64 - cx <= edge_band
}

/// 收纳锚点落位（按形态贴边：顶=水平居中；缘=贴缘+纵向 tl 钳屏内完全可见）。
/// tl_y：锚点左上角纵坐标（拖拽=落点纵向位置 - 高/2；恢复=持久化 y）
fn anchor_station(mode: AnchorMode, mp: &tauri::PhysicalPosition<i32>, ms: &tauri::PhysicalSize<u32>, scale: f64, tl_y: f64) -> (i32, i32) {
  let (aw, ah) = anchor_size_phys(mode, scale);
  let (aw, ah) = (aw as i32, ah as i32);
  let sw = ms.width as i32;
  let sh = ms.height as i32;
  let gap = (2.0 * scale) as i32;
  let y = (tl_y as i32).clamp(mp.y + 2, mp.y + sh - ah - 2);
  match mode {
    // 顶站位离屏顶 16px：呼出后横条内 LOGO 白圆的纵坐标与锚点白圆精确对齐
    AnchorMode::Top => (mp.x + (sw - aw) / 2, mp.y + (STASH_TOP_GAP * scale) as i32),
    AnchorMode::Left => (mp.x + gap, y),
    AnchorMode::Right => (mp.x + sw - aw - gap, y),
  }
}

/// 切换锚点窗形态（尺寸随站位：顶横排 100×32 / 缘竖排 44×112，物理 px），
/// 并广播 isle-anchor-form 让锚点页切换渲染形态。
fn set_anchor_form(a: &tauri::WebviewWindow, mode: AnchorMode) {
  let scale = a.scale_factor().unwrap_or(1.0);
  let (aw, ah) = anchor_size_phys(mode, scale);
  let _ = a.set_size(tauri::PhysicalSize::new(aw as u32, ah as u32));
  let name = match mode {
    AnchorMode::Top => "top",
    AnchorMode::Left => "left",
    AnchorMode::Right => "right",
  };
  let _ = a.emit("isle-anchor-form", serde_json::json!({ "mode": name }));
}

/// 锚点切形态并落位：hide→尺寸切换→落位→show（set_size 与 place 都在隐藏状态下
/// 做，显示态零重排——显示中的 resize/place 会让 WebView2 停止派发 mousedown）。
fn restyle_anchor(a: &tauri::WebviewWindow, am: AnchorMode, sx: i32, sy: i32) {
  let _ = a.hide();
  set_anchor_form(a, am);
  place_at(a, sx, sy);
  let _ = a.show();
}
/// 锚点回归显示（最小化还原；锚点位置恒定无需落位）
fn restore_anchor_show(a: &tauri::WebviewWindow) {
  unminimize_anchor(a);
  let _ = a.show();
}

/// 锚点交互可见性：隐藏中的锚点不参与悬停/按下判定
fn is_anchor_hidden(a: &tauri::WebviewWindow) -> bool {
  a.is_visible().map(|v| !v).unwrap_or(true)
}

/// 锚点拖拽跟随标志：钩子 MOVE 事件据此实时移动锚点（轮询线程置位/复位）
static ANCHOR_DRAGGING: AtomicBool = AtomicBool::new(false);

/// 呼出抑制（拖拽落位收纳后的限时 grace）：落点=光标所在，锚点恰好出现在光标下——
/// 悬停积累立即把刚收纳的岛重新呼出，收纳动作粘不住落点（实机实测：拖横条贴顶
/// 收纳后 280ms 即回弹展开）。抑制期内悬停积累清零；到期后恢复正常悬停语义
/// （限时而非无限期，避免旧版「落位抑制吃掉悬停展开」复发）。
static EXPAND_SUPPRESS: std::sync::Mutex<Option<std::time::Instant>> = std::sync::Mutex::new(None);

fn suppress_expand(dur_ms: u64) {
  if let Ok(mut g) = EXPAND_SUPPRESS.lock() {
    *g = Some(std::time::Instant::now() + std::time::Duration::from_millis(dur_ms));
  }
}

fn expand_suppressed() -> bool {
  EXPAND_SUPPRESS
    .lock()
    .ok()
    .and_then(|g| *g)
    .map_or(false, |t| std::time::Instant::now() < t)
}

/// 低级鼠标钩子：拖拽中实时移动锚点到光标（中心对齐）。WebView2 对经历隐藏循环
/// 的窗不再派发 mousedown（实测），锚点的按下/拖动无法走页面事件——按下检测
/// 用 GetAsyncKeyState 轮询（交互线程），拖拽跟手用本钩子（move 频率=系统级）。
/// 低级钩子的回调在「安装线程」的消息泵里触发——安装与泵必须在同一线程，
/// 否则回调永不触发且全局鼠标输入被冻结（实测）。
#[cfg(windows)]
fn spawn_mouse_hook() {
  use windows::Win32::Foundation::{LPARAM, WPARAM};
  use windows::Win32::UI::WindowsAndMessaging::{
    GetMessageW, MSG, MSLLHOOKSTRUCT, SetWindowsHookExW, WH_MOUSE_LL,
  };
  thread::spawn(|| {
    let hook = unsafe { SetWindowsHookExW(WH_MOUSE_LL, Some(mouse_proc), None, 0) };
    if hook.is_err() {
      return;
    }
    // 消息泵：低级钩子回调依赖安装线程的消息循环
    let mut msg = MSG::default();
    unsafe {
      while GetMessageW(&mut msg, None, 0, 0).as_bool() {}
    }
  });
  unsafe extern "system" fn mouse_proc(nc: i32, wp: WPARAM, lp: LPARAM) -> windows::Win32::Foundation::LRESULT {
    use windows::Win32::UI::WindowsAndMessaging::{CallNextHookEx, HC_ACTION, WM_MOUSEMOVE};
    if nc as u32 == HC_ACTION && wp.0 as u32 == WM_MOUSEMOVE && ANCHOR_DRAGGING.load(Ordering::SeqCst) {
      let st = unsafe { &*(lp.0 as *const MSLLHOOKSTRUCT) };
      let app = ISLE_APP_HANDLE.lock().ok().and_then(|h| h.clone());
      if let Some(app) = app {
        if let Some(a) = app.get_webview_window("isle-anchor") {
          let sz = a.inner_size().unwrap_or_default();
          let tx = st.pt.x - sz.width as i32 / 2;
          let ty = st.pt.y - sz.height as i32 / 2;
          let outer = a.outer_position().unwrap_or_default();
          let (cox, coy) = client_origin(&a);
          let _ = a.set_position(tauri::PhysicalPosition::new(
            tx - (cox - outer.x),
            ty - (coy - outer.y),
          ));
        }
      }
    }
    unsafe { CallNextHookEx(None, nc, wp, lp) }
  }
}
#[cfg(not(windows))]
fn spawn_mouse_hook() {}

/// 应用句柄存档（钩子回调线程取用；钩子回调无法携带 Tauri AppHandle）
static ISLE_APP_HANDLE: std::sync::Mutex<Option<AppHandle>> = std::sync::Mutex::new(None);
#[cfg(windows)]
fn anchor_key_down() -> bool {
  use windows::Win32::UI::Input::KeyboardAndMouse::{GetAsyncKeyState, VK_LBUTTON};
  unsafe { GetAsyncKeyState(VK_LBUTTON.0 as i32) < 0 }
}
#[cfg(not(windows))]
fn anchor_key_down() -> bool {
  false
}

/// 锚点交互线程（常驻，应用启动即 spawn）：悬停呼出与按住拖动全部在此轮询驱动。
/// WebView2 对经历隐藏循环的窗不再派发 mousedown（实测：move 类事件可达、
/// 按键类事件停在顶层窗），任何页面侧锚点交互都不可靠——按下用 GetAsyncKeyState
/// 轮询捕获，拖拽跟手由低级鼠标钩子承担，锚点窗退化为纯渲染视图。
pub fn spawn_anchor_interactor(app: AppHandle) {
  let stored = ISLE_APP_HANDLE.lock().map(|mut h| *h = Some(app.clone()));
  if stored.is_err() {
    return;
  }
  spawn_mouse_hook();
  thread::spawn(move || {
    let mut hover_since: Option<std::time::Instant> = None;
    let mut down_pos: Option<(f64, f64)> = None;
    // 呼出冷却：呼出后锚点 hide，is_visible 翻转存在毫秒级竞态窗口（hide 已执行
    // 但状态尚未反映），冷却期内不再呼出，防止呼出风暴反复摆布两窗
    let mut last_expand: Option<std::time::Instant> = None;
    loop {
      thread::sleep(std::time::Duration::from_millis(40));
      let Some(a) = anchor_window(&app) else { continue };
      if a.is_minimized().unwrap_or(false) || is_anchor_hidden(&a) {
        hover_since = None;
        continue;
      }
      let cursor = app.cursor_position().unwrap_or_default();
      let (ax, ay) = client_origin(&a);
      let asz = a.inner_size().unwrap_or_default();
      let inside = cursor.x >= ax as f64
        && cursor.x < (ax + asz.width as i32) as f64
        && cursor.y >= ay as f64
        && cursor.y < (ay + asz.height as i32) as f64;
      let down = anchor_key_down();
      if ANCHOR_DRAGGING.load(Ordering::SeqCst) {
        // 拖拽中：等待松开
        if !down {
          // 松开 → 落点定形态（与锚点原生拖拽同语义）
          ANCHOR_DRAGGING.store(false, Ordering::SeqCst);
          let (x0, y0) = down_pos.take().unwrap_or((cursor.x, cursor.y));
          let moved = (cursor.x - x0).abs() > 3.0 || (cursor.y - y0).abs() > 3.0;
          let _ = app.emit("isle-anchor-drag-end", serde_json::json!({ "moved": moved }));
          if !moved {
            last_expand = Some(std::time::Instant::now());
            let _ = expand_body_at(&app);
          } else if let Err(_e) = anchor_drop_settle(&app, cursor) {
            // 落点判定失败（读显示器失败等）：锚点回收纳位，绝不静默消失
            restore_anchor_show(&a);
          }
        }
        continue;
      }
      if inside && down {
        // 锚点上按下 → 进入拖拽（跟随由鼠标钩子实时执行）
        down_pos = Some((cursor.x, cursor.y));
        ANCHOR_DRAGGING.store(true, Ordering::SeqCst);
        hover_since = None;
        continue;
      }
      if inside && !down {
        // 悬停积累 280ms → 呼出（快速划过不呼出；冷却期内不重复呼出；
        // 落位抑制期内积累清零——刚收纳的锚点恰在光标下，见 EXPAND_SUPPRESS 注记）
        if expand_suppressed() {
          hover_since = None;
          continue;
        }
        let s = hover_since.get_or_insert_with(std::time::Instant::now);
        if s.elapsed() >= std::time::Duration::from_millis(280)
          && last_expand.map_or(true, |t| t.elapsed() >= std::time::Duration::from_secs(2))
        {
          hover_since = None;
          last_expand = Some(std::time::Instant::now());
          let _ = expand_body_at(&app);
        }
      } else {
        hover_since = None;
      }
    }
  });
}

/// 拖拽松手的落点定形态（锚点窗此时已被钩子移到落点）：贴边带→收纳（restyle），
/// 非贴边→自由驻留（本体落位、锚点隐藏），并广播事件供前端持久化。
fn anchor_drop_settle(app: &AppHandle, cursor: tauri::PhysicalPosition<f64>) -> Result<(), String> {
  let Some(a) = anchor_window(app) else { return Ok(()) };
  let monitor = cursor_monitor(app)?;
  let mp = monitor.position();
  let ms = monitor.size();
  let scale = a.scale_factor().unwrap_or(1.0);
  let (cx, cy) = (cursor.x, cursor.y);
  if in_snap_band(&mp, &ms, scale, cx, cy) {
    let am = decide_anchor_mode(&mp, &ms, scale, cx, cy);
    let (_aw, ah) = anchor_size_phys(am, scale);
    let (sx, sy) = anchor_station(am, &mp, &ms, scale, cy - ah / 2.0);
    let name = match am {
      AnchorMode::Top => "top",
      AnchorMode::Left => "left",
      AnchorMode::Right => "right",
    };
    restyle_anchor(&a, am, sx, sy);
    let _ = app.emit("isle-anchor-drag-end", serde_json::json!({ "mode": name, "x": sx, "y": sy, "moved": true }));
    WATCH_ENABLED.store(false, Ordering::SeqCst);
    if let Some(b) = body_window(app) {
      let _ = b.hide();
    }
    let _ = app.emit("isle-body-drag-end", serde_json::json!({ "mode": name, "x": sx, "y": sy, "moved": true }));
    // 落位收纳后锚点在光标下：限时抑制呼出，让收纳粘住落点
    suppress_expand(1200);
  } else {
    let scale_b = body_window(app)
      .and_then(|w| w.scale_factor().ok())
      .unwrap_or(1.0);
    let (cw, ch) = canvas_size_phys(scale_b);
    let (bx0, by0) = (
      cx as i32 - (EXPAND_DX.abs() * scale_b) as i32,
      cy as i32 - (EXPAND_DY.abs() * scale_b) as i32,
    );
    let (bx, by) = clamp_anchor(&mp, &ms, bx0, by0, cw as i32, ch as i32);
    if let Some(b) = body_window(app) {
      place_at(&b, bx, by);
      let _ = b.show();
    }
    let _ = a.hide();
    let _ = app.emit("isle-anchor-drag-end", serde_json::json!({ "mode": "free", "x": bx, "y": by, "moved": true }));
  }
  Ok(())
}

/// 恢复持久化状态（挂载/设置开关「开」统一入口）：
/// top/left/right=收纳态（锚点按形态落位显示，本体隐藏）；free=自由驻留
/// （本体落位显示，锚点隐藏，无监视）。x/y：free=本体 tl；left/right=纵向驻留点。
#[tauri::command]
pub fn isle_restore(app: AppHandle, mode: String, x: Option<i32>, y: Option<i32>) -> Result<(), String> {
  WATCH_ENABLED.store(false, Ordering::SeqCst);
  let Some(a) = anchor_window(&app) else { return Ok(()) };
  let Some(b) = body_window(&app) else { return Ok(()) };
  unminimize_anchor(&a);
  let monitor = cursor_monitor(&app)?;
  let mp = monitor.position();
  let ms = monitor.size();
  match mode.as_str() {
    "free" => {
      let scale = b.scale_factor().unwrap_or(1.0);
      let (cw, ch) = canvas_size_phys(scale);
      // 本体窗尺寸强制归一（视口=CSS 画布；创建时 DWM 隐形边会让客户区比画布大）。
      // set_size 与 place 都在隐藏状态下做（显示中的重排会让 WebView2 停止派发 mousedown）
      let _ = b.hide();
      let _ = b.set_size(tauri::PhysicalSize::new(cw as u32, ch as u32));
      let (cx, cy) = clamp_anchor(&mp, &ms, x.unwrap_or(0), y.unwrap_or(0), cw as i32, ch as i32);
      place_at(&b, cx, cy);
      let _ = b.show();
      let _ = a.hide();
    }
    m @ ("top" | "left" | "right") => {
      let am = match m {
        "left" => AnchorMode::Left,
        "right" => AnchorMode::Right,
        _ => AnchorMode::Top,
      };
      // left/right 持久化的是锚点 tl 纵坐标，恢复按它落位；top 纵坐标固定贴顶
      let tl_y = match am {
        AnchorMode::Top => mp.y as f64,
        _ => y.unwrap_or(mp.y + ms.height as i32 / 2 - 56) as f64,
      };
      let (sx, sy) = anchor_station(am, &mp, &ms, a.scale_factor().unwrap_or(1.0), tl_y);
      restyle_anchor(&a, am, sx, sy);
      let _ = b.hide();
    }
    _ => return Err(format!("未知的胶囊岛站位：{}", mode)),
  }
  Ok(())
}

/// 临时展开（呼出）：本体在锚点旁展开。展开偏移随锚点站位形态：
/// 顶（横排锚点）：本体 tl = 锚点 tl + (-16,-26)·缩放（胶囊落在横条左端帽内，锚点坐标不变）；
/// 左缘（竖排锚点）：横条左缘 = 锚点右缘 + 间隙，横条纵向居中对齐锚点中心；
/// 右缘：横条右缘 = 锚点左缘 - 间隙。展开后钳横条完整可见。
/// 呼出的语义=必可见（补 show）。锚点窗隐藏（区域由本体接管）。
fn expand_body_at(app: &AppHandle) -> Result<(), String> {
  let Some(a) = anchor_window(app) else { return Ok(()) };
  let Some(b) = body_window(app) else { return Ok(()) };
  unminimize_anchor(&a);
  let scale = b.scale_factor().unwrap_or(1.0);
  let (cw, _ch) = canvas_size_phys(scale);
  let monitor = cursor_monitor(app)?;
  let mp = monitor.position();
  let ms = monitor.size();
  let (apx, apy) = client_origin(&a); // 锚点客户区左上（站位语义的基准）
  let asz = a.inner_size().unwrap_or_default(); // 客户区尺寸=CSS 逻辑×缩放（非外框）
  let ah = asz.height as i32;
  let horizontal = asz.width > asz.height; // 横排锚点（顶站位 100×32）＝width>height
  let bar_top_phys = (BAR_TOP * scale) as i32;
  let bar_h_phys = (BAR_H * scale) as i32;
  // 本体窗尺寸强制归一（视口=CSS 画布；创建时 DWM 隐形边会让客户区比画布大 (16,9)，
  // 内容与窗错位、右/下露白边）
  let _ = b.set_size(tauri::PhysicalSize::new(cw as u32, (_ch) as u32));
  let (bx, by) = if horizontal {
    (
      (apx + (EXPAND_DX * scale) as i32).clamp(mp.x, mp.x + ms.width as i32 - cw as i32),
      (apy + (EXPAND_DY * scale) as i32).clamp(
        mp.y - bar_top_phys,
        mp.y + ms.height as i32 - bar_top_phys - bar_h_phys,
      ),
    )
  } else {
    // 竖排锚点：横条在屏内侧展开，纵向中心对齐锚点中心
    let gap = (EXPAND_GAP * scale) as i32;
    let aw = asz.width as i32;
    let center_y = apy + ah / 2;
    let bar_y = (center_y - bar_h_phys / 2).clamp(mp.y, mp.y + ms.height as i32 - bar_h_phys);
    let x_left = (apx + aw + gap).clamp(mp.x, mp.x + ms.width as i32 - cw as i32);
    let x_right = (apx - cw as i32 - gap).clamp(mp.x, mp.x + ms.width as i32 - cw as i32);
    let from_left = apx - mp.x < (mp.x + ms.width as i32 - apx).max(1); // 距左缘更近=左缘锚点
    let bx = if from_left { x_left } else { x_right };
    (bx, bar_y - bar_top_phys)
  };
  let _ = place_at(&b, bx, by);
  let _ = b.show();
  let _ = a.hide();
  // 光标监视（只属于临时展开）：光标在横条客户区外持续 1 秒 → 本体隐藏、锚点回归。
  // 自由驻留（拖到非贴边区松手）必须停监视——稳定驻留的横条不自动收回。
  WATCH_ENABLED.store(true, Ordering::SeqCst);
  if !WATCH_RUNNING.swap(true, Ordering::SeqCst) {
    let app2 = app.clone();
    thread::spawn(move || {
      let mut outside_since: Option<std::time::Instant> = None;
      loop {
        thread::sleep(std::time::Duration::from_millis(300));
        if !WATCH_ENABLED.load(Ordering::SeqCst) {
          break;
        }
        let Some(b) = body_window(&app2) else { break };
        let cursor = app2.cursor_position().unwrap_or_default();
        let (bpx, bpy) = client_origin(&b);
        let bsize = b.inner_size().unwrap_or_default();
        let inside = cursor.x >= bpx as f64
          && cursor.x < (bpx + bsize.width as i32) as f64
          && cursor.y >= bpy as f64
          && cursor.y < (bpy + bsize.height as i32) as f64;
        if inside {
          outside_since = None;
        } else if outside_since.is_none() {
          outside_since = Some(std::time::Instant::now());
        } else if outside_since.as_ref().unwrap().elapsed() >= std::time::Duration::from_secs(1) {
          WATCH_ENABLED.store(false, Ordering::SeqCst);
          let _ = b.hide();
          if let Some(a) = anchor_window(&app2) {
            restore_anchor_show(&a);
          }
          break;
        }
      }
      WATCH_RUNNING.store(false, Ordering::SeqCst);
    });
  }
  Ok(())
}

/// 拖拽结束等待：左键松开且窗体位置连续两拍稳定（30 秒兜底超时）。
fn wait_release_stable(app: &AppHandle) {
  let deadline = std::time::Instant::now() + std::time::Duration::from_secs(30);
  let mut last = app
    .get_webview_window("isle")
    .map(|w| client_origin(&w))
    .unwrap_or_default();
  let mut stable = 0u32;
  loop {
    if std::time::Instant::now() > deadline {
      return;
    }
    thread::sleep(std::time::Duration::from_millis(50));
    let now = app
      .get_webview_window("isle")
      .map(|w| client_origin(&w))
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

/// 拖本体横条：原生拖拽本体窗；松手落点定形态——贴边带内→收纳态（本体隐藏，
/// 锚点按带落位：顶横排居中 / 缘竖排贴缘）；非贴边区→自由驻留（本体原位驻留，
/// 屏上只有胶囊岛，无锚点）。原地松手（单击）按按下位置分派：LOGO 区=问小 P，
/// 其余部位=打开 PWORK。
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
      let monitor = cursor_monitor(&app).unwrap_or_else(|_| {
        app.primary_monitor().ok().flatten().expect("找不到可用显示器")
      });
      let mp = monitor.position();
      let ms = monitor.size();
      let cx = cursor1.x;
      let cy = cursor1.y;
      let scale_a = app
        .get_webview_window("isle-anchor")
        .and_then(|w| w.scale_factor().ok())
        .unwrap_or(1.0);
      if in_snap_band(&mp, &ms, scale_a, cx, cy) {
        // 贴边带 → 收纳态：本体隐藏，锚点按带落位（顶横排 / 缘竖排）
        let am = decide_anchor_mode(&mp, &ms, scale_a, cx, cy);
        let (_aw, ah) = anchor_size_phys(am, scale_a);
        let (sx, sy) = anchor_station(am, &mp, &ms, scale_a, cy - ah / 2.0);
        let name = match am {
          AnchorMode::Top => "top",
          AnchorMode::Left => "left",
          AnchorMode::Right => "right",
        };
        WATCH_ENABLED.store(false, Ordering::SeqCst);
        if let Some(a) = app.get_webview_window("isle-anchor") {
          restyle_anchor(&a, am, sx, sy);
        }
        let _ = app.emit("isle-body-drag-end", serde_json::json!({ "mode": name, "x": sx, "y": sy, "moved": true }));
        if let Some(b2) = body_window(&app) {
          let _ = b2.hide();
        }
        // 落位收纳后锚点在光标下：限时抑制呼出，让收纳粘住落点
        suppress_expand(1200);
      } else {
        // 非贴边区 → 自由驻留：本体原位驻留（稳定态，不隐藏、不落锚点、停监视）
        WATCH_ENABLED.store(false, Ordering::SeqCst);
        let (bpx, bpy) = app
          .get_webview_window("isle")
          .map(|w| client_origin(&w))
          .unwrap_or_default();
        let _ = app.emit("isle-body-drag-end", serde_json::json!({ "mode": "free", "x": bpx, "y": bpy, "moved": true }));
      }
    } else {
      // 原地松手（单击）→ 按按下位置分派：LOGO 区（横条左端 64px 帽）=问小 P，
      // 其余部位=打开 PWORK。scale 取本体窗的显示器缩放。
      let scale_b = b
        .scale_factor()
        .unwrap_or(1.0);
      let (cox, _coy) = client_origin(&b);
      let logo_end_x = cox as f64 + 64.0 * scale_b;
      if cursor0.x < logo_end_x {
        let _ = isle_open_palette(app);
      } else {
        let _ = isle_open_main(app);
      }
    }
  });
  Ok(())
}

/// 设置「重置到屏幕顶部居中」：收纳态归位（锚点横排贴顶居中，本体隐藏）。
#[tauri::command]
pub fn isle_anchor_snap_top(app: AppHandle) -> Result<(), String> {
  WATCH_ENABLED.store(false, Ordering::SeqCst);
  let Some(a) = anchor_window(&app) else { return Ok(()) };
  let Some(b) = body_window(&app) else { return Ok(()) };
  unminimize_anchor(&a);
  let monitor = cursor_monitor(&app)?;
  let mp = monitor.position();
  let ms = monitor.size();
  let (sx, sy) = anchor_station(AnchorMode::Top, &mp, &ms, a.scale_factor().unwrap_or(1.0), mp.y as f64);
  restyle_anchor(&a, AnchorMode::Top, sx, sy);
  let _ = b.hide();
  Ok(())
}

/// 设置开关「关」：锚点+本体全部隐藏（屏上无任何物）。
#[tauri::command]
pub fn isle_hide_all(app: AppHandle) -> Result<(), String> {
  WATCH_ENABLED.store(false, Ordering::SeqCst);
  if let Some(a) = anchor_window(&app) {
    let _ = a.hide();
  }
  if let Some(b) = body_window(&app) {
    let _ = b.hide();
  }
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
