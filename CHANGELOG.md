# 更新日誌 (Changelog)

本文檔記錄所有重要的版本變更。

格式基於 [Keep a Changelog](https://keepachangelog.com/zh-TW/1.0.0/)，
版本號遵循 [Semantic Versioning](https://semver.org/lang/zh-TW/)。

---

## [Unreleased]

### 計劃中
- [ ] 添加單元測試覆蓋 (目標 70% 覆蓋率)
- [ ] 完善 WebSocket 認證機制
- [ ] 添加 Swagger/OpenAPI 文檔
- [ ] 實現請求驗證層 (Joi/Yup)
- [ ] PostgreSQL 讀寫分離優化
- [ ] 實現 APM 監控 (Sentry/X-Ray)

---

## [1.2.0] - 2025-10-22

### 🔄 重大變更 (Breaking Changes)

#### PostgreSQL 整合
**影響**: 系統架構
**說明**: 從純 Redis 架構升級為 Redis + PostgreSQL 混合架構

**變更內容**:
- 熱數據（觀眾心跳、實時計數）仍存儲在 Redis
- 冷數據（觀看記錄、統計快照）持久化到 PostgreSQL
- 新增資料庫依賴 `pg` 和 `@types/pg`

**升級指引**:
1. 安裝 PostgreSQL 12+
2. 執行 `database/schema.sql` 創建表
3. 配置環境變數 `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`
4. 重新安裝依賴 `npm install`

詳見: [部署指南](docs/DEPLOYMENT_GUIDE.md)

### ✨ 新增功能 (Added)

#### 整合測試套件 🆕

- **完整的整合測試** (`api-server/tests/integration/`) 🆕
  - `01-environment-test.ts` - 環境檢查測試
  - `02-redis-test.ts` - Redis 服務測試
  - `03-api-test.ts` - API 端點測試
  - `04-stress-test.ts` - 壓力測試（100 觀眾並發）
  - `05-autoscaling-test.ts` - 自動擴展測試（模擬 50 觀眾觸發擴展）
  - `run-tests.js` / `run-tests.ts` - 主測試腳本
  - `test-config.ts` - 測試配置
  - `README.md` - 測試文檔

**特色**:
- ✅ Rate Limit 處理：批次請求 + 重試邏輯
- ✅ 真實場景模擬：自動擴展測試等待 30 秒健康檢查觸發
- ✅ 完整清理機制：所有測試觀眾自動離開
- ✅ 詳細進度顯示：即時顯示測試進度

**執行方式**:
```bash
cd api-server/tests/integration
npm test
# 或跳過壓力測試
SKIP_STRESS_TESTS=true npm test
```

詳見: `api-server/tests/integration/README.md`

#### PostgreSQL 持久化層

- **PostgresService** (`services/PostgresService.ts`) 🆕
  - 連接池管理 (max: 20, min: 2)
  - `query()` - SQL 查詢執行
  - `transaction()` - 事務支持
  - `ping()` - 連接測試
  - `getPoolStats()` - 連接池監控
  - `cleanupOldData()` - 清理 90 天前的快照數據

- **ViewerRecordService** (`services/ViewerRecordService.ts`) 🆕
  - `recordJoin()` - 異步記錄觀眾加入
  - `recordLeave()` - 異步更新觀眾離開
  - `getViewerHistory()` - 查詢觀看歷史
  - `getStageStats()` - 查詢 Stage 統計（7/30/90 天）
  - `getActiveViewers()` - 查詢資料庫中的活躍觀眾
  - `closeStaleSessions()` - 關閉 10 分鐘無心跳的 Session

- **StatsSnapshotService** (`services/StatsSnapshotService.ts`) 🆕
  - `start()` - 啟動定期快照（每 5 分鐘）
  - `takeSnapshot()` - 執行快照（將 Redis 數據同步到 PostgreSQL）
  - `restoreFromSnapshot()` - 從 PostgreSQL 恢復數據到 Redis
  - `getSnapshotStats()` - 獲取快照統計
  - `getStageTimeSeries()` - 獲取時序數據（24 小時）
  - 自動清理：保留 90 天歷史數據

#### 資料庫 Schema

- **`database/schema.sql`** 🆕
  - `stages` 表：Stage 配置持久化
  - `users` 表：用戶資料（可選）
  - `viewer_sessions` 表：完整觀看記錄（加入時間、離開時間、觀看時長）
  - `viewer_stats_snapshots` 表：時序統計快照（每 5 分鐘）
  - 自動更新觸發器 (`update_updated_at_column`)
  - 清理舊數據函數 (`cleanup_old_snapshots`)
  - 查詢視圖 (`active_viewers`, `stage_stats_7d`)

#### 新增 API 端點

- **`GET /api/viewer/history/:userId`** 🆕
  - 查詢觀眾的觀看歷史記錄
  - 支持分頁 (`?limit=10`)
  - 返回：加入時間、離開時間、觀看時長
  - 詳見: `routes/viewer.ts:209-229`

- **`GET /api/viewer/stats/:stageArn`** 🆕
  - 查詢 Stage 的統計數據
  - 支持時間範圍 (`?days=7`)
  - 返回：總觀看次數、唯一觀眾數、平均/最大觀看時長
  - 詳見: `routes/viewer.ts:231-260`

### 🔧 改進 (Changed)

#### 數據分層架構

**熱數據 → Redis** (毫秒級性能)
- 觀眾心跳 (TTL: 2 分鐘)
- 實時觀眾計數
- 在線狀態

**冷數據 → PostgreSQL** (永久保存)
- 觀看記錄（完整歷史）
- 統計快照（每 5 分鐘）
- Stage 配置

**關鍵設計**:
- ✅ 異步寫入資料庫，不阻塞 API 響應
- ✅ 定期快照機制，Redis 重啟可恢復
- ✅ 自動清理舊數據，節省存儲成本

#### API 路由改進

- **`POST /api/viewer/rejoin`** (已更新)
  - 同步更新 Redis（即時）
  - 異步寫入 PostgreSQL（不阻塞）
  - 記錄 `user_agent` 和 `ip_address`
  - 詳見: `routes/viewer.ts:25-77`

- **`POST /api/viewer/leave`** (已更新)
  - 同步更新 Redis
  - 異步更新 PostgreSQL（計算觀看時長）
  - 詳見: `routes/viewer.ts:116-148`

#### 環境變數新增

新增 PostgreSQL 配置項：
```env
DB_HOST=localhost
DB_PORT=5432
DB_NAME=ivs_live
DB_USER=postgres
DB_PASSWORD=your_password
DB_POOL_MAX=20
DB_POOL_MIN=2
DB_SSL_ENABLED=false
```

### 🐛 修復 (Fixed)

無（本版本專注於新功能）

### 📚 文檔 (Documentation)

- **新增核心文檔**:
  - `docs/DEPLOYMENT_GUIDE.md` - PostgreSQL 部署完整指南 🆕
  - `docs/SIMPLE_ARCHITECTURE.md` - 單 Server + PostgreSQL 架構方案 🆕
  - `api-server/tests/integration/README.md` - 整合測試指南 🆕

- **更新現有文檔**:
  - `README.md` - 添加 PostgreSQL 說明、新 API 端點、整合測試說明
  - `CHANGELOG.md` - 本更新日誌
  - `docs/API.md` - 更新至 v1.2.0，新增 3 個 API 端點
  - `docs/README.md` - 更新文檔導航，移除過時文檔引用
  - `.env.example` - 添加 PostgreSQL 環境變數

- **歸檔文檔** (移至 `docs/archive/`):
  - `DATA_FLOW_v1.1_DynamoDB.md` - 舊版 DynamoDB 數據流程圖 ♻️
  - `COST_OPTIMIZATION_v1.1_DynamoDB.md` - 舊版 DynamoDB 成本方案 ♻️
  - `OPTIMIZATION_GUIDE_v1.1_DynamoDB.md` - 舊版 DynamoDB 優化指南 ♻️
  - `QUICK_START_OPTIMIZATION_v1.1.md` - 舊版快速優化指南 ♻️
  - **原因**: 這些文檔建議的 DynamoDB 實現未被採用，實際採用 PostgreSQL

### 💰 成本優化

#### 架構對比

| 方案 | 10,000 觀眾成本 | 複雜度 | 數據持久化 |
|------|----------------|--------|-----------|
| 純 DynamoDB | $1,320/月 | 低 | ✅ |
| Redis + DynamoDB 快照 | $24/月 | 中 | ✅ |
| **Redis + PostgreSQL (v1.2.0)** | **$75/月** | **低** | **✅** |

**成本節省**: 相比純 DynamoDB 方案節省 **94%**

**適用場景**:
- ✅ 中小型直播平台（< 50,000 觀眾）
- ✅ 已有網站 API 基礎設施
- ✅ 團隊熟悉傳統資料庫
- ✅ 預算有限

詳見: [成本優化方案](docs/COST_OPTIMIZATION.md)

### 🔐 安全性 (Security)

- PostgreSQL 連接支持 SSL/TLS (`DB_SSL_ENABLED=true`)
- 環境變數隔離敏感資訊
- 連接池限制防止資源耗盡

### ⚠️ 棄用 (Deprecated)

無

### 🗑️ 移除 (Removed)

- ❌ 移除 `[Unreleased]` 計劃中的「實現 DynamoDB 持久化」
  - **原因**: 改用 PostgreSQL，成本更低、更適合中小型場景

### 🎯 升級步驟

從 v1.1.0 升級到 v1.2.0：

1. **安裝 PostgreSQL**
   ```bash
   docker run -d --name ivs-postgres \
     -e POSTGRES_PASSWORD=your_password \
     -e POSTGRES_DB=ivs_live \
     -p 5432:5432 postgres:15
   ```

2. **創建資料庫表**
   ```bash
   psql -U postgres -d ivs_live -f database/schema.sql
   ```

3. **更新環境變數**
   ```bash
   # 編輯 .env 添加 PostgreSQL 配置
   DB_HOST=localhost
   DB_PORT=5432
   DB_NAME=ivs_live
   DB_USER=postgres
   DB_PASSWORD=your_password
   ```

4. **安裝依賴**
   ```bash
   npm install
   ```

5. **啟動服務**
   ```bash
   npm run build
   npm start
   ```

6. **驗證部署**
   ```bash
   curl http://localhost:3000/api/health
   # 應返回包含 PostgreSQL 狀態的回應
   ```

詳細指南: [部署指南](docs/DEPLOYMENT_GUIDE.md)

---

## [1.1.0] - 2025-10-21

### 🔄 重大變更 (Breaking Changes)

#### API 回應格式統一
**影響**: 所有 API 端點
**說明**: 統一所有 API 的回應格式，確保一致性

**之前**:
```json
{
  "success": true,
  "data": { ... },
  "timestamp": "2025-10-21T..."
}
```

**之後**: (格式相同，但錯誤回應格式有變化)
```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "錯誤描述",
    "details": { ... }
  },
  "timestamp": "2025-10-21T..."
}
```

#### 欄位命名變更

| 舊欄位名 | 新欄位名 | 影響端點 |
|---------|---------|---------|
| `info` | `stageInfo` | `GET /api/stats/stages` |
| `isLive` | `isPublisherLive` | `GET /api/stats/publisher` |
| `watchDuration` | `watchDurationSeconds` | `GET /api/viewer/duration` |
| `isMaster` | `isMasterStage` | `GET /api/stage/master/info` |

### ✨ 新增功能 (Added)

- **Response Helper 工具** (`utils/responseHelper.ts`)
  - `sendSuccess()` - 統一的成功回應
  - `sendError()` - 統一的錯誤回應
  - `sendValidationError()` - 驗證錯誤（含缺失欄位列表）
  - `sendNotFound()` - 404 錯誤
  - `sendForbidden()` - 403 錯誤
  - `sendInternalError()` - 500 錯誤

- **詳細的驗證錯誤提示**
  - 所有驗證錯誤現在都會返回 `details.missingFields` 數組
  - 明確指出哪些欄位缺失

- **完整的 API 文檔**
  - YApi 格式的完整 API 文檔 (`docs/API.md`)
  - 包含所有端點的詳細說明、請求/回應示例
  - 完整的錯誤碼說明
  - 最佳實踐指南

### 🔧 改進 (Changed)

- **統一錯誤處理**
  - 所有路由使用標準化的錯誤處理
  - 開發環境返回詳細錯誤資訊
  - 生產環境隱藏敏感錯誤詳情

- **欄位命名標準化**
  - 所有 API 使用一致的欄位命名
  - 布林值使用 `is` 前綴（如 `isMasterStage`）
  - 數值使用明確的單位後綴（如 `watchDurationSeconds`）

- **改進的回應格式**
  - 所有成功回應都包含 `success`, `data`, `timestamp`
  - 所有錯誤回應都包含 `success`, `error`, `timestamp`
  - 可選的 `message` 欄位用於額外說明

### 🐛 修復 (Fixed)

- **修正 Stats API 觀眾數計算**
  - `totalViewers` 改為即時計算（各 Stage 總和）
  - 移除了不正確的 Redis `total_viewers` 鍵依賴
  - 詳見: `routes/stats.ts:90`

- **修正路由順序問題**
  - `/api/stage/list` 必須在 `/:stageArn` 之前註冊
  - `/api/stage/master/info` 必須在 `/:stageArn` 之前註冊
  - 詳見: `routes/stage.ts:46, 102`

- **修正 Redis WRONGTYPE 錯誤**
  - 添加 `cleanupInvalidKeys()` 方法
  - 改進 `getTotalViewerCount()` 錯誤處理
  - 詳見: `services/RedisService.ts`

### 📚 文檔 (Documentation)

- 新增完整的 YApi 格式 API 文檔 (`docs/API.md`)
- 更新 README.md 主文檔
- 創建 CHANGELOG.md 版本記錄
- 新增 API 修復記錄 (`API_FIXES_2025-10-21.md`)
- 整理歷史修復記錄到 `docs/archive/`

### 🔐 安全性 (Security)

無變更

### ⚠️ 棄用 (Deprecated)

- ❌ 移除手動增減觀眾數 API
  - `POST /api/stats/viewer/increment` (已移除)
  - `POST /api/stats/viewer/decrement` (已移除)
  - **原因**: 觀眾數應該自動管理，不應手動操作

### 🗑️ 移除 (Removed)

- 移除舊的 API 文檔 `API_DOCUMENTATION.md` (已整合到新文檔)
- 移除重複的修復記錄文件

---

## [1.0.0] - 2025-10-19

### ✨ 初始版本功能

#### Token 管理
- ✅ 主播 Token 生成 (PUBLISH 權限)
- ✅ 觀眾 Token 生成 (SUBSCRIBE 權限)
- ✅ 媒體服務器 Token 生成 (PUBLISH + SUBSCRIBE 權限)
- ✅ Token 自動過期管理

#### Stage 管理
- ✅ Stage 列表查詢
- ✅ 主 Stage 資訊獲取
- ✅ 創建新 Stage
- ✅ 更新 Stage 配置
- ✅ 刪除 Stage（保護主 Stage）

#### 觀眾管理
- ✅ 觀眾加入/離開追蹤
- ✅ 觀眾心跳機制 (60 秒超時)
- ✅ 觀眾列表查詢
- ✅ 觀看時長統計

#### 統計數據
- ✅ 總體統計資訊
- ✅ 觀眾數統計
- ✅ Stage 統計
- ✅ 主播狀態查詢

#### 自動擴展
- ✅ 基於觀眾數的自動擴展
  - 觀眾數 ≥ 45 時創建新 Stage
  - 觀眾數 ≤ 5 時刪除 Stage
- ✅ 智能觀眾分配（分配到觀眾數最少的 Stage）
- ✅ 新 Stage 暖機期保護 (5 分鐘)

#### WebSocket 支援
- ✅ 即時統計推送
- ✅ 訂閱/取消訂閱機制
- ✅ 每 5 秒推送更新

#### CloudWatch 整合
- ✅ 自動上報系統指標
  - 總觀眾數
  - 併發觀眾數
  - 活躍 Stage 數
  - API 延遲
  - Token 生成時間
  - Stage 創建時間

#### 安全性
- ✅ API Key 認證
- ✅ 速率限制 (100 請求/分鐘)
- ✅ 內部 API 保護

#### 可靠性
- ✅ Redis 重連機制
- ✅ 優雅關閉
- ✅ 完整的錯誤處理
- ✅ Winston 日誌記錄

### 🏗️ 技術架構

- **後端框架**: Express.js 4.21
- **語言**: TypeScript 5.6
- **運行環境**: Node.js 20.x
- **數據存儲**: Redis 7.x
- **雲服務**: AWS IVS, CloudWatch
- **日誌**: Winston
- **安全**: Helmet, CORS

### 📦 依賴包

主要依賴：
- `express`: ^4.21.2
- `@aws-sdk/client-ivs-realtime`: ^3.705.0
- `@aws-sdk/client-cloudwatch`: ^3.705.0
- `redis`: ^4.7.0
- `winston`: ^3.17.0
- `ws`: ^8.18.0
- `helmet`: ^8.0.0
- `express-rate-limit`: ^7.4.1

開發依賴：
- `typescript`: ^5.6.3
- `nodemon`: ^3.1.9
- `ts-node`: ^10.9.2

### 🐛 已知問題

1. ~~Redis WRONGTYPE 錯誤~~ (已在 v1.1.0 修復)
2. ~~API 回應格式不一致~~ (已在 v1.1.0 修復)
3. ~~路由順序問題~~ (已在 v1.1.0 修復)

---

## 版本命名規則

本專案遵循 [Semantic Versioning](https://semver.org/):

- **主版本號** (Major): 不向後兼容的 API 變更
- **次版本號** (Minor): 向後兼容的新功能
- **修訂號** (Patch): 向後兼容的問題修復

### 範例

- `1.0.0` → `2.0.0`: 重大破壞性變更
- `1.0.0` → `1.1.0`: 新增功能（向後兼容）
- `1.0.0` → `1.0.1`: 錯誤修復（向後兼容）

---

## 變更類型說明

- **Added** (新增): 新增功能
- **Changed** (改進): 現有功能的變更
- **Deprecated** (棄用): 即將移除的功能
- **Removed** (移除): 已移除的功能
- **Fixed** (修復): 錯誤修復
- **Security** (安全): 安全性更新

---

## 貢獻指南

如果您想為本專案做出貢獻，請：

1. 確保您的更改有對應的更新日誌條目
2. 遵循 [Keep a Changelog](https://keepachangelog.com/) 格式
3. 更新相關文檔
4. 提交 Pull Request

---

**最後更新**: 2025-10-21
**維護者**: Your Team
