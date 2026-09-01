# PWORK 采集 Worker（C2 上云）

Cloudflare Worker：定时抓取信源 → 去重 → AI 两级筛选（可选）→ 写 D1 暂存（TTL 14 天）→ 本地工作台拉取。
免费档额度内 **¥0/月**（04 §2 C2）。云端只是可丢弃的暂存与分发层——本地 IndexedDB 才是 SSOT（AD5）。

## 部署步骤（约 10 分钟）

前置：Cloudflare 免费账号、本机 Node ≥ 20。

```bash
cd worker
npm install
npx wrangler login                 # 浏览器授权

# 1. 创建 D1 并建表
npx wrangler d1 create pwork-collect
#    → 把输出中的 database_id 填入 wrangler.toml 的 [[d1_databases]]
npx wrangler d1 execute pwork-collect --remote --file=./schema.sql

# 2. 设置访问 Token（本地同步时要用同一个值）
npx wrangler secret put TOKEN       # 或直接改 wrangler.toml 里的 TOKEN 变量

# 3. （可选）AI 两级筛选——BYOK，不配置则全链走规则评分，系统照常转
npx wrangler secret put AI_API_KEY  # DeepSeek 等 OpenAI 兼容 Key
#    模型/兴趣域/token 熔断在 wrangler.toml [vars] 里改

# 4. 部署
npx wrangler deploy                 # 输出形如 https://pwork-collect.<子域>.workers.dev
```

## 验证

```bash
BASE=https://pwork-collect.<子域>.workers.dev
curl "$BASE/"                                                # 端点清单
curl "$BASE/api/digest?n=3"                                  # 最近评分条目
curl -X POST -H "Authorization: Bearer <你的TOKEN>" "$BASE/api/fetch"   # 手动抓取一轮
```

然后在**工作台 → 设置 → 云端同步（C2）**填入端点与 Token：「推送信源清单」把本地活跃源上云，「立即同步」拉取条目（按指纹合并，本地已有的不动）。

## 已知限制与对策（04 §2/§12）

| 限制 | 对策 |
|---|---|
| workers.dev 域名大陆常被阻断 | **推荐：工作台设置 → 云端同步 → D1 直连模式**（走 api.cloudflare.com，实测可达，只需一个 D1 编辑权限 API Token）；或绑自有域名 |
| 免费档单请求子请求限额 | 单轮 cron 最多处理 24 个活跃源；更多源请分批或升付费 |
| LLM 失败/超时/熔断 | 自动回落规则评分（`aiBy='rules'`），系统照常转（04 §5 降级链，有自动化测试） |
| 云端 raw 均带 14 天 TTL | 本地拉取后即转 Curated 永久层；云端数据可随时 `wrangler d1 execute --command "DELETE FROM items"` 清空 |

## 本地开发

```bash
npm run db:init:local   # 本地 D1 建表
npm run dev             # wrangler dev（http://localhost:8787）
npm test                # vitest：解析/评分/指纹/降级链/流水线（mock D1 与 fetch）
```
