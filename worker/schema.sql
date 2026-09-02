-- D1 暂存层（Raw，TTL 14 天，不备份——04 §2 C2 / §3.4）
-- 本地 IndexedDB 才是状态 SSOT；云端只是可丢弃的暂存与分发层（AD5）
CREATE TABLE IF NOT EXISTS sources (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  url TEXT NOT NULL UNIQUE,
  domain TEXT NOT NULL DEFAULT 'other',
  tier REAL NOT NULL DEFAULT 2,
  weight REAL NOT NULL DEFAULT 0.4,
  active INTEGER NOT NULL DEFAULT 1,
  fail_streak INTEGER NOT NULL DEFAULT 0,
  last_ok_at TEXT,
  last_error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS items (
  id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL,
  source_name TEXT NOT NULL,
  url TEXT NOT NULL,
  title TEXT NOT NULL,
  summary TEXT NOT NULL DEFAULT '',
  fingerprint TEXT NOT NULL UNIQUE,
  published_at TEXT,
  fetched_at TEXT NOT NULL,
  stage TEXT NOT NULL DEFAULT 'raw',        -- raw | prefiltered | scored | discarded
  score_total INTEGER NOT NULL DEFAULT 0,
  score_source REAL NOT NULL DEFAULT 0,
  score_novelty REAL NOT NULL DEFAULT 0,
  score_relevance REAL NOT NULL DEFAULT 0,
  score_utility REAL NOT NULL DEFAULT 0,
  score_reason TEXT NOT NULL DEFAULT '',
  ai_by TEXT NOT NULL DEFAULT 'rules',      -- rules | <model>
  tags TEXT NOT NULL DEFAULT '[]',          -- JSON array
  ot_flag TEXT,                             -- opportunity | threat | trend | NULL
  expires_at TEXT NOT NULL,                 -- TTL 14 天
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_items_fetched ON items(fetched_at);
CREATE INDEX IF NOT EXISTS idx_items_stage ON items(stage);

CREATE TABLE IF NOT EXISTS usage (
  day TEXT PRIMARY KEY,                     -- 'YYYY-MM-DD' UTC
  tokens INTEGER NOT NULL DEFAULT 0
);

-- 本地同步水位记录（GET /api/items?since= 用 fetched_at 增量；此表可选）
CREATE TABLE IF NOT EXISTS meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- 外部数据推送暂存（输入第三通道的机器入口；鉴权读写；应用侧按 created_at 增量拉取）
CREATE TABLE IF NOT EXISTS ingest_blocks (
  id TEXT PRIMARY KEY,
  source TEXT NOT NULL DEFAULT 'api',
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ingest_created ON ingest_blocks(created_at);
