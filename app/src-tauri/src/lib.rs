mod db;
mod gateway;
mod mirror;

use std::thread;
use tauri::{Emitter, Manager};
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};

/// 工具轮盘的全局呼出键（应用外任何地方可呼出）。默认 Windows Ctrl+Alt+Q / macOS ⌘+Option+Q；
/// 键位自定义（0.4-3）由前端存配置、经 register_wheel_shortcut 在启动时/改动时重注册
#[cfg(target_os = "macos")]
const WHEEL_LABEL: &str = "⌘+Option+Q";
#[cfg(not(target_os = "macos"))]
const WHEEL_LABEL: &str = "Ctrl+Alt+Q";
const WHEEL_KEY: Code = Code::KeyQ;

/// 解析归一化键位串（如 "ctrl+alt+q"）为修饰键 + 主键码。主键限字母/数字/F 键
/// （与前端 wheelComboAllowed 同一口径）；解析失败返回人话错误
fn parse_wheel_combo(combo: &str) -> Result<(Modifiers, Code), String> {
  let mut mods = Modifiers::empty();
  let mut main: Option<Code> = None;
  for part in combo.split('+').filter(|s| !s.is_empty()) {
    match part {
      "ctrl" => mods |= Modifiers::CONTROL,
      "shift" => mods |= Modifiers::SHIFT,
      "alt" => mods |= Modifiers::ALT,
      // macOS ⌘（与前端 keybinds 的 meta 段一致）
      "meta" | "cmd" => mods |= Modifiers::META,
      _ => {
        if main.is_some() {
          return Err(format!("键位串有多个主键：{}", combo));
        }
        main = Some(parse_main_key(part)?);
      }
    }
  }
  let code = main.ok_or_else(|| format!("键位串缺少主键：{}", combo))?;
  if mods.is_empty() {
    return Err("全局键必须带 Ctrl/Alt/Shift 修饰键（单键会劫持正常输入）".to_string());
  }
  Ok((mods, code))
}

/// 主键码：字母 / 数字 / F1–F12
fn parse_main_key(part: &str) -> Result<Code, String> {
  let code = match part {
    "a" => Code::KeyA, "b" => Code::KeyB, "c" => Code::KeyC, "d" => Code::KeyD,
    "e" => Code::KeyE, "f" => Code::KeyF, "g" => Code::KeyG, "h" => Code::KeyH,
    "i" => Code::KeyI, "j" => Code::KeyJ, "k" => Code::KeyK, "l" => Code::KeyL,
    "m" => Code::KeyM, "n" => Code::KeyN, "o" => Code::KeyO, "p" => Code::KeyP,
    "q" => Code::KeyQ, "r" => Code::KeyR, "s" => Code::KeyS, "t" => Code::KeyT,
    "u" => Code::KeyU, "v" => Code::KeyV, "w" => Code::KeyW, "x" => Code::KeyX,
    "y" => Code::KeyY, "z" => Code::KeyZ,
    "0" => Code::Digit0, "1" => Code::Digit1, "2" => Code::Digit2, "3" => Code::Digit3,
    "4" => Code::Digit4, "5" => Code::Digit5, "6" => Code::Digit6, "7" => Code::Digit7,
    "8" => Code::Digit8, "9" => Code::Digit9,
    "f1" => Code::F1, "f2" => Code::F2, "f3" => Code::F3, "f4" => Code::F4,
    "f5" => Code::F5, "f6" => Code::F6, "f7" => Code::F7, "f8" => Code::F8,
    "f9" => Code::F9, "f10" => Code::F10, "f11" => Code::F11, "f12" => Code::F12,
    _ => return Err(format!("全局键主键只支持字母/数字/F1–F12：{}", part)),
  };
  Ok(code)
}

/// 键位自定义（0.4-3）：前端在启动/改键时调用——注销旧的全局键，注册新的。
/// 与 setup 里的默认注册共用同一套全局快捷键通道，重复启动调用幂等（先注销再注册）
#[tauri::command]
fn register_wheel_shortcut(app: tauri::AppHandle, combo: String) -> Result<String, String> {
  let (mods, code) = parse_wheel_combo(&combo)?;
  let shortcuts = app.global_shortcut();
  shortcuts.unregister_all().map_err(|e| format!("注销旧键位失败：{}", e))?;
  shortcuts
    .register(Shortcut::new(Some(mods), code))
    .map_err(|e| format!("注册键位失败（可能被其他应用占用）：{}", e))?;
  Ok(display_combo(&combo))
}

