//! PWORK 内嵌网关（app/tools/gateway.mjs 的 Rust 版，2026-10 桌面版内嵌）。
//!
//! 架构：前端(WebView) → 本地网关(127.0.0.1) → 上游 LLM API。
//! Key 的读取顺序（先到先得）：
//!   ① %APPDATA%/<identifier>/gateway.env（桌面版正式位置，用户手放）
//!   ② ./.env.local、./.env（开发时沿用 app 目录的既有文件）
//! 安全边界与 Node 版一致：仅绑定 127.0.0.1；CORS 只放行 localhost/127.0.0.1；
//! 日志与响应永不回显 Key；/health 只返回布尔状态。
//! 记账：JSONL 落 %APPDATA%/<identifier>/gateway-usage.log，滚动上限 2MB（保最近 5000 条）。

use std::fs;
use std::io::Write;
use std::path::PathBuf;
use std::sync::Mutex;
use std::thread;

use serde_json::{json, Value};
use tiny_http::{Header, Method, Response, Server};

pub struct GatewayConfig {
    pub port: u16,
    pub chat_url: String,
    pub chat_key: String,
    pub chat_model: String,
    pub search_url: String,
    pub search_model: String,
    pub search_key: String,
    pub usage_log: PathBuf,
}

/// 解析 .env 形式的文件（KEY=VALUE，支持行注释与成对引号）
fn parse_env_file(path: &PathBuf, out: &mut Vec<(String, String)>) {
    if let Ok(text) = fs::read_to_string(path) {
        for line in text.lines() {
            let line = line.trim();
            if line.is_empty() || line.starts_with('#') {
                continue;
            }
            if let Some((k, v)) = line.split_once('=') {
                let k = k.trim().to_string();
                let mut v = v.trim().to_string();
                if v.len() >= 2
                    && ((v.starts_with('"') && v.ends_with('"')) || (v.starts_with('\'') && v.ends_with('\'')))
                {
                    v = v[1..v.len() - 1].to_string();
                }
                out.push((k, v));
            }
        }
    }
}

fn var_from(list: &[(String, String)], key: &str) -> Option<String> {
    list.iter().find(|(k, _)| k == key).map(|(_, v)| v.clone())
}

impl GatewayConfig {
    pub fn load(data_dir: &PathBuf) -> Self {
        // 读取顺序：AppData/gateway.env → .env.local → .env；环境变量兜底
        let mut vars: Vec<(String, String)> = Vec::new();
        parse_env_file(&data_dir.join("gateway.env"), &mut vars);
        parse_env_file(&PathBuf::from(".env.local"), &mut vars);
        parse_env_file(&PathBuf::from(".env"), &mut vars);
        for (k, v) in std::env::vars() {
            vars.push((k, v));
        }

        let port = var_from(&vars, "PWORK_GATEWAY_PORT")
            .and_then(|p| p.parse().ok())
            .unwrap_or(8788);
        let chat_url = var_from(&vars, "PWORK_LLM_BASE_URL")
            .unwrap_or_else(|| "https://api.deepseek.com".to_string());
        let chat_key = var_from(&vars, "PWORK_LLM_API_KEY").unwrap_or_default();
        // 模型固定（与 Node 版一致）：设了就以网关为准替换请求体里的 model
        let chat_model = var_from(&vars, "PWORK_LLM_MODEL").unwrap_or_default();
        // 联网搜索（与 Node 版一致）：默认跟随 LLM 上游——DeepSeek 用自研 Search API，智谱用 tools 端点
        let search_url_default = if chat_url.contains("bigmodel") {
            "https://open.bigmodel.cn/api/paas/v4/tools".to_string()
        } else {
            "https://api.deepseek.com/v1/tools/search".to_string()
        };
        let search_url = var_from(&vars, "PWORK_SEARCH_BASE_URL").unwrap_or(search_url_default);
        let search_model =
            var_from(&vars, "PWORK_SEARCH_MODEL").unwrap_or_else(|| "web-search-pro".to_string());
        let search_key = var_from(&vars, "PWORK_SEARCH_API_KEY")
            .or_else(|| if chat_key.is_empty() { None } else { Some(chat_key.clone()) })
            .unwrap_or_default();
        let usage_log = data_dir.join("gateway-usage.log");
        Self { port, chat_url, chat_key, chat_model, search_url, search_model, search_key, usage_log }
    }
}

/// 归一上游地址：允许填基础地址、带 /v1、或完整端点（与 Node 版一致）
fn normalize_upstream(base: &str) -> String {
    let u = base.trim().trim_end_matches('/').to_string();
    if u.ends_with("/chat/completions") {
        return u;
    }
    if regex_free_ends_with_version(&u) {
        return format!("{u}/chat/completions");
    }
    format!("{u}/v1/chat/completions")
}

