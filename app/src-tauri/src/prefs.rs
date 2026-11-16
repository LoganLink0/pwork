//! 用户配置文件（prefs.json，2026-11-16 配置文件化立项）：
//! 主题/AI 接入/键位/自动备份偏好/胶囊岛位置等用户设置从 origin 隔离的 localStorage
//! 迁到数据目录文件——治 dev 壳与桌面版 origin 不同配置互不可见、leveldb 强杀丢写
//! 两个已发生痛点。原子写（tmp+rename，同 backup_file_io 纪律）；PWORK_DATA_DIR 生效。

use std::path::PathBuf;
use tauri::AppHandle;
use tauri::Manager;

fn prefs_path(app: &AppHandle) -> Result<PathBuf, String> {
    crate::db::app_data_dir(app).map(|d| d.join("prefs.json"))
}

#[tauri::command]
pub fn prefs_read(app: AppHandle) -> Result<Option<String>, String> {
    let path = prefs_path(&app)?;
    match std::fs::read_to_string(&path) {
        Ok(text) => Ok(Some(text)),
        // 不存在按 null（调用方按空配置跑，与 backup_file_io 读语义一致）
        Err(_) => Ok(None),
    }
}

#[tauri::command]
pub fn prefs_write(app: AppHandle, content: String) -> Result<(), String> {
    let path = prefs_path(&app)?;
    let dir = path
        .parent()
        .ok_or_else(|| "定位配置目录失败".to_string())?
        .to_path_buf();
    std::fs::create_dir_all(&dir).map_err(|e| format!("创建配置目录失败：{e}"))?;
    let tmp = path.with_extension("tmp");
    std::fs::write(&tmp, &content).map_err(|e| format!("写入配置失败：{e}"))?;
    std::fs::rename(&tmp, &path).map_err(|e| format!("落盘配置失败：{e}"))?;
    Ok(())
}
