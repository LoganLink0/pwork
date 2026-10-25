mod gateway;

use tauri::{Emitter, Manager};
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};

/// 工具轮盘的全局呼出键（应用外任何地方可呼出）。键位自定义规划在下个版本统一做
const WHEEL_KEY: Code = Code::KeyQ;
const WHEEL_LABEL: &str = "Ctrl+Alt+Q";

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_fs::init())
    .plugin(
      tauri_plugin_global_shortcut::Builder::new()
        .with_handler(|app, _shortcut, event| {
          if event.state != ShortcutState::Pressed {
            return;
          }
          // 明确语义：最小化时第一次按 = 只唤起窗口（WebView 刚恢复，事件可能丢，不指望弹轮盘）；
          // 窗口已可见（含失焦）= 唤起焦点并切换轮盘。用户体感：最小化按一次唤起、再按弹轮盘
          if let Some(w) = app.get_webview_window("main") {
            let minimized = w.is_minimized().unwrap_or(false);
            let _ = w.show();
            let _ = w.unminimize();
            let _ = w.set_focus();
            if minimized {
              return;
            }
          }
          let _ = app.emit("wheel-toggle", ());
        })
        .build(),
    )
    .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
      // 已在运行时聚焦主窗口，而不是再开一个实例（两个实例写同一个库有竞态）
      if let Some(w) = app.get_webview_window("main") {
        let _ = w.set_focus();
        let _ = w.unminimize();
      }
    }))
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      // 内嵌网关：AI Key 的安全存放点（127.0.0.1，随应用启停）
      let data_dir = app.path().app_data_dir()?;
      let _ = std::fs::create_dir_all(&data_dir);
      gateway::start(data_dir);

      // 工具轮盘：全局快捷键呼出（桌面版专属，网页版走 Ctrl+K 面板）
      let mods = Modifiers::CONTROL | Modifiers::ALT;
      app.global_shortcut().register(Shortcut::new(Some(mods), WHEEL_KEY))?;
      log::info!("工具轮盘全局快捷键已注册：{}", WHEEL_LABEL);
      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while building tauri application");
}
