# 更新日誌 (Changelog)

本文檔記錄所有重要的版本變更。

格式基於 [Keep a Changelog](https://keepachangelog.com/zh-TW/1.0.0/)，
版本號遵循 [Semantic Versioning](https://semver.org/lang/zh-TW/)。

---

## [Unreleased]

### 計劃中
- [ ] 添加單元測試覆蓋
- [ ] 實現 DynamoDB 持久化
- [ ] 完善 WebSocket 認證機制
- [ ] 添加 Swagger/OpenAPI 文檔
- [ ] 實現分散式交易日誌

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
