//! vault 镜像的 Rust 命令层（08 设计 S3）：
//! 文件写入路径 = vault 根目录 + 白名单目录名（Rust 侧校验）+ 文件名（拒绝路径分隔符与 ..，防目录穿越）。
//! 写入一律原子（临时文件 + 重命名），失败就地报错（R8：调用方自行降级，不阻塞主库）。
//! 只操作文件系统，不触碰数据库连接。

use serde_json::{json, Value as Json};
use std::path::PathBuf;
use tauri::AppHandle;
use tauri::Manager;

/// vault 根目录（AppData/vault），与 pwork.db、backups 同级
fn vault_root(app: &AppHandle) -> Result<PathBuf, String> {
  app
    .path()
    .app_data_dir()
    .map(|d| d.join("vault"))
    .map_err(|e| format!("定位应用数据目录失败：{}", e))
}

/// 白名单目录名（与 mirror.ts 的 DIRS 同源）；"根目录" 表示 vault 根本身
fn resolve_dir(app: &AppHandle, dir: &str) -> Result<PathBuf, String> {
  const ALLOWED: &[&str] = &[
    "根目录", "速记", "任务", "目标", "条目", "洞察", "复盘", "行动项", "信源",
  ];
  if !ALLOWED.contains(&dir) {
    return Err(format!("未知的镜像目录：{}", dir));
  }
  let root = vault_root(app)?;
  Ok(if dir == "根目录" { root } else { root.join(dir) })
}

/// 文件名安全化：拒绝空名、路径分隔符与点开头（防目录穿越）。
/// 注意 `..` 只在作为独立路径段时才有穿越意义——分隔符已单独拒绝，文件名内部的
/// 省略号（如标题截断产生的「主权...」）是合法内容，不能一刀切（2026-11-04 真实条目
/// 镜像投影连败 4 次的根因）。
fn safe_file_name(name: &str) -> Result<String, String> {
  if name.is_empty()
    || name.contains('/')
    || name.contains('\\')
    || name.starts_with('.')
  {
    return Err(format!("非法的镜像文件名：{}", name));
  }
  Ok(name.to_string())
}

/// 写单个文件（原子：临时文件 + 重命名）
fn write_file_atomic(target: &PathBuf, content: &str) -> Result<(), String> {
  use std::io::Write;
  let tmp = target.with_extension("tmp");
  let mut f = std::fs::File::create(&tmp).map_err(|e| format!("创建临时文件失败：{}", e))?;
  f.write_all(content.as_bytes()).map_err(|e| format!("写入失败：{}", e))?;
  drop(f);
  std::fs::rename(&tmp, target).map_err(|e| format!("重命名失败：{}", e))?;
  Ok(())
}

#[tauri::command]
pub fn mirror_write_file(app: AppHandle, dir: String, name: String, content: String) -> Result<(), String> {
  let dir_path = resolve_dir(&app, &dir)?;
  let file_name = safe_file_name(&name)?;
  std::fs::create_dir_all(&dir_path).map_err(|e| format!("创建镜像目录失败：{}", e))?;
  write_file_atomic(&dir_path.join(file_name), &content)
}

#[tauri::command]
pub fn mirror_remove_file(app: AppHandle, dir: String, name: String) -> Result<(), String> {
  let dir_path = resolve_dir(&app, &dir)?;
  let file_name = safe_file_name(&name)?;
  let target = dir_path.join(file_name);
  if target.exists() {
    std::fs::remove_file(&target).map_err(|e| format!("删除镜像文件失败：{}", e))?;
  }
  Ok(())
}

#[tauri::command]
pub fn mirror_list_dir(app: AppHandle, dir: String) -> Result<Json, String> {
  let dir_path = resolve_dir(&app, &dir)?;
  let mut names: Vec<Json> = Vec::new();
  if dir_path.exists() {
    for entry in std::fs::read_dir(&dir_path).map_err(|e| format!("读取镜像目录失败：{}", e))? {
      let entry = entry.map_err(|e| e.to_string())?;
      let name = entry.file_name().to_string_lossy().to_string();
      if name.ends_with(".md") && !name.ends_with(".tmp") {
        names.push(json!({ "name": name }));
      }
    }
  }
  Ok(json!(names))
}

#[tauri::command]
pub fn mirror_remove_dir(app: AppHandle, dir: String) -> Result<(), String> {
  let dir_path = resolve_dir(&app, &dir)?;
  if dir_path.exists() {
    std::fs::remove_dir_all(&dir_path).map_err(|e| format!("清空镜像目录失败：{}", e))?;
  }
  Ok(())
}

#[cfg(test)]
mod tests {
  use super::safe_file_name;

  #[test]
  fn 合法名通过含省略号() {
    // 真实条目标题截断产生的省略号是合法内容（2026-11-04 真实镜像投影连败的回归锁）
    assert!(safe_file_name("2026-11-04-伊朗军方提出五项和平原则：主权...-l_jzfvr0.md").is_ok());
    assert!(safe_file_name("速记-标题.md").is_ok());
  }

  #[test]
  fn 穿越与点开头拒绝() {
    assert!(safe_file_name("").is_err());
    assert!(safe_file_name("../evil.md").is_err());
    assert!(safe_file_name("a/b.md").is_err());
    assert!(safe_file_name("a\\b.md").is_err());
    assert!(safe_file_name(".hidden.md").is_err());
    assert!(safe_file_name("..md").is_err());
  }
}
