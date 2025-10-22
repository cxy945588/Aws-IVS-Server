# AWS IVS Real-time 串流 API Server

> 🎥 基於 AWS IVS (Interactive Video Service) 的大規模即時串流解決方案
> 💾 整合 PostgreSQL 持久化存儲，成本優化架構

[![TypeScript](https://img.shields.io/badge/TypeScript-5.6-blue)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-20.x-green)](https://nodejs.org/)
[![Express](https://img.shields.io/badge/Express-4.21-lightgrey)](https://expressjs.com/)
[![Redis](https://img.shields.io/badge/Redis-7.x-red)](https://redis.io/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-15-blue)](https://www.postgresql.org/)
[![License](https://img.shields.io/badge/License-MIT-yellow)](LICENSE)

---

## 📋 目錄

- [功能特性](#功能特性)
- [系統架構](#系統架構)
- [快速開始](#快速開始)
- [環境變數配置](#環境變數配置)
- [API 文檔](#api-文檔)
- [開發指南](#開發指南)
- [部署說明](#部署說明)
- [常見問題](#常見問題)
- [更新日誌](#更新日誌)
- [授權協議](#授權協議)

---

## ✨ 功能特性

### 核心功能

- 🎫 **Token 管理** - 自動生成主播和觀眾 Token
- 🎬 **Stage 管理** - 支援多 Stage 並發直播
- 📊 **即時統計** - 即時觀眾數和 Stage 狀態
- 🔄 **自動擴展** - 根據觀眾數自動創建/刪除 Stage
- 💓 **心跳機制** - 觀眾在線狀態追蹤
- 📡 **WebSocket** - 即時推送統計更新
- 📈 **CloudWatch Metrics** - AWS 監控整合
- 🔐 **API Key 認證** - 安全的 API 訪問控制

### 數據持久化

- 💾 **PostgreSQL 整合** - 觀看記錄、統計數據持久化
- 📊 **觀看歷史** - 完整的用戶觀看記錄
- 📈 **時序統計** - Stage 觀眾數時序快照
- 🔄 **自動備份** - 每 5 分鐘快照 Redis 數據
- 🧹 **自動清理** - 保留 90 天歷史數據

### 技術亮點

- ✅ **TypeScript** - 完整的類型安全
- ✅ **統一回應格式** - 標準化的 API 回應
- ✅ **錯誤處理** - 詳細的錯誤資訊和提示
- ✅ **熱冷分離** - Redis 熱數據 + PostgreSQL 冷數據
- ✅ **異步寫入** - 資料庫操作不阻塞響應
- ✅ **Singleton 模式** - 優化的服務管理
- ✅ **優雅關閉** - 確保資源正確釋放
- ✅ **速率限制** - 防止 API 濫用

### 成本優化

- 💰 **極低成本** - 單 Server + PostgreSQL 架構
- 📉 **10,000 觀眾成本** - 僅 $75/月 vs DynamoDB $1,320/月
- 🎯 **節省 94%** - 相比純 DynamoDB 方案
- 📊 參見 [成本優化方案](docs/COST_OPTIMIZATION.md)

---

## 🏗️ 系統架構

```
┌─────────────────────────────────────────┐
│         單一 Server (EC2/VPS)            │
│                                         │
│  ┌──────────────┐  ┌─────────────────┐ │
│  │   主播端     │  │    觀眾端       │ │
│  │  (PUBLISH)   │  │  (SUBSCRIBE)    │ │
│  └──────┬───────┘  └────────┬────────┘ │
│         │                   │          │
│         └─────────┬─────────┘          │
│                   │                    │
│         ┌─────────▼─────────┐          │
│         │    API Server     │          │
│         │    (Express)      │          │
│         └─────────┬─────────┘          │
│                   │                    │
│         ┌─────────┼─────────┐          │
│         │         │         │          │
│    ┌────▼───┐ ┌──▼────┐ ┌─▼────────┐  │
│    │AWS IVS │ │ Redis │ │CloudWatch│  │
│    │ Stage  │ │(熱數據)│ │ Metrics  │  │
│    └────────┘ └───┬───┘ └──────────┘  │
└────────────────────┼────────────────────┘
                     │
              ┌──────▼──────────┐
              │  PostgreSQL     │
              │  (冷數據持久化)  │
              │  • 觀看記錄      │
              │  • 統計快照      │
              │  • Stage 配置   │
              └─────────────────┘
```

### 架構說明

- **主播端**: 使用 WHIP 協議推流到 AWS IVS
- **觀眾端**: 通過 Web SDK 加入 Stage 觀看直播
- **API Server**: 管理 Token、Stage 和統計
- **Redis**: 快取即時數據（觀眾計數、心跳）
- **PostgreSQL**: 持久化冷數據（觀看記錄、統計）
- **CloudWatch**: 收集和監控系統指標

### 數據分層策略

| 數據類型 | 存儲位置 | 更新頻率 | TTL | 用途 |
|---------|---------|---------|-----|------|
| 觀眾心跳 | **Redis** | 30秒 | 2分鐘 | 實時在線狀態 |
| 觀眾計數 | **Redis** | 實時 | 無 | 實時統計 |
| 觀看記錄 | **PostgreSQL** | 離開時 | 永久 | 歷史分析 |
| 統計快照 | **PostgreSQL** | 5分鐘 | 90天 | 時序分析 |
| Stage配置 | **PostgreSQL** | 創建時 | 永久 | 持久化配置 |

---

## 🚀 快速開始

### 前置需求

- Node.js 20.x 或更高版本
- Redis 7.x 或更高版本
- **PostgreSQL 12+** 🆕
- AWS 帳號（已配置 IVS）
- npm 或 yarn

### 安裝步驟

1. **克隆專案**

```bash
git clone https://github.com/your-org/aws-ivs-server.git
cd aws-ivs-server
```

2. **安裝 PostgreSQL** 🆕

```bash
# 使用 Docker (推薦)
docker run -d \
  --name ivs-postgres \
  -e POSTGRES_PASSWORD=your_password \
  -e POSTGRES_DB=ivs_live \
  -p 5432:5432 \
  postgres:15

# 創建資料庫表
psql -U postgres -d ivs_live -f database/schema.sql
```

詳細安裝說明請參考 [部署指南](docs/DEPLOYMENT_GUIDE.md)

3. **安裝依賴**

```bash
cd api-server
npm install
```

4. **配置環境變數**

```bash
cp ../.env.example .env
```

編輯 `.env` 並填入您的配置（參見下方[環境變數配置](#環境變數配置)）

5. **啟動開發服務器**

```bash
npm run dev
```

服務器將在 `http://localhost:3000` 啟動

6. **驗證安裝**

```bash
curl http://localhost:3000/api/health
```

應該返回包含 PostgreSQL 連接狀態的健康檢查資訊

---

## ⚙️ 環境變數配置

### 必填變數

```bash
# AWS 配置
AWS_REGION=ap-northeast-1
AWS_ACCESS_KEY_ID=your-access-key-id
AWS_SECRET_ACCESS_KEY=your-secret-access-key
AWS_ACCOUNT_ID=123456789012

# AWS IVS Stage
MASTER_STAGE_ARN=arn:aws:ivs:ap-northeast-1:123456789012:stage/aBcDeFgHiJkL

# PostgreSQL 配置 🆕
DB_HOST=localhost
DB_PORT=5432
DB_NAME=ivs_live
DB_USER=postgres
DB_PASSWORD=your_database_password

# Redis 配置
REDIS_HOST=localhost
REDIS_PORT=6379

# API 配置
API_PORT=3000
API_SECRET_KEY=your-api-key-here

# 環境
NODE_ENV=development
```

### 可選變數

```bash
# PostgreSQL 連接池 🆕
DB_POOL_MAX=20
DB_POOL_MIN=2
DB_SSL_ENABLED=false

# Redis TLS（ElastiCache）
REDIS_TLS_ENABLED=false
REDIS_PASSWORD=your-redis-password

# CloudWatch Metrics
CLOUDWATCH_NAMESPACE=IVS/Production
CLOUDWATCH_ENABLED=true

# 速率限制
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX_REQUESTS=100

# 開發環境
SKIP_AUTH=false
LOG_LEVEL=info
```

### 完整配置說明

參見 [`.env.example`](.env.example) 文件

---

## 📚 API 文檔

### 完整 API 文檔

📖 **[完整 API 文檔](docs/API.md)** - YApi 格式，包含所有端點的詳細說明

### API 端點概覽

#### 🏥 健康檢查
- `GET /api/health` - 服務健康檢查（包含 PostgreSQL 狀態）

#### 🎫 Token 管理
- `POST /api/token/publisher` - 生成主播 Token
- `POST /api/token/viewer` - 生成觀眾 Token
- `POST /api/token/mediaserver` - 生成媒體服務器 Token（內部）

#### 🎬 Stage 管理
- `GET /api/stage/list` - 獲取 Stage 列表
- `GET /api/stage/master/info` - 獲取主 Stage 資訊
- `POST /api/stage` - 創建新 Stage
- `GET /api/stage/:stageArn` - 獲取 Stage 詳情
- `PUT /api/stage/:stageArn` - 更新 Stage
- `DELETE /api/stage/:stageArn` - 刪除 Stage

#### 👥 觀眾管理
- `POST /api/viewer/rejoin` - 觀眾重新加入
- `POST /api/viewer/heartbeat` - 發送心跳
- `POST /api/viewer/leave` - 觀眾離開
- `GET /api/viewer/list/:stageArn` - 獲取觀眾列表
- `GET /api/viewer/duration` - 獲取觀看時長（Redis）
- **`GET /api/viewer/history/:userId`** - 獲取觀看歷史 🆕
- **`GET /api/viewer/stats/:stageArn`** - 獲取 Stage 統計 🆕

#### 📊 統計數據
- `GET /api/stats` - 獲取總體統計
- `GET /api/stats/viewers` - 獲取觀眾統計
- `GET /api/stats/stages` - 獲取 Stage 統計
- `GET /api/stats/publisher` - 獲取主播狀態

### 快速示例

```bash
# 生成主播 Token
curl -X POST http://localhost:3000/api/token/publisher \
  -H "x-api-key: your-api-key" \
  -H "Content-Type: application/json" \
  -d '{"userId": "publisher-123"}'

# 生成觀眾 Token（自動分配 Stage）
curl -X POST http://localhost:3000/api/token/viewer \
  -H "x-api-key: your-api-key" \
  -H "Content-Type: application/json" \
  -d '{"userId": "viewer-456"}'

# 獲取觀看歷史 🆕
curl -X GET http://localhost:3000/api/viewer/history/viewer-456 \
  -H "x-api-key: your-api-key"

# 獲取 Stage 統計 🆕
curl -X GET "http://localhost:3000/api/viewer/stats/arn:aws:ivs:...:stage/xxx?days=7" \
  -H "x-api-key: your-api-key"

# 獲取統計資料
curl -X GET http://localhost:3000/api/stats \
  -H "x-api-key: your-api-key"
```

---

## 💻 開發指南

### 項目結構

```
api-server/
├── src/
│   ├── index.ts              # 應用程式入口
│   ├── routes/               # API 路由
│   │   ├── token.ts          # Token 生成
│   │   ├── stage.ts          # Stage 管理
│   │   ├── viewer.ts         # 觀眾管理 (已更新) 🆕
│   │   ├── stats.ts          # 統計數據
│   │   └── health.ts         # 健康檢查
│   ├── services/             # 業務邏輯層
│   │   ├── IVSService.ts              # AWS IVS 集成
│   │   ├── RedisService.ts            # Redis 服務
│   │   ├── PostgresService.ts         # PostgreSQL 服務 🆕
│   │   ├── ViewerRecordService.ts     # 觀看記錄服務 🆕
│   │   ├── StatsSnapshotService.ts    # 統計快照服務 🆕
│   │   ├── StageAutoScalingService.ts # 自動擴展
│   │   ├── ViewerHeartbeatService.ts  # 心跳服務
│   │   └── MetricsService.ts          # 指標收集
│   ├── middleware/           # 中間件
│   │   ├── auth.ts           # API Key 認證
│   │   ├── errorHandler.ts   # 錯誤處理
│   │   ├── rateLimiter.ts    # 速率限制
│   │   └── requestLogger.ts  # 請求日誌
│   └── utils/                # 工具函數
│       ├── constants.ts      # 常數定義
│       ├── logger.ts         # Winston 日誌
│       └── responseHelper.ts # 回應工具
├── package.json
├── tsconfig.json
└── docker-compose.yml        # Docker 編排
database/
└── schema.sql                # PostgreSQL Schema 🆕
```

### 可用腳本

```bash
# 開發模式（熱重載）
npm run dev

# 編譯 TypeScript
npm run build

# 生產模式
npm start

# 代碼格式化
npm run lint
```

### 添加新 API 端點

1. 在 `src/routes/` 創建新路由文件
2. 使用 `responseHelper` 統一回應格式
3. 在 `src/index.ts` 註冊路由
4. 更新 API 文檔

示例：

```typescript
import { Router } from 'express';
import { sendSuccess, sendError } from '../utils/responseHelper';

const router = Router();

router.get('/example', async (req, res) => {
  try {
    const data = { message: 'Hello World' };
    sendSuccess(res, data);
  } catch (error: any) {
    sendError(res, 'INTERNAL_ERROR', '錯誤訊息', 500, error.message);
  }
});

export default router;
```

---

## 🚢 部署說明

### Docker Compose 部署（推薦）🆕

完整的 Docker Compose 配置，包含 PostgreSQL、Redis 和 API Server：

```yaml
version: '3.8'

services:
  postgres:
    image: postgres:15
    environment:
      POSTGRES_DB: ivs_live
      POSTGRES_PASSWORD: your_password
    ports:
      - "5432:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data
      - ./database/schema.sql:/docker-entrypoint-initdb.d/schema.sql

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"

  api-server:
    build: ./api-server
    depends_on:
      - postgres
      - redis
    environment:
      DB_HOST: postgres
      REDIS_HOST: redis
    ports:
      - "3000:3000"

volumes:
  pgdata:
```

啟動所有服務：

```bash
docker-compose up -d
```

詳細部署指南請參考 [部署指南](docs/DEPLOYMENT_GUIDE.md)

### 生產環境建議

1. **使用環境變數管理敏感資訊**
   - 不要將 `.env` 文件提交到 Git
   - 使用 AWS Secrets Manager 或類似服務

2. **啟用資料庫 SSL** 🆕
   - 設置 `DB_SSL_ENABLED=true`
   - 生產環境建議使用 RDS

3. **定期備份 PostgreSQL** 🆕
   - 使用 `pg_dump` 定期備份
   - 設置自動化備份腳本

4. **啟用 Redis TLS**
   - 使用 AWS ElastiCache
   - 設置 `REDIS_TLS_ENABLED=true`

5. **配置 CloudWatch 監控**
   - 設置 `CLOUDWATCH_ENABLED=true`
   - 監控關鍵指標

6. **使用 HTTPS**
   - 配置反向代理（Nginx、CloudFront）
   - 申請 SSL 證書

7. **設置速率限制**
   - 根據實際需求調整限制
   - 考慮使用 API Gateway

---

## 🔧 系統限制

### AWS IVS 限制

| 項目 | 限制 |
|------|------|
| 每個 Stage 最大參與者 | 50 人 |
| 最大 Stage 數量 | 20 個（可配置） |
| 最大解析度 | 1280x720 |
| 推薦碼率 | 2500 kbps |

### Token 有效期

| Token 類型 | 有效期 |
|-----------|-------|
| 主播 Token | 4 小時 |
| 觀眾 Token | 1 小時 |

### 自動擴展

- 觀眾數 ≥ 45 時自動創建新 Stage
- 觀眾數 ≤ 5 時考慮刪除 Stage
- 新 Stage 暖機期：5 分鐘

### 數據保留 🆕

- 觀看記錄：永久保存
- 統計快照：保留 90 天（可配置）
- 定期快照：每 5 分鐘執行一次

---

## ❓ 常見問題

### Q: 為什麼使用 PostgreSQL 而不是 DynamoDB？

A: PostgreSQL 方案成本極低（$75/月 vs DynamoDB $1,320/月），且更適合中小型直播平台（<50,000 觀眾）。詳見 [成本優化方案](docs/COST_OPTIMIZATION.md)

### Q: 如何獲取 AWS IVS Stage ARN？

A: 登入 AWS Console → IVS → Real-time streaming → Stages → 複製 ARN

### Q: Redis 或 PostgreSQL 連接失敗怎麼辦？

A: 檢查：
1. 服務是否運行：`redis-cli ping` 或 `psql -U postgres -c "SELECT 1"`
2. 環境變數配置是否正確
3. 防火牆是否開放對應端口（6379 for Redis, 5432 for PostgreSQL）

### Q: 觀眾數不準確？

A: 觀眾數是即時計算的，需要觀眾定期發送心跳。如果觀眾斷開連接但未發送離開請求，系統會在 60 秒後自動移除。

### Q: 如何擴展到更多觀眾？

A: 系統支援自動擴展，每個 Stage 最多 50 人，最多 20 個 Stage，理論上可支援 1000 觀眾。超過 50,000 觀眾建議升級架構。詳見 [簡化架構方案](docs/SIMPLE_ARCHITECTURE.md)

### Q: PostgreSQL 重啟會丟失數據嗎？🆕

A: 不會！PostgreSQL 是持久化存儲，所有觀看記錄和統計數據都永久保存。Redis 重啟會丟失即時計數，但可從 PostgreSQL 快照恢復。

### Q: 如何查詢觀看歷史？🆕

A: 使用新的 API：
```bash
curl http://localhost:3000/api/viewer/history/user-id
```

---

## 📝 更新日誌

### v1.2.0 (2025-10-22) 🆕

**重大變更**:
- 🔄 整合 PostgreSQL 持久化存儲
- 🔄 實現熱冷數據分離架構
- 🔄 成本優化：節省 94% 運營成本

**新增功能**:
- ✨ PostgresService - 資料庫連接池管理
- ✨ ViewerRecordService - 觀看記錄持久化
- ✨ StatsSnapshotService - 定期快照服務
- ✨ GET /api/viewer/history/:userId - 查詢觀看歷史
- ✨ GET /api/viewer/stats/:stageArn - 查詢 Stage 統計

**文檔**:
- 📚 新增部署指南 (DEPLOYMENT_GUIDE.md)
- 📚 新增簡化架構方案 (SIMPLE_ARCHITECTURE.md)
- 📚 新增成本優化方案 (COST_OPTIMIZATION.md)

### v1.1.0 (2025-10-21)

**重大變更**:
- 🔄 統一 API 回應格式
- 🔄 標準化錯誤處理
- 🔄 欄位命名統一

**新增功能**:
- ✨ 新增 `responseHelper` 工具
- ✨ 詳細的驗證錯誤提示
- 📚 完整的 YApi 格式 API 文檔

**修復**:
- 🐛 修正 Stats API 觀眾數計算
- 🐛 修正路由順序問題
- 🐛 修正 Redis WRONGTYPE 錯誤

詳細內容請參閱 [CHANGELOG.md](CHANGELOG.md)

### v1.0.0 (2025-10-19)

初始版本發布

---

## 📖 相關文檔

### 核心文檔
- 📘 [完整 API 文檔](docs/API.md) - YApi 格式完整文檔
- 📗 [數據流圖](docs/DATA_FLOW.md) - 系統數據流程
- 📕 [更新日誌](CHANGELOG.md) - 版本更新記錄

### 新增文檔 🆕
- 🚀 [部署指南](docs/DEPLOYMENT_GUIDE.md) - PostgreSQL 部署完整指南
- 💡 [簡化架構方案](docs/SIMPLE_ARCHITECTURE.md) - 單 Server + PostgreSQL 架構
- 💰 [成本優化方案](docs/COST_OPTIMIZATION.md) - 成本分析與對比
- ⚡ [優化指南](docs/OPTIMIZATION_GUIDE.md) - 生產環境優化建議

### 歷史文檔
- 📙 [修復記錄](docs/archive/) - 歷史修復記錄

---

## 🤝 貢獻指南

歡迎貢獻！請遵循以下步驟：

1. Fork 本專案
2. 創建特性分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 開啟 Pull Request

---

## 📄 授權協議

MIT License - 詳見 [LICENSE](LICENSE) 文件

---

## 👥 作者

**Your Team**

- GitHub: [@your-org](https://github.com/your-org)
- Email: support@your-domain.com

---

## 🙏 致謝

- [AWS IVS](https://aws.amazon.com/ivs/) - 即時串流服務
- [Express](https://expressjs.com/) - Web 框架
- [Redis](https://redis.io/) - 快取服務
- [PostgreSQL](https://www.postgresql.org/) - 資料庫服務 🆕
- [TypeScript](https://www.typescriptlang.org/) - 類型安全

---

**⭐ 如果這個專案對您有幫助，請給我們一個 Star！**
