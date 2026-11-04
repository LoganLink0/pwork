//! 速记附件的文件命令层（R2 批，桌面先行）：
//! 附件字节存 AppData/attachments/，数据库与 JSON 备份只存元数据（体积预算：字节不进库）。
//! 文件名由前端生成（att_ 前缀 + 时间戳随机段），Rust 侧白名单校验：受支持的图片扩展名，
//! 拒绝路径分隔符与 ..（防目录穿越）；写入原子（临时文件 + 重命名）；单文件 20MB 上限。

use base64::Engine as _;
use std::path::PathBuf;
use tauri::AppHandle;
use tauri::Manager;

const MAX_ATTACHMENT_BYTES: usize = 20 * 1024 * 1024;

/// 附件根目录（AppData/attachments），与 pwork.db、vault、backups 同级
fn attachments_root(app: &AppHandle) -> Result<PathBuf, String> {
  app
    .path()
    .app_data_dir()
    .map(|d| d.join("attachments"))
    .map_err(|e| format!("定位应用数据目录失败：{}", e))
}

/// 文件名白名单：att_ 开头，主干仅字母数字下划线连字符，扩展名限受支持的图片格式；
/// 拒绝空名、路径分隔符与 ..（防目录穿越）
fn safe_attachment_name(name: &str) -> Result<String, String> {
  let rejected = || format!("非法的附件文件名：{}", name);
  if name.len() > 64 || name.contains("..") || name.contains('/') || name.contains('\\') {
    return Err(rejected());
  }
  let (stem, ext) = name
    .rsplit_once('.')
    .ok_or_else(rejected)?;
  if !stem.starts_with("att_") || stem.len() < 8 {
    return Err(rejected());
  }
  if !stem.chars().all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-') {
    return Err(rejected());
  }
  match ext {
    "png" | "jpg" | "jpeg" | "webp" | "gif" => Ok(name.to_string()),
    _ => Err(rejected()),
  }
}

#[tauri::command]
pub fn attachment_write(app: AppHandle, name: String, bytes: Vec<u8>) -> Result<(), String> {
  let file_name = safe_attachment_name(&name)?;
  if bytes.is_empty() {
    return Err("附件内容为空".to_string());
  }
  if bytes.len() > MAX_ATTACHMENT_BYTES {
    return Err(format!("附件超过 20MB 上限（{} 字节）", bytes.len()));
  }
  let dir = attachments_root(&app)?;
  std::fs::create_dir_all(&dir).map_err(|e| format!("创建附件目录失败：{}", e))?;
  let target = dir.join(&file_name);
  let tmp = target.with_extension("tmp");
  std::fs::write(&tmp, &bytes).map_err(|e| format!("写入附件失败：{}", e))?;
  std::fs::rename(&tmp, &target).map_err(|e| format!("落盘附件失败：{}", e))?;
  Ok(())
}

/// 读取附件字节，base64 编码返回（前端拼 data: URL 用于预览）
#[tauri::command]
pub fn attachment_read(app: AppHandle, name: String) -> Result<String, String> {
  let file_name = safe_attachment_name(&name)?;
  let path = attachments_root(&app)?.join(&file_name);
  let bytes = std::fs::read(&path).map_err(|e| format!("读取附件失败：{}", e))?;
  Ok(base64::engine::general_purpose::STANDARD.encode(bytes))
}

/// 删除附件文件（文件不存在时静默成功——元数据已删的孤儿清理可重复调用）
#[tauri::command]
pub fn attachment_delete(app: AppHandle, name: String) -> Result<(), String> {
  let file_name = safe_attachment_name(&name)?;
  let path = attachments_root(&app)?.join(&file_name);
  match std::fs::remove_file(&path) {
    Ok(()) => Ok(()),
    Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
    Err(e) => Err(format!("删除附件失败：{}", e)),
  }
}

#[cfg(test)]
mod tests {
  use super::safe_attachment_name;

  #[test]
  fn 合法名通过() {
    assert!(safe_attachment_name("att_lx2c09_k1.png").is_ok());
    assert!(safe_attachment_name("att_ABC-123.webp").is_ok());
    assert!(safe_attachment_name("att_a1b2c3d4e5.jpg").is_ok());
  }

  #[test]
  fn 穿越与前缀不符拒绝() {
    assert!(safe_attachment_name("../evil.png").is_err());
    assert!(safe_attachment_name("att_..\\..\\x.png").is_err());
    assert!(safe_attachment_name("note_x.png").is_err());
    assert!(safe_attachment_name("att_.png").is_err()); // 主干过短
    assert!(safe_attachment_name("att_x.sh").is_err()); // 扩展名不在白名单
    assert!(safe_attachment_name("").is_err());
    assert!(safe_attachment_name("att_无中文.png").is_err());
  }
}
