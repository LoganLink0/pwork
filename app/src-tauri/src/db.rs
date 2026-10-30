//! 本地主库（08 设计 S2）：桌面版 SQLite 存储后端。
//! 单文件 pwork.db 落应用数据目录（与 backups 同级）；SQL 全部由 JS 侧适配器生成
//! （表/字段名来自固定清单并在此校验，值一律绑定参数），Rust 提供通用执行器 +
//! 事务 + 迁移分批写入 + 快照。时间戳一律按 TEXT 原样存取（R6：禁止 datetime 函数加工）。

use rusqlite::types::Value as SqlValue;
use rusqlite::Connection;
use serde_json::{json, Map, Value as Json};
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::{AppHandle, Manager, State};

pub struct DbState(pub Mutex<Option<Connection>>);

const DDL: &str = r#"
CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS notes (id TEXT PRIMARY KEY, "source" TEXT, "deletedAt" TEXT, "updatedAt" TEXT, payload TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS idx_notes_source ON notes("source");
CREATE INDEX IF NOT EXISTS idx_notes_deletedAt ON notes("deletedAt");
CREATE INDEX IF NOT EXISTS idx_notes_updatedAt ON notes("updatedAt");
CREATE TABLE IF NOT EXISTS sources (id TEXT PRIMARY KEY, "url" TEXT, "active" INTEGER, "updatedAt" TEXT, payload TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS idx_sources_url ON sources("url");
CREATE INDEX IF NOT EXISTS idx_sources_updatedAt ON sources("updatedAt");
CREATE TABLE IF NOT EXISTS items (id TEXT PRIMARY KEY, "sourceId" TEXT, "stage" TEXT, "fingerprint" TEXT, "fetchedAt" TEXT, "otFlag" TEXT, payload TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS idx_items_sourceId ON items("sourceId");
CREATE INDEX IF NOT EXISTS idx_items_stage ON items("stage");
CREATE INDEX IF NOT EXISTS idx_items_fingerprint ON items("fingerprint");
CREATE INDEX IF NOT EXISTS idx_items_fetchedAt ON items("fetchedAt");
CREATE INDEX IF NOT EXISTS idx_items_otFlag ON items("otFlag");
CREATE TABLE IF NOT EXISTS reviews (id TEXT PRIMARY KEY, "scenario" TEXT, "type" TEXT, "status" TEXT, "updatedAt" TEXT, "createdAt" TEXT, payload TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS idx_reviews_scenario ON reviews("scenario");
CREATE INDEX IF NOT EXISTS idx_reviews_type ON reviews("type");
CREATE INDEX IF NOT EXISTS idx_reviews_status ON reviews("status");
CREATE INDEX IF NOT EXISTS idx_reviews_updatedAt ON reviews("updatedAt");
CREATE INDEX IF NOT EXISTS idx_reviews_createdAt ON reviews("createdAt");
CREATE TABLE IF NOT EXISTS actions (id TEXT PRIMARY KEY, "reviewId" TEXT, "status" TEXT, "due" TEXT, payload TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS idx_actions_reviewId ON actions("reviewId");
CREATE INDEX IF NOT EXISTS idx_actions_status ON actions("status");
CREATE INDEX IF NOT EXISTS idx_actions_due ON actions("due");
CREATE TABLE IF NOT EXISTS insights (id TEXT PRIMARY KEY, "reviewId" TEXT, "verified" INTEGER, "patternGroup" TEXT, payload TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS idx_insights_reviewId ON insights("reviewId");
CREATE INDEX IF NOT EXISTS idx_insights_verified ON insights("verified");
CREATE INDEX IF NOT EXISTS idx_insights_patternGroup ON insights("patternGroup");
CREATE TABLE IF NOT EXISTS tasks (id TEXT PRIMARY KEY, "status" TEXT, "due" TEXT, payload TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks("status");
CREATE INDEX IF NOT EXISTS idx_tasks_due ON tasks("due");
CREATE TABLE IF NOT EXISTS goals (id TEXT PRIMARY KEY, "status" TEXT, "due" TEXT, payload TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS idx_goals_status ON goals("status");
CREATE INDEX IF NOT EXISTS idx_goals_due ON goals("due");
CREATE TABLE IF NOT EXISTS snapshots (id TEXT PRIMARY KEY, "day" TEXT, "createdAt" TEXT, payload TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS idx_snapshots_day ON snapshots("day");
CREATE INDEX IF NOT EXISTS idx_snapshots_createdAt ON snapshots("createdAt");
CREATE TABLE IF NOT EXISTS blocks (id TEXT PRIMARY KEY, "updatedAt" TEXT, "extId" TEXT, "profileId" TEXT, payload TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS idx_blocks_updatedAt ON blocks("updatedAt");
CREATE INDEX IF NOT EXISTS idx_blocks_extId ON blocks("extId");
CREATE INDEX IF NOT EXISTS idx_blocks_profileId ON blocks("profileId");
CREATE TABLE IF NOT EXISTS profiles (id TEXT PRIMARY KEY, "updatedAt" TEXT, payload TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS idx_profiles_updatedAt ON profiles("updatedAt");
CREATE TABLE IF NOT EXISTS caseFiles (id TEXT PRIMARY KEY, "caseId" TEXT, "kind" TEXT, "createdAt" TEXT, payload TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS idx_caseFiles_caseId ON caseFiles("caseId");
CREATE INDEX IF NOT EXISTS idx_caseFiles_kind ON caseFiles("kind");
CREATE INDEX IF NOT EXISTS idx_caseFiles_createdAt ON caseFiles("createdAt");
CREATE TABLE IF NOT EXISTS aiCache (id TEXT PRIMARY KEY, "createdAt" TEXT, payload TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS idx_aiCache_createdAt ON aiCache("createdAt");
CREATE TABLE IF NOT EXISTS errorLog (id TEXT PRIMARY KEY, "at" TEXT, payload TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS idx_errorLog_at ON errorLog("at");
CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, payload TEXT NOT NULL);
INSERT OR IGNORE INTO meta (key, value) VALUES ('schema_version', '1');
"#;

/// 每表除主键外的索引列（写入时从记录提取这些列；与 DDL 一一对应）。
/// meta/kv 无附加列；主键字段名由 key_field 决定（kv/meta 为 key，其余为 id）。
fn columns(table: &str) -> Option<&'static [&'static str]> {
  match table {
    "notes" => Some(&["source", "deletedAt", "updatedAt"]),
    "sources" => Some(&["url", "active", "updatedAt"]),
    "items" => Some(&["sourceId", "stage", "fingerprint", "fetchedAt", "otFlag"]),
    "reviews" => Some(&["scenario", "type", "status", "updatedAt", "createdAt"]),
    "actions" => Some(&["reviewId", "status", "due"]),
    "insights" => Some(&["reviewId", "verified", "patternGroup"]),
    "tasks" => Some(&["status", "due"]),
    "goals" => Some(&["status", "due"]),
    "snapshots" => Some(&["day", "createdAt"]),
    "blocks" => Some(&["updatedAt", "extId", "profileId"]),
    "profiles" => Some(&["updatedAt"]),
    "caseFiles" => Some(&["caseId", "kind", "createdAt"]),
    "aiCache" => Some(&["createdAt"]),
    "errorLog" => Some(&["at"]),
    "meta" | "kv" => Some(&[]),
    _ => None,
  }
}

fn key_field(table: &str) -> &'static str {
  if table == "kv" || table == "meta" { "key" } else { "id" }
}

fn json_to_sql(v: &Json) -> SqlValue {
  match v {
    Json::Null => SqlValue::Null,
    Json::Bool(b) => SqlValue::Integer(if *b { 1 } else { 0 }),
    Json::Number(n) => {
      if let Some(i) = n.as_i64() {
        SqlValue::Integer(i)
      } else {
        SqlValue::Real(n.as_f64().unwrap_or(0.0))
      }
    }
    Json::String(s) => SqlValue::Text(s.clone()),
    other => SqlValue::Text(other.to_string()),
  }
}

fn sql_to_json(v: SqlValue) -> Json {
  match v {
    SqlValue::Null => Json::Null,
    SqlValue::Integer(i) => json!(i),
    SqlValue::Real(f) => json!(f),
    SqlValue::Text(s) => json!(s),
    SqlValue::Blob(_) => Json::Null,
  }
}

fn db_path(app: &AppHandle) -> Result<PathBuf, String> {
  app
    .path()
    .app_data_dir()
    .map(|d| d.join("pwork.db"))
    .map_err(|e| format!("定位应用数据目录失败：{}", e))
}

fn open_conn(path: &PathBuf) -> Result<Connection, String> {
  if let Some(dir) = path.parent() {
    std::fs::create_dir_all(dir).map_err(|e| format!("创建数据目录失败：{}", e))?;
  }
  let conn = Connection::open(path).map_err(|e| format!("打开 pwork.db 失败：{}", e))?;
  conn
    .pragma_update(None, "journal_mode", "WAL")
    .map_err(|e| format!("设置 WAL 失败：{}", e))?;
  conn
    .pragma_update(None, "synchronous", "NORMAL")
    .map_err(|e| format!("设置 synchronous 失败：{}", e))?;
  conn.execute_batch(DDL).map_err(|e| format!("初始化表结构失败：{}", e))?;
  Ok(conn)
}

fn put_sql(table: &str) -> Result<String, String> {
  let cols = columns(table).ok_or_else(|| format!("未知的表：{}", table))?;
  let key = key_field(table);
  let mut all = vec![key.to_string()];
  all.extend(cols.iter().map(|c| c.to_string()));
  all.push("payload".to_string());
  let placeholders: Vec<&str> = all.iter().map(|_| "?").collect();
  let mut updates: Vec<String> = cols
    .iter()
    .map(|c| format!("\"{}\"=excluded.\"{}\"", c, c))
    .collect();
  updates.push("payload=excluded.payload".to_string());
  Ok(format!(
    "INSERT INTO \"{}\" ({}) VALUES ({}) ON CONFLICT(\"{}\") DO UPDATE SET {}",
    table,
    all.iter().map(|c| format!("\"{}\"", c)).collect::<Vec<_>>().join(", "),
    placeholders.join(", "),
    key,
    updates.join(", ")
  ))
}

fn apply_write_op(conn: &Connection, op: &Json) -> Result<(), String> {
  let kind = op.get("kind").and_then(|v| v.as_str()).ok_or("写操作缺 kind")?;
  let table = op.get("table").and_then(|v| v.as_str()).ok_or("写操作缺 table")?;
  columns(table).ok_or_else(|| format!("未知的表：{}", table))?;
  let key = key_field(table);
  match kind {
    "put" => {
      let record = op.get("record").ok_or("put 缺 record")?;
      let id = record
        .get(key)
        .and_then(|v| v.as_str())
        .ok_or_else(|| format!("表 {} 的记录缺主键 {}", table, key))?;
      let sql = put_sql(table)?;
      let mut params: Vec<SqlValue> = vec![SqlValue::Text(id.to_string())];
      for c in columns(table).unwrap_or(&[]) {
        params.push(json_to_sql(record.get(*c).unwrap_or(&Json::Null)));
      }
      let payload = serde_json::to_string(record).map_err(|e| format!("记录序列化失败：{}", e))?;
      params.push(SqlValue::Text(payload));
      conn
        .execute(&sql, rusqlite::params_from_iter(params))
        .map_err(|e| format!("写入表 {} 失败：{}", table, e))?;
      Ok(())
    }
    "del" => {
      let id = op.get("id").and_then(|v| v.as_str()).ok_or("del 缺 id")?;
      conn
        .execute(&format!("DELETE FROM \"{}\" WHERE \"{}\" = ?1", table, key), [id])
        .map_err(|e| format!("删除表 {} 记录失败：{}", table, e))?;
      Ok(())
    }
    "clear" => {
      conn
        .execute(&format!("DELETE FROM \"{}\"", table), [])
        .map_err(|e| format!("清空表 {} 失败：{}", table, e))?;
      Ok(())
    }
    other => Err(format!("未知写操作类型：{}", other)),
  }
}

fn with_conn<T>(state: &State<DbState>, f: impl FnOnce(&Connection) -> Result<T, String>) -> Result<T, String> {
  let guard = state.0.lock().map_err(|_| "数据库状态锁不可用")?;
  let conn = guard.as_ref().ok_or("数据库未打开（后端未就绪）")?;
  f(conn)
}

#[tauri::command]
pub fn db_probe(app: AppHandle) -> Result<Json, String> {
  let path = db_path(&app)?;
  Ok(json!({ "exists": path.exists(), "path": path.to_string_lossy() }))
}

#[tauri::command]
pub fn db_open(app: AppHandle, state: State<DbState>) -> Result<Json, String> {
  let path = db_path(&app)?;
  let fresh = !path.exists();
  let conn = open_conn(&path)?;
  let started: i64 = conn
    .query_row("SELECT COUNT(*) FROM meta WHERE key = 'migration_started'", [], |r| r.get(0))
    .map_err(|e| e.to_string())?;
  let complete: i64 = conn
    .query_row("SELECT COUNT(*) FROM meta WHERE key = 'migration_complete'", [], |r| r.get(0))
    .map_err(|e| e.to_string())?;
  *state.0.lock().map_err(|_| "数据库状态锁不可用")? = Some(conn);
  Ok(json!({
    "fresh": fresh,
    "incompleteMigration": started > 0 && complete == 0,
    "path": path.to_string_lossy(),
  }))
}

#[tauri::command]
pub fn db_select(state: State<DbState>, sql: String, params: Vec<Json>) -> Result<Vec<Json>, String> {
  with_conn(&state, |conn| {
    let mut stmt = conn.prepare(&sql).map_err(|e| format!("SQL 准备失败：{}", e))?;
    let col_names: Vec<String> = stmt.column_names().iter().map(|c| c.to_string()).collect();
    let mut rows = stmt
      .query(rusqlite::params_from_iter(params.iter().map(json_to_sql)))
      .map_err(|e| format!("SQL 执行失败：{}", e))?;
    let mut out: Vec<Json> = Vec::new();
    while let Some(row) = rows.next().map_err(|e| e.to_string())? {
      let mut obj = Map::new();
      for (i, name) in col_names.iter().enumerate() {
        let v: SqlValue = row.get(i).map_err(|e| e.to_string())?;
        obj.insert(name.clone(), sql_to_json(v));
      }
      out.push(Json::Object(obj));
    }
    Ok(out)
  })
}

#[tauri::command]
pub fn db_write(state: State<DbState>, ops: Vec<Json>) -> Result<Json, String> {
  with_conn(&state, |conn| {
    let in_tx = !conn.is_autocommit();
    if !in_tx {
      conn.execute_batch("BEGIN IMMEDIATE").map_err(|e| format!("开启事务失败：{}", e))?;
    }
    let mut puts = 0i64;
    let mut dels = 0i64;
    for op in &ops {
      let kind = op.get("kind").and_then(|v| v.as_str()).unwrap_or("").to_string();
      match apply_write_op(conn, op) {
        Ok(()) => match kind.as_str() {
          "put" => puts += 1,
          "del" => dels += 1,
          _ => {}
        },
        Err(e) => {
          if !in_tx {
            let _ = conn.execute_batch("ROLLBACK");
          }
          return Err(e);
        }
      }
    }
    if !in_tx {
      conn.execute_batch("COMMIT").map_err(|e| {
        let _ = conn.execute_batch("ROLLBACK");
        format!("事务提交失败：{}", e)
      })?;
    }
    Ok(json!({ "puts": puts, "dels": dels }))
  })
}

#[tauri::command]
pub fn db_exec(state: State<DbState>, sql: String, params: Vec<Json>) -> Result<u64, String> {
  with_conn(&state, |conn| {
    let n = conn
      .execute(&sql, rusqlite::params_from_iter(params.iter().map(json_to_sql)))
      .map_err(|e| format!("SQL 执行失败：{}", e))?;
    Ok(n as u64)
  })
}

#[tauri::command]
pub fn db_begin(state: State<DbState>) -> Result<(), String> {
  with_conn(&state, |conn| {
    if !conn.is_autocommit() {
      return Ok(()); // 已在事务中（嵌套调用并入外层）
    }
    conn.execute_batch("BEGIN IMMEDIATE").map_err(|e| format!("开启事务失败：{}", e))?;
    Ok(())
  })
}

#[tauri::command]
pub fn db_commit(state: State<DbState>) -> Result<(), String> {
  with_conn(&state, |conn| {
    if conn.is_autocommit() {
      return Ok(());
    }
    conn.execute_batch("COMMIT").map_err(|e| format!("提交事务失败：{}", e))?;
    Ok(())
  })
}

#[tauri::command]
pub fn db_rollback(state: State<DbState>) -> Result<(), String> {
  with_conn(&state, |conn| {
    if conn.is_autocommit() {
      return Ok(());
    }
    conn.execute_batch("ROLLBACK").map_err(|e| format!("回滚事务失败：{}", e))?;
    Ok(())
  })
}

/// 关闭连接并删除库文件（含 WAL 伴生文件）——迁移中断恢复用（08 §R9）
#[tauri::command]
pub fn db_destroy(app: AppHandle, state: State<DbState>) -> Result<(), String> {
  if let Ok(mut guard) = state.0.lock() {
    *guard = None;
  }
  let path = db_path(&app)?;
  let base = path.to_string_lossy().to_string();
  for suffix in ["", "-wal", "-shm"] {
    let p = PathBuf::from(format!("{}{}", base, suffix));
    if p.exists() {
      std::fs::remove_file(&p).map_err(|e| format!("删除 {} 失败：{}", p.to_string_lossy(), e))?;
    }
  }
  Ok(())
}

/// 迁移分批写入：一批 500 行内在一个事务内完成（INSERT OR REPLACE，重跑安全）
#[tauri::command]
pub fn db_migrate_batch(state: State<DbState>, table: String, rows: Vec<Json>) -> Result<i64, String> {
  with_conn(&state, |conn| {
    if !conn.is_autocommit() {
      return Err("迁移期间不应有其他事务".to_string());
    }
    conn.execute_batch("BEGIN IMMEDIATE").map_err(|e| format!("开启事务失败：{}", e))?;
    let mut n: i64 = 0;
    for row in &rows {
      let op = json!({ "kind": "put", "table": table, "record": row });
      match apply_write_op(conn, &op) {
        Ok(()) => n += 1,
        Err(e) => {
          let _ = conn.execute_batch("ROLLBACK");
          return Err(format!("迁移表 {} 失败：{}", table, e));
        }
      }
    }
    conn.execute_batch("COMMIT").map_err(|e| {
      let _ = conn.execute_batch("ROLLBACK");
      format!("迁移事务提交失败：{}", e)
    })?;
    Ok(n)
  })
}

/// 迁移收尾对账：返回全部表的行数（JS 侧与来源逐一核对）
#[tauri::command]
pub fn db_migrate_finish(state: State<DbState>) -> Result<Json, String> {
  with_conn(&state, |conn| {
    let tables = [
      "notes", "sources", "items", "tasks", "goals", "reviews", "actions", "insights",
      "snapshots", "blocks", "profiles", "caseFiles", "aiCache", "errorLog", "kv",
    ];
    let mut counts = Map::new();
    for t in tables {
      let n: i64 = conn
        .query_row(&format!("SELECT COUNT(*) FROM \"{}\"", t), [], |r| r.get(0))
        .map_err(|e| format!("统计表 {} 失败：{}", t, e))?;
      counts.insert(t.to_string(), json!(n));
    }
    Ok(Json::Object(counts))
  })
}

/// 一致性强快照（08 §R7）：备份管线在 SQLite 模式下的文件轨
#[tauri::command]
pub fn db_vacuum_into(state: State<DbState>, path: String) -> Result<(), String> {
  with_conn(&state, |conn| {
    let safe = path.replace('\'', "''");
    conn
      .execute_batch(&format!("VACUUM INTO '{}'", safe))
      .map_err(|e| format!("快照生成失败：{}", e))?;
    Ok(())
  })
}

/// 表 → 索引列清单（JS 侧建表写入用；与 Rust DDL 单一事实同源）
#[tauri::command]
pub fn db_columns() -> Result<Json, String> {
  let tables = [
    "notes", "sources", "items", "reviews", "actions", "insights", "tasks", "goals",
    "snapshots", "blocks", "profiles", "caseFiles", "aiCache", "errorLog", "meta", "kv",
  ];
  let mut m = Map::new();
  for t in tables {
    m.insert(t.to_string(), json!(columns(t)));
  }
  Ok(json!({ "columns": m, "keyFields": { "meta": "key", "kv": "key" } }))
}