/// 前端展示用：归一化串转显示格式（与 engine/keybinds displayCombo 一致）
fn display_combo(combo: &str) -> String {
  combo
    .split('+')
    .map(|p| {
      let mut c = p.chars();
      match c.next() {
        Some(f) => f.to_uppercase().collect::<String>() + c.as_str(),
        None => String::new(),
      }
    })
    .collect::<Vec<_>>()
    .join("+")
}

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
    // Windows 走 cmd 包装（部署向导.cmd）；macOS 走 Terminal 打开等价 shell 脚本
    #[cfg(windows)]
    let wizard_entry = "部署向导.cmd";
    #[cfg(not(windows))]
    let wizard_entry = "部署向导.sh";
    if !worker_dir.join(wizard_entry).is_file() {
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
    #[cfg(target_os = "macos")]
    {
        // Terminal.app 打开 shell 向导（窗口保留，脚本结束不关）
        std::process::Command::new("open")
            .args(["-a", "Terminal", wizard_entry])
            .current_dir(&worker_dir)
            .spawn()
            .map_err(|e| format!("部署窗口启动失败：{e}"))?;
        Ok(())
    }
    #[cfg(not(any(windows, target_os = "macos")))]
    {
        let _ = worker_dir;
        Err("仅支持 Windows 与 macOS".into())
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
    #[cfg(target_os = "macos")]
    {
        // macOS 系统标准：open 命令交给默认浏览器
        std::process::Command::new("open")
            .arg(url)
            .spawn()
            .map_err(|e| format!("打开浏览器失败：{e}"))?;
        Ok(())
    }
    #[cfg(target_os = "linux")]
    {
        std::process::Command::new("xdg-open")
            .arg(url)
            .spawn()
            .map_err(|e| format!("打开浏览器失败：{e}"))?;
        Ok(())
    }
    #[cfg(not(any(windows, target_os = "macos", target_os = "linux")))]
    {
        Err("仅支持 Windows 与 macOS".into())
    }
}

/// 应用内一键部署（2026-10-27 用户拍板）：不再弹终端窗口——后台跑部署向导的全自动模式，
/// 逐行输出推给前端（deploy-log），@@step/@@done/@@fail 标记解析成结构化事件；
/// 偏好参数由前端带入（本地采集配置），部署即同步口味到云端。
#[tauri::command]
fn deploy_cloud(
    app: tauri::AppHandle,
    interests: String,
    dislikes: String,
    context: String,
) -> Result<(), String> {
    let worker_dir = app
        .path()
        .resource_dir()
        .map_err(|e| format!("定位安装目录失败：{e}"))?
        .join("worker");
    if !worker_dir.join("scripts").join("deploy-wizard.mjs").is_file() {
        return Err("安装目录里没找到部署源码——请重新安装应用（安装包损坏或被安全软件删改）".into());
    }
    // 平台差异只在"是否隐藏窗口"一处：macOS 上 spawn 图形会话进程默认无终端窗口
    use std::io::BufRead;
    let mut cmd = std::process::Command::new("node");
    cmd.arg("scripts/deploy-wizard.mjs")
        .arg("--auto")
        .arg("--interests").arg(&interests)
        .arg("--dislikes").arg(&dislikes)
        .arg("--context").arg(&context)
        .current_dir(&worker_dir);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x0800_0000); // CREATE_NO_WINDOW：应用内部署，不出终端
    }
    let mut child = cmd
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::null())
        .spawn()
        .map_err(|e| format!("部署进程启动失败：{e}（确认电脑装了 Node.js ≥ 20）"))?;
    let stdout = child.stdout.take().ok_or("无法读取部署输出")?;
    std::thread::spawn(move || {
        for line in std::io::BufReader::new(stdout).lines().map_while(Result::ok) {
            let _ = app.emit("deploy-log", &line);
            if let Some(rest) = line.strip_prefix("@@step ") {
                let _ = app.emit("deploy-step", rest);
            } else if let Some(rest) = line.strip_prefix("@@fail ") {
                let _ = app.emit("deploy-fail", rest);
            } else if let Some(rest) = line.strip_prefix("@@done ") {
                let mut fields = std::collections::HashMap::new();
                for part in rest.split_whitespace() {
                    if let Some((k, v)) = part.split_once('=') {
                        fields.insert(k.to_string(), v.to_string());
                    }
                }
                let _ = app.emit("deploy-done", serde_json::json!({
                    "endpoint": fields.get("endpoint").cloned().unwrap_or_default(),
                    "token": fields.get("token").cloned().unwrap_or_default(),
                    "account": fields.get("account").cloned().unwrap_or_default(),
                    "db": fields.get("db").cloned().unwrap_or_default(),
                }));
            }
        }
        let _ = child.wait();
    });
    Ok(())
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
      // 应用内更新（0.2）：更新包与签名清单挂 GitHub Releases，插件在设置页触发检查/下载/重启
      app.handle().plugin(tauri_plugin_updater::Builder::new().build())?;
      app.handle().plugin(tauri_plugin_process::init())?;
      // 系统通知（0.4）：待办到期/复盘节奏/日报就绪三类提醒（设置页可关）
      app.handle().plugin(tauri_plugin_notification::init())?;
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

      // 工具轮盘：全局快捷键呼出（桌面版专属，网页版走命令面板）；macOS 默认 ⌘+Option，其余 Ctrl+Alt
      #[cfg(target_os = "macos")]
      let mods = Modifiers::META | Modifiers::ALT;
      #[cfg(not(target_os = "macos"))]
      let mods = Modifiers::CONTROL | Modifiers::ALT;
      app.global_shortcut().register(Shortcut::new(Some(mods), WHEEL_KEY))?;
      log::info!("工具轮盘全局快捷键已注册：{}", WHEEL_LABEL);
      Ok(())
    })
    .manage(db::DbState(std::sync::Mutex::new(None)))
    .invoke_handler(tauri::generate_handler![
      save_gateway_key,
      open_deploy_wizard,
      open_external_url,
      deploy_cloud,
      register_wheel_shortcut,
      db::db_probe,
      db::db_open,
      db::db_select,
      db::db_write,
      db::db_exec,
      db::db_begin,
      db::db_commit,
      db::db_rollback,
      db::db_destroy,
      db::db_migrate_batch,
      db::db_migrate_finish,
      db::db_vacuum_into,
      db::db_columns,
      mirror::mirror_write_file,
      mirror::mirror_remove_file,
      mirror::mirror_list_dir,
      mirror::mirror_remove_dir,
    ])
    .run(tauri::generate_context!())
    .expect("error while building tauri application");
}