/// 避免 regex 依赖：判断是否以 /v1 /v2 … /v1beta 这类版本段结尾
fn regex_free_ends_with_version(u: &str) -> bool {
    let Some(idx) = u.rfind('/') else { return false };
    let seg = &u[idx + 1..];
    if seg.len() < 2 || !seg.starts_with('v') {
        return false;
    }
    seg[1..].chars().all(|c| c.is_ascii_alphanumeric())
}

/// D1 直连代理入参校验：账户 ID = 32 位十六进制；数据库 ID = 标准 UUID（8-4-4-4-12）
fn valid_account_id(s: &str) -> bool {
    s.len() == 32 && s.bytes().all(|b| b.is_ascii_hexdigit())
}

fn valid_database_id(s: &str) -> bool {
    s.len() == 36
        && s.bytes().enumerate().all(|(i, b)| match i {
            8 | 13 | 18 | 23 => b == b'-',
            _ => b.is_ascii_hexdigit(),
        })
}

fn cors_headers(origin: &str) -> Vec<Header> {
    let mut hs = Vec::new();
    let lower = origin.to_lowercase();
    let ok = (lower.starts_with("http://localhost") || lower.starts_with("http://127.0.0.1"))
        && origin
            .rsplit(':')
            .next()
            .map(|p| p.is_empty() || p.chars().all(|c| c.is_ascii_digit()))
            .unwrap_or(true);
    if ok && !origin.is_empty() {
        if let (Ok(a), Ok(b), Ok(c)) = (
            Header::from_bytes("Access-Control-Allow-Origin", origin),
            Header::from_bytes("Access-Control-Allow-Headers", "Content-Type, Authorization"),
            Header::from_bytes("Access-Control-Allow-Methods", "GET, POST, OPTIONS"),
        ) {
            hs.extend([a, b, c]);
        }
    }
    hs
}

fn usage_summary(cfg: &GatewayConfig) -> Value {
    let empty = json!({ "calls": 0, "tokens": 0, "byModel": {}, "since": null, "until": null });
    let Ok(text) = fs::read_to_string(&cfg.usage_log) else {
        return empty;
    };
    let cutoff = chrono::Utc::now() - chrono::Duration::days(30);
    let mut calls = 0u64;
    let mut tokens = 0u64;
    let mut by_model: std::collections::BTreeMap<String, u64> = std::collections::BTreeMap::new();
    let mut since: Option<String> = None;
    let mut until: Option<String> = None;
    for line in text.lines().filter(|l| !l.is_empty()) {
        let Ok(row) = serde_json::from_str::<Value>(line) else { continue };
        let t = row.get("t").and_then(|v| v.as_str()).unwrap_or("");
        let Ok(ts) = chrono::DateTime::parse_from_rfc3339(t) else { continue };
        if ts.with_timezone(&chrono::Utc) < cutoff {
            continue;
        }
        calls += 1;
        let tok = row.get("tokens").and_then(|v| v.as_u64()).unwrap_or(0);
        tokens += tok;
        let model = row.get("model").and_then(|v| v.as_str()).unwrap_or("unknown");
        *by_model.entry(model.to_string()).or_insert(0) += tok;
        if since.is_none() {
            since = Some(t.to_string());
        }
        until = Some(t.to_string());
    }
    json!({ "calls": calls, "tokens": tokens, "byModel": by_model, "since": since, "until": until })
}

fn log_usage(cfg: &GatewayConfig, req_body: &str, resp_text: &str, lock: &Mutex<()>) {
    let _g = lock.lock().unwrap();
    let Ok(req) = serde_json::from_str::<Value>(req_body) else { return };
    let Ok(resp) = serde_json::from_str::<Value>(resp_text) else { return };
    let Some(usage) = resp.get("usage") else { return };
    let model = req.get("model").and_then(|v| v.as_str()).unwrap_or("unknown");
    let line = json!({
        "t": chrono::Utc::now().to_rfc3339(),
        "model": model,
        "tokens": usage.get("total_tokens").and_then(|v| v.as_u64()).unwrap_or(0),
        "prompt": usage.get("prompt_tokens").and_then(|v| v.as_u64()).unwrap_or(0),
        "completion": usage.get("completion_tokens").and_then(|v| v.as_u64()).unwrap_or(0),
    });
    if let Some(parent) = cfg.usage_log.parent() {
        let _ = fs::create_dir_all(parent);
    }
    let _ = fs::OpenOptions::new().create(true).append(true).open(&cfg.usage_log)
        .and_then(|mut f| writeln!(f, "{line}"));
    // 滚动：超 2MB 保留最近 5000 行
    if let Ok(meta) = fs::metadata(&cfg.usage_log) {
        if meta.len() > 2_000_000 {
            if let Ok(text) = fs::read_to_string(&cfg.usage_log) {
                let lines: Vec<&str> = text.lines().filter(|l| !l.is_empty()).collect();
                let keep: Vec<&str> = if lines.len() > 5000 { lines[lines.len() - 5000..].to_vec() } else { lines };
                let _ = fs::write(&cfg.usage_log, keep.iter().map(|l| format!("{l}\n")).collect::<String>());
            }
        }
    }
}

