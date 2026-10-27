mod gateway;

use std::thread;
use tauri::{Emitter, Manager};
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};

/// 工具轮盘的全局呼出键（应用外任何地方可呼出）。键位自定义规划在下个版本统一做
const WHEEL_KEY: Code = Code::KeyQ;
const WHEEL_LABEL: &str = "Ctrl+Alt+Q";

/// 引导页/设置页写入网关 Key：合并进 gateway.env（保留用户手写的其它行），并热更新运行中的网关——
/// 无需重启应用，写完即可发起连接测试
#[tauri::command]
fn save_gateway_key(
    state: tauri::State<gateway::SharedConfig>,
    app: tauri::AppHandle,
    key: String,
    base_url: String,
    model: String,
) -> Result<(), String> {
    let key = key.trim().to_string();
    let base_url = base_url.trim().to_string();
    let model = model.trim().to_string();
    if key.is_empty() {
        return Err("Key 不能为空".into());
    }
    // env 文件一行一个值：换行可注入额外的键值行，必须拒绝（Key 本体常见 base64/连字符，等号合法）
    if key.contains(['\n', '\r', '\0']) || key.starts_with('#') {
        return Err("Key 含换行或注释符，不是合法的值".into());
    }
    for v in [&base_url, &model] {
        if v.contains(['\n', '\r', '\0', '"']) {
            return Err("上游地址/模型名含非法字符".into());
        }
    }
    let data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let _ = std::fs::create_dir_all(&data_dir);
    let file = data_dir.join("gateway.env");
    let mut lines: Vec<String> = std::fs::read_to_string(&file)
        .unwrap_or_default()
        .lines()
        .map(|l| l.trim_end().to_string())
        .collect();
    // 三个键整组重写：先删同名的旧行（含用户手写的重复行），值非空再追加；注释行不含「键=」形态不受影响
    for (name, val) in [
        ("PWORK_LLM_API_KEY", key),
        ("PWORK_LLM_BASE_URL", base_url),
        ("PWORK_LLM_MODEL", model),
    ] {
        lines.retain(|l| l.split('=').next().map(|k| k.trim() != name).unwrap_or(true));
        if !val.is_empty() {
            lines.push(format!("{name}={val}"));
        }
    }
    std::fs::write(&file, format!("{}\n", lines.join("\n"))).map_err(|e| e.to_string())?;
    // 热更新：重新从盘上加载（与启动时同一路径），后续请求立即用新 Key
    *state.lock().unwrap() = gateway::GatewayConfig::load(&data_dir);
    Ok(())
}

/// 引导页「一键部署」（桌面版）：在安装目录自带的 worker 资源里新开控制台窗口运行部署向导——
/// 部署源码随应用打包（bundle.resources），用户无需选择任何位置。
#[tauri::command]
fn open_deploy_wizard(app: tauri::AppHandle) -> Result<(), String> {
    let worker_dir = app
        .path()
        .resource_dir()
        .map_err(|e| format!("定位安装目录失败：{e}"))?
        .join("worker");
    if !worker_dir.join("部署向导.cmd").is_file() {
        return Err("安装目录里没找到部署向导——请重新安装应用（安装包损坏或被安全软件删改）".into());
    }
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        // CREATE_NEW_CONSOLE 开独立窗口跑向导；/k 让窗口在脚本结束后保留（向导输出的端点/Token 要抄）
        std::process::Command::new("cmd")
            .args(["/k", "call 部署向导.cmd"])
            .current_dir(&worker_dir)
            .creation_flags(0x0010_0000)
            .spawn()
            .map_err(|e| format!("部署窗口启动失败：{e}"))?;
        Ok(())
    }
    #[cfg(not(windows))]
    {
        let _ = worker_dir;
        Err("仅支持 Windows".into())
    }
}

/// 打开外部网页（桌面版）：WebView 不处理 target=_blank 的外链，
/// 统一由这里交给系统默认浏览器。只放行 http/https，其余一律拒绝。
#[tauri::command]
fn open_external_url(url: String) -> Result<(), String> {
    let parsed = url::Url::parse(&url).map_err(|_| "链接格式无效".to_string())?;
    if parsed.scheme() != "http" && parsed.scheme() != "https" {
        return Err("只支持打开网页链接（http/https）".into());
    }
    #[cfg(windows)]
    {
        // explorer 用系统默认浏览器打开 URL；URL 作为单个参数传递，不经 shell 解析
        std::process::Command::new("explorer")
            .arg(url)
            .spawn()
            .map_err(|e| format!("打开浏览器失败：{e}"))?;
        Ok(())
    }
    #[cfg(not(windows))]
    {
        Err("仅支持 Windows".into())
    }
}

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
          // 单键直达：最小化时先唤起窗口，等 WebView 真正恢复后再发轮盘事件
          //（恢复间隙内立即发的事件会丢）；窗口已可见则立即发
          if let Some(w) = app.get_webview_window("main") {
            let minimized = w.is_minimized().unwrap_or(false);
            let _ = w.show();
            let _ = w.unminimize();
            let _ = w.set_focus();
            if minimized {
              let app = app.clone();
              thread::spawn(move || {
                for _ in 0..20 {
                  thread::sleep(std::time::Duration::from_millis(100));
                  let restored = app
                    .get_webview_window("main")
                    .map(|w| !w.is_minimized().unwrap_or(true))
                    .unwrap_or(true);
                  if restored {
                    break;
                  }
                }
                let _ = app.emit("wheel-toggle", ());
              });
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
      // 内嵌网关：AI Key 的安全存放点（127.0.0.1，随应用启停）。
      // 端口被占（如开发版 Node 网关在跑）时让位，但发事件告知前端——
      // 8788 也可能是恶意进程冒名占位，用户应能察觉（安全审计 F12）
      let data_dir = app.path().app_data_dir()?;
      let _ = std::fs::create_dir_all(&data_dir);
      let shared_gw = gateway::start(data_dir, app.handle().clone());
      app.manage(shared_gw);

      // 工具轮盘：全局快捷键呼出（桌面版专属，网页版走 Ctrl+K 面板）
      let mods = Modifiers::CONTROL | Modifiers::ALT;
      app.global_shortcut().register(Shortcut::new(Some(mods), WHEEL_KEY))?;
      log::info!("工具轮盘全局快捷键已注册：{}", WHEEL_LABEL);
      Ok(())
    })
    .invoke_handler(tauri::generate_handler![save_gateway_key, open_deploy_wizard, open_external_url])
    .run(tauri::generate_context!())
    .expect("error while building tauri application");
}
