# AWS IVS Real-time API 完整文檔

> 📌 **最後更新**: 2025-10-21
> 📌 **API 版本**: v1.1.0
> 📌 **文檔版本**: 2.0

---

## 📖 目錄

- [基本資訊](#基本資訊)
- [認證方式](#認證方式)
- [通用規範](#通用規範)
- [錯誤碼說明](#錯誤碼說明)
- [API 接口列表](#api-接口列表)
  - [健康檢查](#1-健康檢查)
  - [Token 管理](#2-token-管理)
  - [Stage 管理](#3-stage-管理)
  - [觀眾管理](#4-觀眾管理)
  - [統計數據](#5-統計數據)
- [數據模型](#數據模型)
- [WebSocket 接口](#websocket-接口)

---

## 基本資訊

| 項目 | 內容 |
|------|------|
| **協議** | HTTPS / HTTP |
| **Base URL (生產)** | `https://api.your-domain.com` |
| **Base URL (開發)** | `http://localhost:3000` |
| **數據格式** | JSON |
| **字符編碼** | UTF-8 |
| **時區** | UTC |
| **日期格式** | ISO 8601 (`2025-10-21T10:30:00.000Z`) |

---

## 認證方式

### API Key 認證

所有 API 請求（除了 `/health`）都需要在 HTTP Header 中包含 API Key：

```http
x-api-key: your-api-key-here
Content-Type: application/json
```

**開發環境跳過認證**：
- 設置環境變數 `SKIP_AUTH=true` 可跳過 API Key 驗證（僅限開發）

**獲取 API Key**：
- 請聯繫系統管理員獲取 API Key
- API Key 存儲在環境變數 `API_SECRET_KEY` 中

---

## 通用規範

### 統一回應格式

#### ✅ 成功回應

所有成功的 API 請求都返回以下格式：

```json
{
  "success": true,
  "data": {
    // ... 實際數據
  },
  "timestamp": "2025-10-21T10:30:00.000Z",
  "message": "操作成功"  // 可選
}
```

**欄位說明**：
- `success` (boolean): 固定為 `true`
- `data` (object): 實際返回的數據
- `timestamp` (string): 服務器時間戳 (ISO 8601)
- `message` (string): 可選的成功訊息

#### ❌ 錯誤回應

所有失敗的 API 請求都返回以下格式：

```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "錯誤描述",
    "details": {
      // 詳細錯誤資訊（僅開發環境）
    }
  },
  "timestamp": "2025-10-21T10:30:00.000Z"
}
```

**欄位說明**：
- `success` (boolean): 固定為 `false`
- `error.code` (string): 錯誤代碼（見下方錯誤碼表）
- `error.message` (string): 人類可讀的錯誤描述
- `error.details` (object): 詳細錯誤資訊（僅在開發環境顯示）
- `timestamp` (string): 服務器時間戳

---

## 錯誤碼說明

### HTTP 狀態碼

| 狀態碼 | 說明 |
|--------|------|
| **200** | 成功 |
| **201** | 創建成功 |
| **400** | 請求參數錯誤 |
| **401** | 未授權（缺少或無效的 API Key） |
| **403** | 禁止訪問 |
| **404** | 資源不存在 |
| **429** | 請求過於頻繁（已達到速率限制） |
| **500** | 內部服務器錯誤 |
| **503** | 服務不可用 |

### 業務錯誤碼

| 錯誤碼 | HTTP 狀態碼 | 說明 | 解決方案 |
|--------|------------|------|----------|
| `VALIDATION_ERROR` | 400 | 請求參數驗證失敗 | 檢查 `details.missingFields` 查看缺少的欄位 |
| `UNAUTHORIZED` | 401 | 未授權 | 檢查 `x-api-key` header 是否正確 |
| `FORBIDDEN` | 403 | 禁止訪問 | 檢查權限設置 |
| `NOT_FOUND` | 404 | 資源不存在 | 檢查 ARN 或 ID 是否正確 |
| `STAGE_FULL` | 503 | Stage 已滿（達到 50 人上限） | 等待或嘗試其他 Stage |
| `STAGE_LIMIT_REACHED` | 503 | Stage 數量已達上限（20 個） | 刪除未使用的 Stage |
| `TOKEN_GENERATION_FAILED` | 500 | Token 生成失敗 | 檢查 AWS 憑證和 Stage ARN |
| `INTERNAL_ERROR` | 500 | 內部服務器錯誤 | 聯繫技術支持 |

### 驗證錯誤示例

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "缺少必要參數",
    "details": {
      "missingFields": ["userId", "stageArn"]
    }
  },
  "timestamp": "2025-10-21T10:30:00.000Z"
}
```

---

## API 接口列表

## 1. 健康檢查

### 1.1 服務健康檢查

**接口地址**: `GET /health`
**認證**: 無需認證
**描述**: 檢查服務健康狀態，包含 Redis 連接狀態和系統資源使用情況

#### 請求參數

無

#### 請求示例

```bash
curl -X GET http://localhost:3000/health
```

#### 返回參數

| 參數名 | 類型 | 說明 |
|--------|------|------|
| success | boolean | 固定為 true |
| data | object | 健康檢查數據 |
| data.status | string | 服務狀態：`healthy` |
| data.uptime | number | 服務運行時間（秒） |
| data.environment | string | 運行環境：`development` / `production` |
| data.version | string | API 版本號 |
| data.services | object | 依賴服務狀態 |
| data.services.redis | string | Redis 連接狀態：`connected` / `disconnected` |
| data.services.aws | object | AWS 配置狀態 |
| data.services.aws.region | string | AWS 區域 |
| data.services.aws.stageConfigured | boolean | 是否配置了主 Stage |
| data.memory | object | 內存使用情況 |
| data.memory.used | number | 已使用內存（MB） |
| data.memory.total | number | 總內存（MB） |
| data.memory.unit | string | 單位：`MB` |
| timestamp | string | 時間戳 |

#### 成功返回示例

```json
{
  "success": true,
  "data": {
    "status": "healthy",
    "uptime": 3600,
    "environment": "production",
    "version": "1.0.0",
    "services": {
      "redis": "connected",
      "aws": {
        "region": "ap-northeast-1",
        "stageConfigured": true
      }
    },
    "memory": {
      "used": 128,
      "total": 256,
      "unit": "MB"
    }
  },
  "timestamp": "2025-10-21T10:30:00.000Z"
}
```

#### 錯誤返回示例

```json
{
  "success": false,
  "error": {
    "code": "SERVICE_UNAVAILABLE",
    "message": "服務不可用"
  },
  "timestamp": "2025-10-21T10:30:00.000Z"
}
```

---

## 2. Token 管理

### 2.1 生成主播 Token

**接口地址**: `POST /api/token/publisher`
**認證**: 需要 API Key
**描述**: 生成主播 Token，用於主播開始直播（PUBLISH 權限）

#### 請求參數

| 參數名 | 類型 | 必填 | 說明 |
|--------|------|------|------|
| userId | string | ✅ | 主播唯一識別碼 |

#### 請求示例

```bash
curl -X POST http://localhost:3000/api/token/publisher \
  -H "x-api-key: your-api-key" \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "publisher-123"
  }'
```

```json
{
  "userId": "publisher-123"
}
```

#### 返回參數

| 參數名 | 類型 | 說明 |
|--------|------|------|
| success | boolean | 固定為 true |
| data | object | Token 數據 |
| data.token | string | AWS IVS Token（用於加入 Stage） |
| data.participantId | string | 參與者 ID |
| data.userId | string | 用戶 ID |
| data.stageArn | string | Stage ARN |
| data.capabilities | array | 權限列表：`["PUBLISH"]` |
| data.expiresAt | string | Token 過期時間（ISO 8601） |
| data.whipEndpoint | string | WHIP 推流端點 URL |
| data.expiresIn | number | Token 有效期（秒），預設 14400 (4 小時) |
| data.instructions | object | 推流配置指南 |
| data.instructions.obs | object | OBS 推流配置 |
| data.instructions.web | object | Web SDK 配置 |
| timestamp | string | 時間戳 |

#### 成功返回示例

```json
{
  "success": true,
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "participantId": "participant-abc123",
    "userId": "publisher-123",
    "stageArn": "arn:aws:ivs:ap-northeast-1:123456789012:stage/aBcDeFgHiJkL",
    "capabilities": ["PUBLISH"],
    "expiresAt": "2025-10-21T14:30:00.000Z",
    "whipEndpoint": "https://global.whip.live-video.net",
    "expiresIn": 14400,
    "instructions": {
      "obs": {
        "service": "WHIP",
        "server": "https://global.whip.live-video.net",
        "bearerToken": "<使用上方的 token>",
        "settings": {
          "resolution": "1280x720",
          "bitrate": "2500 kbps",
          "keyframeInterval": "1s",
          "cpuPreset": "ultrafast",
          "tune": "zerolatency"
        }
      },
      "web": {
        "sdk": "amazon-ivs-web-broadcast",
        "method": "Stage.join(token)"
      }
    }
  },
  "timestamp": "2025-10-21T10:30:00.000Z"
}
```

#### 錯誤返回示例

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "缺少 userId",
    "details": {
      "missingFields": ["userId"]
    }
  },
  "timestamp": "2025-10-21T10:30:00.000Z"
}
```

---

### 2.2 生成觀眾 Token

**接口地址**: `POST /api/token/viewer`
**認證**: 需要 API Key
**描述**: 生成觀眾 Token，自動分配到觀眾數最少的 Stage（SUBSCRIBE 權限）

#### 請求參數

| 參數名 | 類型 | 必填 | 說明 |
|--------|------|------|------|
| userId | string | ✅ | 觀眾唯一識別碼 |
| stageArn | string | ❌ | 指定 Stage ARN（不指定則自動分配） |

#### 請求示例

```bash
curl -X POST http://localhost:3000/api/token/viewer \
  -H "x-api-key: your-api-key" \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "viewer-456"
  }'
```

```json
{
  "userId": "viewer-456"
}
```

#### 返回參數

| 參數名 | 類型 | 說明 |
|--------|------|------|
| success | boolean | 固定為 true |
| data | object | Token 數據 |
| data.token | string | AWS IVS Token |
| data.participantId | string | 參與者 ID |
| data.userId | string | 用戶 ID |
| data.stageArn | string | 分配的 Stage ARN |
| data.capabilities | array | 權限列表：`["SUBSCRIBE"]` |
| data.expiresAt | string | Token 過期時間（ISO 8601） |
| data.expiresIn | number | Token 有效期（秒），預設 3600 (1 小時) |
| data.currentViewers | number | 當前 Stage 的觀眾數 |
| timestamp | string | 時間戳 |

#### 成功返回示例

```json
{
  "success": true,
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "participantId": "participant-xyz789",
    "userId": "viewer-456",
    "stageArn": "arn:aws:ivs:ap-northeast-1:123456789012:stage/aBcDeFgHiJkL",
    "capabilities": ["SUBSCRIBE"],
    "expiresAt": "2025-10-21T11:30:00.000Z",
    "expiresIn": 3600,
    "currentViewers": 23
  },
  "timestamp": "2025-10-21T10:30:00.000Z"
}
```

#### 錯誤返回示例

```json
{
  "success": false,
  "error": {
    "code": "NOT_FOUND",
    "message": "主播直播不存在"
  },
  "timestamp": "2025-10-21T10:30:00.000Z"
}
```

```json
{
  "success": false,
  "error": {
    "code": "STAGE_FULL",
    "message": "Stage 已滿，請稍後再試"
  },
  "timestamp": "2025-10-21T10:30:00.000Z"
}
```

---

### 2.3 生成 Media Server Token

**接口地址**: `POST /api/token/mediaserver`
**認證**: 需要 API Key + 內部密鑰
**描述**: 生成媒體服務器 Token（PUBLISH + SUBSCRIBE 權限），僅供內部使用

#### 請求參數

| 參數名 | 類型 | 必填 | 說明 |
|--------|------|------|------|
| serverId | string | ✅ | 服務器唯一識別碼 |
| stageArn | string | ✅ | Stage ARN |

#### 請求 Headers

```http
x-api-key: your-api-key
x-internal-secret: your-internal-secret
Content-Type: application/json
```

#### 請求示例

```bash
curl -X POST http://localhost:3000/api/token/mediaserver \
  -H "x-api-key: your-api-key" \
  -H "x-internal-secret: your-internal-secret" \
  -H "Content-Type: application/json" \
  -d '{
    "serverId": "media-server-01",
    "stageArn": "arn:aws:ivs:ap-northeast-1:123456789012:stage/aBcDeFgHiJkL"
  }'
```

#### 成功返回示例

```json
{
  "success": true,
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "participantId": "participant-media-01",
    "stageArn": "arn:aws:ivs:ap-northeast-1:123456789012:stage/aBcDeFgHiJkL",
    "capabilities": ["PUBLISH", "SUBSCRIBE"],
    "expiresAt": "2025-10-21T14:30:00.000Z"
  },
  "timestamp": "2025-10-21T10:30:00.000Z"
}
```

---

## 3. Stage 管理

### 3.1 獲取 Stage 列表

**接口地址**: `GET /api/stage/list`
**認證**: 需要 API Key
**描述**: 獲取所有 Stage 的列表及其觀眾數

#### 請求參數

無

#### 請求示例

```bash
curl -X GET http://localhost:3000/api/stage/list \
  -H "x-api-key: your-api-key"
```

#### 返回參數

| 參數名 | 類型 | 說明 |
|--------|------|------|
| success | boolean | 固定為 true |
| data | object | Stage 列表數據 |
| data.stages | array | Stage 數組 |
| data.stages[].stageArn | string | Stage ARN |
| data.stages[].name | string | Stage 名稱 |
| data.stages[].viewerCount | number | 當前觀眾數 |
| data.stages[].autoScaled | boolean | 是否為自動擴展創建 |
| data.stages[].createdAt | string | 創建時間 |
| data.stages[].tags | object | Stage 標籤 |
| data.totalStages | number | Stage 總數 |
| data.nextToken | string | 分頁 Token（如果有更多結果） |
| timestamp | string | 時間戳 |

#### 成功返回示例

```json
{
  "success": true,
  "data": {
    "stages": [
      {
        "stageArn": "arn:aws:ivs:ap-northeast-1:123456789012:stage/aBcDeFgHiJkL",
        "name": "master-stage",
        "viewerCount": 45,
        "autoScaled": false,
        "createdAt": "2025-10-21T08:00:00.000Z",
        "tags": {
          "Environment": "production",
          "ManagedBy": "api-server"
        }
      },
      {
        "stageArn": "arn:aws:ivs:ap-northeast-1:123456789012:stage/XyZaBcDeFgHi",
        "name": "autoscale-stage-1",
        "viewerCount": 23,
        "autoScaled": true,
        "createdAt": "2025-10-21T09:15:00.000Z",
        "tags": {
          "Environment": "production",
          "ManagedBy": "auto-scaler"
        }
      }
    ],
    "totalStages": 2,
    "nextToken": null
  },
  "timestamp": "2025-10-21T10:30:00.000Z"
}
```

---

### 3.2 獲取主 Stage 資訊

**接口地址**: `GET /api/stage/master/info`
**認證**: 需要 API Key
**描述**: 獲取主 Stage 的詳細資訊

#### 請求示例

```bash
curl -X GET http://localhost:3000/api/stage/master/info \
  -H "x-api-key: your-api-key"
```

#### 成功返回示例

```json
{
  "success": true,
  "data": {
    "stage": {
      "arn": "arn:aws:ivs:ap-northeast-1:123456789012:stage/aBcDeFgHiJkL",
      "name": "master-stage",
      "activeSessionId": "session-abc123",
      "tags": {
        "Environment": "production"
      }
    },
    "viewerCount": 45,
    "isMasterStage": true
  },
  "timestamp": "2025-10-21T10:30:00.000Z"
}
```

---

### 3.3 創建新 Stage

**接口地址**: `POST /api/stage`
**認證**: 需要 API Key
**描述**: 創建一個新的 Stage

#### 請求參數

| 參數名 | 類型 | 必填 | 說明 |
|--------|------|------|------|
| name | string | ✅ | Stage 名稱 |
| tags | object | ❌ | 自定義標籤 |

#### 請求示例

```bash
curl -X POST http://localhost:3000/api/stage \
  -H "x-api-key: your-api-key" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "custom-stage-01",
    "tags": {
      "Purpose": "Testing"
    }
  }'
```

#### 成功返回示例

```json
{
  "success": true,
  "data": {
    "stage": {
      "arn": "arn:aws:ivs:ap-northeast-1:123456789012:stage/NewStageArn",
      "name": "custom-stage-01",
      "tags": {
        "Environment": "development",
        "ManagedBy": "api-server",
        "Purpose": "Testing"
      }
    }
  },
  "timestamp": "2025-10-21T10:30:00.000Z"
}
```

#### 錯誤返回示例

```json
{
  "success": false,
  "error": {
    "code": "STAGE_LIMIT_REACHED",
    "message": "已達到 Stage 數量上限 (20)"
  },
  "timestamp": "2025-10-21T10:30:00.000Z"
}
```

---

### 3.4 刪除 Stage

**接口地址**: `DELETE /api/stage/:stageArn`
**認證**: 需要 API Key
**描述**: 刪除指定的 Stage（主 Stage 無法刪除）

#### 路徑參數

| 參數名 | 類型 | 必填 | 說明 |
|--------|------|------|------|
| stageArn | string | ✅ | Stage ARN |

#### 請求示例

```bash
curl -X DELETE "http://localhost:3000/api/stage/arn:aws:ivs:ap-northeast-1:123456789012:stage/StageToDelete" \
  -H "x-api-key: your-api-key"
```

#### 成功返回示例

```json
{
  "success": true,
  "data": {
    "stageArn": "arn:aws:ivs:ap-northeast-1:123456789012:stage/StageToDelete",
    "deleted": true
  },
  "timestamp": "2025-10-21T10:30:00.000Z",
  "message": "Stage 已刪除"
}
```

#### 錯誤返回示例

```json
{
  "success": false,
  "error": {
    "code": "FORBIDDEN",
    "message": "無法刪除主 Stage"
  },
  "timestamp": "2025-10-21T10:30:00.000Z"
}
```

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Stage 中仍有觀眾，無法刪除",
    "details": {
      "viewerCount": 15
    }
  },
  "timestamp": "2025-10-21T10:30:00.000Z"
}
```

---

## 4. 觀眾管理

### 4.1 發送觀眾心跳

**接口地址**: `POST /api/viewer/heartbeat`
**認證**: 需要 API Key
**描述**: 觀眾定期發送心跳以維持在線狀態（建議每 30 秒發送一次）

#### 請求參數

| 參數名 | 類型 | 必填 | 說明 |
|--------|------|------|------|
| userId | string | ✅ | 觀眾唯一識別碼 |
| stageArn | string | ✅ | Stage ARN |

#### 請求示例

```bash
curl -X POST http://localhost:3000/api/viewer/heartbeat \
  -H "x-api-key: your-api-key" \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "viewer-456",
    "stageArn": "arn:aws:ivs:ap-northeast-1:123456789012:stage/aBcDeFgHiJkL"
  }'
```

#### 成功返回示例

```json
{
  "success": true,
  "data": {
    "userId": "viewer-456",
    "stageArn": "arn:aws:ivs:ap-northeast-1:123456789012:stage/aBcDeFgHiJkL",
    "heartbeatUpdated": true
  },
  "timestamp": "2025-10-21T10:30:00.000Z",
  "message": "心跳更新成功"
}
```

---

### 4.2 觀眾離開

**接口地址**: `POST /api/viewer/leave`
**認證**: 需要 API Key
**描述**: 觀眾主動離開直播

#### 請求參數

| 參數名 | 類型 | 必填 | 說明 |
|--------|------|------|------|
| userId | string | ✅ | 觀眾唯一識別碼 |
| stageArn | string | ✅ | Stage ARN |

#### 請求示例

```bash
curl -X POST http://localhost:3000/api/viewer/leave \
  -H "x-api-key: your-api-key" \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "viewer-456",
    "stageArn": "arn:aws:ivs:ap-northeast-1:123456789012:stage/aBcDeFgHiJkL"
  }'
```

#### 成功返回示例

```json
{
  "success": true,
  "data": {
    "userId": "viewer-456",
    "stageArn": "arn:aws:ivs:ap-northeast-1:123456789012:stage/aBcDeFgHiJkL",
    "viewerLeft": true
  },
  "timestamp": "2025-10-21T10:30:00.000Z",
  "message": "觀眾離開記錄成功"
}
```

---

### 4.3 獲取觀眾列表

**接口地址**: `GET /api/viewer/list/:stageArn`
**認證**: 需要 API Key
**描述**: 獲取指定 Stage 的活躍觀眾列表

#### 路徑參數

| 參數名 | 類型 | 必填 | 說明 |
|--------|------|------|------|
| stageArn | string | ✅ | Stage ARN |

#### 請求示例

```bash
curl -X GET "http://localhost:3000/api/viewer/list/arn:aws:ivs:ap-northeast-1:123456789012:stage/aBcDeFgHiJkL" \
  -H "x-api-key: your-api-key"
```

#### 成功返回示例

```json
{
  "success": true,
  "data": {
    "stageArn": "arn:aws:ivs:ap-northeast-1:123456789012:stage/aBcDeFgHiJkL",
    "totalViewers": 45,
    "activeViewers": 43,
    "viewers": [
      {
        "userId": "viewer-001",
        "participantId": "participant-abc",
        "joinedAt": "2025-10-21T09:00:00.000Z",
        "lastHeartbeat": "2025-10-21T10:29:30.000Z"
      },
      {
        "userId": "viewer-002",
        "participantId": "participant-def",
        "joinedAt": "2025-10-21T09:15:00.000Z",
        "lastHeartbeat": "2025-10-21T10:29:45.000Z"
      }
    ]
  },
  "timestamp": "2025-10-21T10:30:00.000Z"
}
```

---

### 4.4 獲取觀看時長

**接口地址**: `GET /api/viewer/duration`
**認證**: 需要 API Key
**描述**: 獲取指定觀眾的觀看時長

#### 查詢參數

| 參數名 | 類型 | 必填 | 說明 |
|--------|------|------|------|
| userId | string | ✅ | 觀眾唯一識別碼 |
| stageArn | string | ✅ | Stage ARN |

#### 請求示例

```bash
curl -X GET "http://localhost:3000/api/viewer/duration?userId=viewer-456&stageArn=arn:aws:ivs:ap-northeast-1:123456789012:stage/aBcDeFgHiJkL" \
  -H "x-api-key: your-api-key"
```

#### 成功返回示例

```json
{
  "success": true,
  "data": {
    "userId": "viewer-456",
    "stageArn": "arn:aws:ivs:ap-northeast-1:123456789012:stage/aBcDeFgHiJkL",
    "watchDurationSeconds": 1845,
    "watchDurationFormatted": "30分 45秒"
  },
  "timestamp": "2025-10-21T10:30:00.000Z"
}
```

---

## 5. 統計數據

### 5.1 獲取總體統計

**接口地址**: `GET /api/stats`
**認證**: 需要 API Key
**描述**: 獲取系統總體統計資訊，包含所有 Stage 的觀眾數和狀態

#### 請求示例

```bash
curl -X GET http://localhost:3000/api/stats \
  -H "x-api-key: your-api-key"
```

#### 返回參數

| 參數名 | 類型 | 說明 |
|--------|------|------|
| success | boolean | 固定為 true |
| data | object | 統計數據 |
| data.totalViewers | number | 總觀眾數（所有 Stage 總和） |
| data.activeStages | number | 活躍 Stage 數量 |
| data.isPublisherLive | boolean | 主播是否在線 |
| data.stages | array | 所有 Stage 的詳細資訊 |
| timestamp | string | 時間戳 |

#### 成功返回示例

```json
{
  "success": true,
  "data": {
    "totalViewers": 68,
    "activeStages": 2,
    "isPublisherLive": true,
    "stages": [
      {
        "stageArn": "arn:aws:ivs:ap-northeast-1:123456789012:stage/aBcDeFgHiJkL",
        "stageName": "master-stage",
        "viewerCount": 45,
        "autoScaled": false,
        "createdAt": "2025-10-21T08:00:00.000Z"
      },
      {
        "stageArn": "arn:aws:ivs:ap-northeast-1:123456789012:stage/XyZaBcDeFgHi",
        "stageName": "autoscale-stage-1",
        "viewerCount": 23,
        "autoScaled": true,
        "createdAt": "2025-10-21T09:15:00.000Z"
      }
    ]
  },
  "timestamp": "2025-10-21T10:30:00.000Z"
}
```

---

### 5.2 獲取觀眾統計

**接口地址**: `GET /api/stats/viewers`
**認證**: 需要 API Key
**描述**: 獲取觀眾數統計（即時計算）

#### 請求示例

```bash
curl -X GET http://localhost:3000/api/stats/viewers \
  -H "x-api-key: your-api-key"
```

#### 成功返回示例

```json
{
  "success": true,
  "data": {
    "totalViewers": 68,
    "calculatedFrom": "real-time sum"
  },
  "timestamp": "2025-10-21T10:30:00.000Z"
}
```

---

### 5.3 獲取主播狀態

**接口地址**: `GET /api/stats/publisher`
**認證**: 需要 API Key
**描述**: 獲取主播當前狀態

#### 請求示例

```bash
curl -X GET http://localhost:3000/api/stats/publisher \
  -H "x-api-key: your-api-key"
```

#### 成功返回示例

```json
{
  "success": true,
  "data": {
    "isPublisherLive": true
  },
  "timestamp": "2025-10-21T10:30:00.000Z"
}
```

---

## 數據模型

### Stage 對象

```typescript
interface Stage {
  arn: string;                    // Stage ARN
  name: string;                   // Stage 名稱
  activeSessionId?: string;       // 活躍會話 ID
  tags?: Record<string, string>;  // 標籤
}
```

### Stage 資訊對象

```typescript
interface StageInfo {
  name: string;          // Stage 名稱
  createdAt: string;     // 創建時間（ISO 8601）
  autoScaled: boolean;   // 是否為自動擴展創建
  managedBy: string;     // 管理者：'api-server' | 'auto-scaler'
}
```

### 觀眾對象

```typescript
interface Viewer {
  userId: string;          // 用戶 ID
  participantId: string;   // 參與者 ID
  joinedAt: string;        // 加入時間（ISO 8601）
  lastHeartbeat: string;   // 最後心跳時間（ISO 8601）
}
```

---

## WebSocket 接口

### WebSocket 連接

**接口地址**: `ws://localhost:3000/ws`
**認證**: 無需認證
**描述**: WebSocket 連接用於接收即時統計更新

#### 連接示例

```javascript
const ws = new WebSocket('ws://localhost:3000/ws');

ws.onopen = () => {
  console.log('WebSocket 連接已建立');

  // 訂閱統計更新
  ws.send(JSON.stringify({
    action: 'subscribe',
    channel: 'stats'
  }));
};

ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  console.log('收到統計更新:', data);
};

ws.onclose = () => {
  console.log('WebSocket 連接已關閉');
};
```

#### 訂閱統計更新

```json
{
  "action": "subscribe",
  "channel": "stats"
}
```

#### 取消訂閱

```json
{
  "action": "unsubscribe",
  "channel": "stats"
}
```

#### 服務器推送數據格式

每 5 秒推送一次：

```json
{
  "type": "stats_update",
  "data": {
    "totalViewers": 68,
    "activeStages": 2,
    "isPublisherLive": true,
    "timestamp": "2025-10-21T10:30:00.000Z"
  }
}
```

---

## 速率限制

### 限制規則

| 項目 | 限制 |
|------|------|
| **窗口時間** | 60 秒 |
| **最大請求數** | 100 請求/分鐘 |
| **超出限制** | 返回 `429 Too Many Requests` |

### 超出限制回應

```json
{
  "success": false,
  "error": {
    "code": "RATE_LIMIT_EXCEEDED",
    "message": "請求過於頻繁，請稍後再試"
  },
  "timestamp": "2025-10-21T10:30:00.000Z"
}
```

---

## 系統限制

### AWS IVS 限制

| 項目 | 限制 |
|------|------|
| **每個 Stage 最大參與者** | 50 人 |
| **最大 Stage 數量** | 20 個（系統配置） |
| **最大解析度** | 1280x720 |
| **最大幀率** | 30 FPS |
| **推薦碼率** | 2500 kbps |
| **最大碼率** | 8500 kbps |

### Token 有效期

| Token 類型 | 有效期 |
|-----------|-------|
| **主播 Token** | 4 小時（14400 秒） |
| **觀眾 Token** | 1 小時（3600 秒） |
| **Media Server Token** | 4 小時（14400 秒） |

### 自動擴展規則

| 條件 | 動作 |
|------|------|
| 觀眾數 ≥ 45 | 自動創建新 Stage |
| 觀眾數 ≤ 5 | 考慮刪除 Stage（非主 Stage） |
| 新 Stage 暖機期 | 5 分鐘 |
| 健康檢查間隔 | 30 秒 |

### 心跳機制

| 項目 | 值 |
|------|------|
| **推薦發送間隔** | 30 秒 |
| **心跳超時時間** | 60 秒 |
| **清理檢查間隔** | 30 秒 |
| **超時後動作** | 自動移除觀眾 |

---

## 最佳實踐

### 1. Token 管理

```javascript
// ✅ 正確：在 Token 過期前重新獲取
const tokenExpiresIn = 3600; // 1 小時
const refreshBeforeExpiry = 300; // 提前 5 分鐘刷新
setTimeout(() => {
  refreshToken();
}, (tokenExpiresIn - refreshBeforeExpiry) * 1000);
```

### 2. 心跳發送

```javascript
// ✅ 正確：定期發送心跳
setInterval(() => {
  fetch('/api/viewer/heartbeat', {
    method: 'POST',
    headers: {
      'x-api-key': 'your-api-key',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      userId: 'viewer-456',
      stageArn: 'arn:aws:ivs:...'
    })
  });
}, 30000); // 每 30 秒
```

### 3. 錯誤處理

```javascript
// ✅ 正確：檢查 success 欄位
const response = await fetch('/api/token/viewer', {
  method: 'POST',
  headers: {
    'x-api-key': 'your-api-key',
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({ userId: 'viewer-456' })
});

const data = await response.json();

if (!data.success) {
  // 處理錯誤
  console.error('錯誤:', data.error.code, data.error.message);

  if (data.error.code === 'STAGE_FULL') {
    // Stage 已滿，稍後重試
  }

  if (data.error.code === 'VALIDATION_ERROR') {
    // 檢查缺少的欄位
    console.log('缺少欄位:', data.error.details?.missingFields);
  }
}
```

### 4. WebSocket 重連

```javascript
// ✅ 正確：實現自動重連
let ws;
let reconnectInterval = 1000;

function connect() {
  ws = new WebSocket('ws://localhost:3000/ws');

  ws.onopen = () => {
    console.log('WebSocket 連接成功');
    reconnectInterval = 1000; // 重置重連間隔
  };

  ws.onclose = () => {
    console.log('WebSocket 連接關閉，將在', reconnectInterval / 1000, '秒後重連');
    setTimeout(connect, reconnectInterval);
    reconnectInterval = Math.min(reconnectInterval * 2, 30000); // 指數退避，最多 30 秒
  };
}

connect();
```

---

## 更新日誌

### v1.1.0 (2025-10-21)

**重大變更**:
- ✅ 統一所有 API 回應格式
- ✅ 標準化錯誤處理
- ✅ 添加詳細的驗證錯誤提示

**新增功能**:
- ✨ 新增 `responseHelper` 工具
- ✨ 改進 WebSocket 支持

**欄位變更**:
- `info` → `stageInfo`
- `isLive` → `isPublisherLive`
- `watchDuration` → `watchDurationSeconds`
- `isMaster` → `isMasterStage`

**詳細內容**: 參見 `API_FIXES_2025-10-21.md`

---

## 技術支持

- **GitHub Issues**: https://github.com/your-org/aws-ivs-server/issues
- **Email**: support@your-domain.com
- **文檔**: https://docs.your-domain.com

---

**文檔最後更新**: 2025-10-21
**API 版本**: v1.1.0
**維護者**: Your Team