/// 启动内嵌网关（独立线程，随应用退出而终止）。端口被占（比如开发时 Node 版在跑）时静默让位。
pub fn start(data_dir: PathBuf) {
    thread::spawn(move || {
        let cfg = GatewayConfig::load(&data_dir);
        let addr = format!("127.0.0.1:{}", cfg.port);
        let Ok(server) = Server::http(&addr) else {
            log::info!("[PWORK 网关] 端口 {} 已被占用（可能是开发版网关在跑），内嵌网关不启动", cfg.port);
            return;
        };
        log::info!(
            "[PWORK 网关] http://127.0.0.1:{} ｜ 上游：{} ｜ Key：{}",
            cfg.port,
            normalize_upstream(&cfg.chat_url),
            if cfg.chat_key.is_empty() { "未配置（/health 可用，对话返回 503）" } else { "已配置" }
        );
        let usage_lock = Mutex::new(());
        for mut req in server.incoming_requests() {
            let method = req.method().clone();
            let url = req.url().to_string();
            let origin = req
                .headers()
                .iter()
                .find(|h| h.field.equiv("Origin"))
                .map(|h| h.value.as_str().to_string())
                .unwrap_or_default();
            let path = url.split('?').next().unwrap_or("").to_string();

            // CORS 预检
            if method == Method::Options {
                let mut r = Response::empty(204);
                for h in cors_headers(&origin) {
                    r.add_header(h);
                }
                let _ = req.respond(r);
                continue;
            }

            let mut resp_headers = cors_headers(&origin);
            let ct = Header::from_bytes("Content-Type", "application/json; charset=utf-8").unwrap();

            // 读请求体：非 UTF-8 / 读取失败必须如实报 400——静默转发空体会让上游报
            // "body missing"，排查方向全错（2026-10-11 真实踩坑：GBK 终端的 curl）
            let reads_body = path.ends_with("/chat/completions") || path == "/search" || path == "/d1/query";
            let body: Result<String, String> = if reads_body {
                let mut b = String::new();
                match req.as_reader().read_to_string(&mut b) {
                    Ok(_) => Ok(b),
                    Err(e) => Err(format!("请求体读取失败（必须是 UTF-8）：{e}")),
                }
            } else {
                Ok(String::new())
            };

            let (status, payload): (u16, Value) = if path == "/health" {
                (200, json!({
                    "ok": true,
                    "chatConfigured": !cfg.chat_key.is_empty(),
                    "searchConfigured": !cfg.search_key.is_empty(),
                    "model": if cfg.chat_model.is_empty() { Value::Null } else { json!(cfg.chat_model) },
                    "upstream": normalize_upstream(&cfg.chat_url).trim_end_matches("/chat/completions"),
                }))
            } else if path == "/search" && method == Method::Post {
                match body.as_deref() {
                    Err(msg) => (400, json!({ "ok": false, "error": msg })),
                    Ok("") => (400, json!({ "ok": false, "error": "请求体为空" })),
                    Ok(_) if cfg.search_key.is_empty() => (
                        503,
                        json!({ "ok": false, "error": "网关未配置搜索 Key——在 gateway.env 写 PWORK_SEARCH_API_KEY（智谱 Key；LLM 上游为智谱时自动复用）后重启应用" }),
                    ),
                    Ok(body) => {
                        let req_v: Value = match serde_json::from_str(body) {
                            Ok(v) => v,
                            Err(_) => {
                                let _ = req.respond(Response::from_string("{\"ok\":false,\"error\":\"请求体不是 JSON\"}").with_status_code(400));
                                continue;
                            }
                        };
                        let query = req_v.get("query").and_then(|v| v.as_str()).unwrap_or("").to_string();
                        let count = req_v.get("count").and_then(|v| v.as_u64()).unwrap_or(6).min(10) as usize;
                        if query.is_empty() {
                            (400, json!({ "ok": false, "error": "缺少 query" }))
                        } else {
                            // DeepSeek Search API：{query,count} → results[].{title,url,summary}；智谱：tools 格式
                            let up_body = if cfg.search_url.contains("deepseek") {
                                json!({ "query": query, "count": count.min(50) }).to_string()
                            } else {
                                json!({
                                    "model": cfg.search_model,
                                    "messages": [{ "role": "user", "content": query }],
                                    "stream": false
                                })
                                .to_string()
                            };
                            match ureq::post(&cfg.search_url)
                                .set("content-type", "application/json")
                                .set("authorization", &format!("Bearer {}", cfg.search_key))
                                .send_string(&up_body)
                            {
                                Ok(up) => {
                                    let status = up.status();
                                    let text = up.into_string().unwrap_or_default();
                                    log_usage(&cfg, &up_body, &text, &usage_lock);
                                    if status != 200 {
                                        let msg = serde_json::from_str::<Value>(&text)
                                            .ok()
                                            .and_then(|v| {
                                                v.get("error").and_then(|e| e.get("message")).and_then(|m| m.as_str()).map(|s| s.to_string())
                                            })
                                            .unwrap_or_else(|| text.chars().take(200).collect());
                                        (502, json!({ "ok": false, "error": format!("搜索上游 {status}：{msg}") }))
                                    } else {
                                        // 归一化：DeepSeek results[].{title,url,summary}；智谱 choices[].tool_calls[].search_result[]
                                        let v: Value = serde_json::from_str(&text).unwrap_or(Value::Null);
                                        let mut hits: Vec<Value> = Vec::new();
                                        if cfg.search_url.contains("deepseek") {
                                            if let Some(results) = v.get("results").and_then(|x| x.as_array()) {
                                                for sr in results {
                                                    let link = sr.get("url").and_then(|l| l.as_str()).unwrap_or("");
                                                    if link.is_empty() {
                                                        continue;
                                                    }
                                                    let summary = sr
                                                        .get("summary")
                                                        .and_then(|c| c.as_str())
                                                        .or_else(|| sr.get("snippet").and_then(|c| c.as_str()))
                                                        .unwrap_or("");
                                                    hits.push(json!({
                                                        "title": sr.get("title").and_then(|t| t.as_str()).unwrap_or(""),
                                                        "link": link,
                                                        "content": summary,
                                                    }));
                                                }
                                            }
                                        } else if let Some(tcs) = v.pointer("/choices/0/message/tool_calls").and_then(|x| x.as_array()) {
                                            for tc in tcs {
                                                if let Some(srs) = tc.get("search_result").and_then(|x| x.as_array()) {
                                                    for sr in srs {
                                                        let link = sr.get("link").and_then(|l| l.as_str()).unwrap_or("");
                                                        if link.is_empty() {
                                                            continue;
                                                        }
                                                        hits.push(json!({
                                                            "title": sr.get("title").and_then(|t| t.as_str()).unwrap_or(""),
                                                            "link": link,
                                                            "content": sr.get("content").and_then(|c| c.as_str()).unwrap_or(""),
                                                        }));
                                                    }
                                                }
                                            }
                                        }
                                        hits.truncate(count);
                                        (200, json!({ "ok": true, "results": hits }))
                                    }
                                }
                                Err(err) => {
                                    let msg = format!("{err}");
                                    if let Some(up) = err.into_response() {
                                        let status = up.status();
                                        let text = up.into_string().unwrap_or_default();
                                        (502, json!({ "ok": false, "error": format!("搜索上游 {status}：{text}") }))
                                    } else {
                                        (502, json!({ "ok": false, "error": format!("搜索上游请求失败：{msg}") }))
                                    }
                                }
                            }
                        }
                    }
                }
            } else if path == "/d1/query" && method == Method::Post {
                // D1 直连代理（与 Node 版一致）：api.cloudflare.com 无 CORS 头，浏览器经此转发。
                // Token 随请求带来，不落盘不记账。
                match body.as_deref() {
                    Err(msg) => (400, json!({ "ok": false, "error": msg })),
                    Ok("") => (400, json!({ "ok": false, "error": "请求体为空" })),
                    Ok(body) => {
                        let req_v: Value = match serde_json::from_str(body) {
                            Ok(v) => v,
                            Err(_) => {
                                let _ = req.respond(Response::from_string("{\"ok\":false,\"error\":\"请求体不是 JSON\"}").with_status_code(400));
                                continue;
                            }
                        };
                        let account = req_v.get("accountId").and_then(|v| v.as_str()).unwrap_or("");
                        let database = req_v.get("databaseId").and_then(|v| v.as_str()).unwrap_or("");
                        let token = req_v.get("token").and_then(|v| v.as_str()).unwrap_or("");
                        let sql = req_v.get("sql").and_then(|v| v.as_str()).unwrap_or("");
                        if !valid_account_id(account) || !valid_database_id(database) || token.is_empty() || sql.is_empty() {
                            (400, json!({ "ok": false, "error": "账户 ID / 数据库 ID / Token / SQL 缺失或格式不对" }))
                        } else {
                            let up_body = json!({ "sql": sql, "params": req_v.get("params").cloned().unwrap_or(json!([])) }).to_string();
                            let url = format!("https://api.cloudflare.com/client/v4/accounts/{account}/d1/database/{database}/query");
                            match ureq::post(&url)
                                .set("content-type", "application/json")
                                .set("authorization", &format!("Bearer {token}"))
                                .timeout(std::time::Duration::from_secs(30))
                                .send_string(&up_body)
                            {
                                Ok(up) => {
                                    let status = up.status();
                                    let text = up.into_string().unwrap_or_default();
                                    // Cloudflare 响应原样透传（status + JSON）
                                    match serde_json::from_str::<Value>(&text) {
                                        Ok(v) => (status, v),
                                        Err(_) => (502, json!({ "ok": false, "error": "上游返回非 JSON" })),
                                    }
                                }
                                Err(err) => {
                                    let msg = format!("{err}");
                                    if let Some(up) = err.into_response() {
                                        let status = up.status();
                                        let text = up.into_string().unwrap_or_default();
                                        (status, json!({ "ok": false, "error": format!("D1 上游返回 {status}：{text}") }))
                                    } else {
                                        (502, json!({ "ok": false, "error": format!("D1 上游请求失败：{msg}") }))
                                    }
                                }
                            }
                        }
                    }
                }
            } else if path.ends_with("/chat/completions") && method == Method::Post {
                match body.as_deref() {
                    Err(msg) => (400, json!({ "error": msg })),
                    Ok("") => (400, json!({ "error": "请求体为空" })),
                    Ok(_body) if cfg.chat_key.is_empty() => {
                        (503, json!({ "error": "网关未配置 PWORK_LLM_API_KEY——把 Key 放到应用数据目录的 gateway.env（PWORK_LLM_API_KEY=…）后重启应用" }))
                    }
                    Ok(body) => {
                        // 模型固定：设了 PWORK_LLM_MODEL 就替换请求体里的 model（与 Node 版一致）
                        let out_body = if cfg.chat_model.is_empty() {
                            body.to_string()
                        } else {
                            match serde_json::from_str::<Value>(body) {
                                Ok(mut v) => {
                                    if let Some(obj) = v.as_object_mut() {
                                        obj.insert("model".to_string(), json!(cfg.chat_model));
                                    }
                                    v.to_string()
                                }
                                Err(_) => body.to_string(),
                            }
                        };
                        match ureq::post(&normalize_upstream(&cfg.chat_url))
                            .set("content-type", "application/json")
                            .set("authorization", &format!("Bearer {}", cfg.chat_key))
                            .send_string(&out_body)
                        {
                            Ok(up) => {
                                let status = up.status();
                                let text = up.into_string().unwrap_or_default();
                                log_usage(&cfg, body, &text, &usage_lock);
                                // 上游 JSON 原样透传（status + body，与 Node 版行为一致）
                                match serde_json::from_str::<Value>(&text) {
                                    Ok(v) => (status, v),
                                    Err(_) => (502, json!({ "error": "上游返回非 JSON" })),
                                }
                            }
                            Err(err) => {
                                // ureq 对非 2xx 也走 Err：响应体里有上游的具体错误，必须透传而不是只留状态码
                                let msg = format!("{err}");
                                if let Some(up) = err.into_response() {
                                    let status = up.status();
                                    let text = up.into_string().unwrap_or_default();
                                    (status, json!({ "error": format!("上游返回 {status}：{text}") }))
                                } else {
                                    (502, json!({ "error": format!("上游请求失败：{msg}") }))
                                }
                            }
                        }
                    }
                }
            } else if path == "/usage" && method == Method::Get {
                (200, usage_summary(&cfg))
            } else {
                (404, json!({ "error": "not found" }))
            };

            // chat/completions 的上游 JSON 需要原样字符串返回（status 200 + body）
            let mut r = Response::from_string(payload.to_string()).with_status_code(status);
            r.add_header(ct);
            for h in resp_headers.drain(..) {
                r.add_header(h);
            }
            let _ = req.respond(r);
        }
    });
}
