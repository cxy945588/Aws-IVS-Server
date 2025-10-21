# AWS IVS Real-time API 文檔

## 📌 基本資訊

| 項目 | 內容 |
|------|------|
| **Base URL** | `http://localhost:3000` (開發環境) |
| **API 版本** | v1.0.0 |
| **認證方式** | API Key (Header: `x-api-key`) |
| **數據格式** | JSON |
| **字符編碼** | UTF-8 |

---

## 🔐 認證說明

所有 API 請求（除了健康檢查）都需要在 Header 中包含 API Key：

```http
x-api-key: your-api-key-here
Content-Type: application/json
```

---

## 📚 API 目錄

### 🏥 健康檢查
- [GET /health](#get-health) - 服務健康檢查

### 🎫 Token 管理
- [POST /api/token/publisher](#post-apitokenpublisher) - 生成主播 Token
- [POST /api/token/viewer](#post-apitokenviewer) - 生成觀眾 Token

### 🎬 Stage 管理
- [GET /api/stage/list](#get-apistagelist) - 獲取 Stage 列表
- [GET /api/stage/master/info](#get-apistagemasterinfo) - 獲取主 Stage 資訊
- [GET /api/stage/:stageArn](#get-apistagestagearn) - 獲取特定 Stage 資訊
- [POST /api/stage](#post-apistage) - 創建新 Stage
- [PUT /api/stage/:stageArn](#put-apistagestagearn) - 更新 Stage
- [DELETE /api/stage/:stageArn](#delete-apistagestagearn) - 刪除 Stage

### 👥 觀眾管理
- [POST /api/viewer/heartbeat](#post-apiviewerheartbeat) - 發送觀眾心跳
- [POST /api/viewer/leave](#post-apiviewerleave) - 觀眾離開
- [GET /api/viewer/list/:stageArn](#get-apiviewerliststagearn) - 獲取觀眾列表
- [GET /api/viewer/duration](#get-apiviewerduration) - 獲取觀看時長

### 📊 統計數據
- [GET /api/stats](#get-apistats) - 獲取總體統計
- [GET /api/stats/viewers](#get-apistatsviewers) - 獲取觀眾統計
- [GET /api/stats/stages](#get-apistatsstages) - 獲取 Stage 統計
- [GET /api/stats/stages/:stageArn](#get-apistatsstagesstagearn) - 獲取特定 Stage 統計
- [GET /api/stats/publisher](#get-apistatspublisher) - 獲取主播狀態

---

## 🏥 健康檢查

### GET /health

檢查服務健康狀態

#### 請求參數

無需參數，無需認證

#### 返回示例

```json
{
  "status": "ok",
  "timestamp": "2025-10-19T12:00:00.000Z",
  "uptime": 3600,
  "services": {
    "redis": "connected",
    "ivs": "ready"
  }
}
```

---

## 🎫 Token 管理

### POST /api/token/publisher

生成主播 Token，用於開始直播

#### 請求參數

**Body (JSON)**

| 參數 | 類型 | 必填 | 說明 |
|------|------|------|------|
| userId | string | ✅ | 主播唯一識別碼 |
| attributes | object | ❌ | 自定義屬性 |

#### 請求示例

```json
{
  "userId": "broadcaster-001",
  "attributes": {
    "displayName": "主播小明",
    "avatar": "https://example.com/avatar.jpg"
  }
}
```

#### 返回示例

```json
{
  "success": true,
  "data": {
    "token": "eyJhbGciOiJFUzM4NCIsInR5cCI6IkpXVCJ9...",
    "participantId": "bCa1KgOt0pTl",
    "stageArn": "arn:aws:ivs:ap-northeast-1:125371974421:stage/sWyAydfRqqF8",
    "userId": "broadcaster-broadcaster-001",
    "expiresAt": "2025-10-19T16:00:00.000Z",
    "capabilities": ["PUBLISH"],
    "attributes": {
      "displayName": "主播小明",
      "avatar": "https://example.com/avatar.jpg"
    }
  }
}
```

#### 錯誤碼

| HTTP 狀態碼 | 錯誤碼 | 說明 |
|------------|--------|------|
| 400 | VALIDATION_ERROR | 缺少必填參數 |
| 401 | UNAUTHORIZED | API Key 無效 |
| 500 | TOKEN_GENERATION_FAILED | Token 生成失敗 |

---

### POST /api/token/viewer

生成觀眾 Token，用於觀看直播

#### 請求參數

**Body (JSON)**

| 參數 | 類型 | 必填 | 說明 |
|------|------|------|------|
| userId | string | ✅ | 觀眾唯一識別碼 |
| attributes | object | ❌ | 自定義屬性 |

#### 請求示例

```json
{
  "userId": "viewer-001",
  "attributes": {
    "displayName": "觀眾小華",
    "level": "VIP"
  }
}
```

#### 返回示例

```json
{
  "success": true,
  "data": {
    "token": "eyJhbGciOiJFUzM4NCIsInR5cCI6IkpXVCJ9...",
    "participantId": "obT9s4Qwhy5u",
    "stageArn": "arn:aws:ivs:ap-northeast-1:125371974421:stage/sWyAydfRqqF8",
    "userId": "viewer-viewer-001",
    "expiresAt": "2025-10-19T13:00:00.000Z",
    "capabilities": ["SUBSCRIBE"],
    "currentViewers": 42,
    "attributes": {
      "displayName": "觀眾小華",
      "level": "VIP"
    }
  }
}
```

#### 錯誤碼

| HTTP 狀態碼 | 錯誤碼 | 說明 |
|------------|--------|------|
| 400 | VALIDATION_ERROR | 缺少必填參數 |
| 401 | UNAUTHORIZED | API Key 無效 |
| 503 | STAGE_FULL | 所有 Stage 已滿 |
| 503 | STAGE_LIMIT_REACHED | 達到 Stage 數量上限 |
| 500 | TOKEN_GENERATION_FAILED | Token 生成失敗 |

---

## 🎬 Stage 管理

### GET /api/stage/list

獲取所有 Stage 列表

#### 請求參數

**Query Parameters**

| 參數 | 類型 | 必填 | 說明 |
|------|------|------|------|
| maxResults | number | ❌ | 最大返回數量 (預設: 50) |

#### 返回示例

```json
{
  "success": true,
  "data": {
    "stages": [
      {
        "stageArn": "arn:aws:ivs:ap-northeast-1:125371974421:stage/sWyAydfRqqF8",
        "name": "master-stage",
        "viewerCount": 45,
        "autoScaled": false,
        "createdAt": "2025-10-19T08:00:00.000Z",
        "tags": {
          "Environment": "production"
        }
      },
      {
        "stageArn": "arn:aws:ivs:ap-northeast-1:125371974421:stage/wTlyfr2LLy5v",
        "name": "auto-stage-1760868709374",
        "viewerCount": 10,
        "autoScaled": true,
        "createdAt": "2025-10-19T10:11:49.000Z",
        "tags": {
          "AutoScaled": "true"
        }
      }
    ],
    "totalStages": 2,
    "nextToken": null,
    "timestamp": "2025-10-19T12:00:00.000Z"
  }
}
```

---

### GET /api/stage/master/info

獲取主 Stage 資訊

#### 請求參數

無

#### 返回示例

```json
{
  "success": true,
  "data": {
    "stage": {
      "arn": "arn:aws:ivs:ap-northeast-1:125371974421:stage/sWyAydfRqqF8",
      "name": "master-stage",
      "activeSessionId": "st-abc123...",
      "tags": {
        "Environment": "production"
      }
    },
    "viewerCount": 45,
    "isMaster": true,
    "timestamp": "2025-10-19T12:00:00.000Z"
  }
}
```

---

### GET /api/stage/:stageArn

獲取特定 Stage 的詳細資訊

#### 請求參數

**Path Parameters**

| 參數 | 類型 | 必填 | 說明 |
|------|------|------|------|
| stageArn | string | ✅ | Stage ARN (URL encoded) |

#### 返回示例

```json
{
  "success": true,
  "data": {
    "stage": {
      "arn": "arn:aws:ivs:ap-northeast-1:125371974421:stage/sWyAydfRqqF8",
      "name": "master-stage",
      "activeSessionId": "st-abc123...",
      "tags": {}
    },
    "viewerCount": 45,
    "timestamp": "2025-10-19T12:00:00.000Z"
  }
}
```

#### 錯誤碼

| HTTP 狀態碼 | 錯誤碼 | 說明 |
|------------|--------|------|
| 404 | NOT_FOUND | Stage 不存在 |

---

### POST /api/stage

創建新的 Stage

#### 請求參數

**Body (JSON)**

| 參數 | 類型 | 必填 | 說明 |
|------|------|------|------|
| name | string | ✅ | Stage 名稱 |
| tags | object | ❌ | 標籤 |

#### 請求示例

```json
{
  "name": "my-custom-stage",
  "tags": {
    "Purpose": "special-event",
    "Owner": "marketing-team"
  }
}
```

#### 返回示例

```json
{
  "success": true,
  "data": {
    "stage": {
      "arn": "arn:aws:ivs:ap-northeast-1:125371974421:stage/newStageId",
      "name": "my-custom-stage",
      "tags": {
        "Purpose": "special-event",
        "Owner": "marketing-team",
        "Environment": "development",
        "ManagedBy": "api-server"
      }
    },
    "timestamp": "2025-10-19T12:00:00.000Z"
  }
}
```

#### 錯誤碼

| HTTP 狀態碼 | 錯誤碼 | 說明 |
|------------|--------|------|
| 400 | VALIDATION_ERROR | 缺少必填參數 |
| 503 | STAGE_LIMIT_REACHED | 達到 Stage 數量上限 (20) |

---

### PUT /api/stage/:stageArn

更新 Stage 配置

#### 請求參數

**Path Parameters**

| 參數 | 類型 | 必填 | 說明 |
|------|------|------|------|
| stageArn | string | ✅ | Stage ARN (URL encoded) |

**Body (JSON)**

| 參數 | 類型 | 必填 | 說明 |
|------|------|------|------|
| name | string | ✅ | 新的 Stage 名稱 |

#### 請求示例

```json
{
  "name": "updated-stage-name"
}
```

#### 返回示例

```json
{
  "success": true,
  "data": {
    "stage": {
      "arn": "arn:aws:ivs:ap-northeast-1:125371974421:stage/sWyAydfRqqF8",
      "name": "updated-stage-name"
    },
    "timestamp": "2025-10-19T12:00:00.000Z"
  }
}
```

#### 錯誤碼

| HTTP 狀態碼 | 錯誤碼 | 說明 |
|------------|--------|------|
| 404 | NOT_FOUND | Stage 不存在 |

---

### DELETE /api/stage/:stageArn

刪除 Stage

#### 請求參數

**Path Parameters**

| 參數 | 類型 | 必填 | 說明 |
|------|------|------|------|
| stageArn | string | ✅ | Stage ARN (URL encoded) |

#### 返回示例

```json
{
  "success": true,
  "message": "Stage 已刪除",
  "timestamp": "2025-10-19T12:00:00.000Z"
}
```

#### 錯誤碼

| HTTP 狀態碼 | 錯誤碼 | 說明 |
|------------|--------|------|
| 400 | VALIDATION_ERROR | Stage 中仍有觀眾 |
| 403 | FORBIDDEN | 無法刪除主 Stage |
| 404 | NOT_FOUND | Stage 不存在 |

---

## 👥 觀眾管理

### POST /api/viewer/heartbeat

發送觀眾心跳，保持連線狀態

#### 請求參數

**Body (JSON)**

| 參數 | 類型 | 必填 | 說明 |
|------|------|------|------|
| userId | string | ✅ | 觀眾 ID |
| stageArn | string | ✅ | Stage ARN |

#### 請求示例

```json
{
  "userId": "viewer-001",
  "stageArn": "arn:aws:ivs:ap-northeast-1:125371974421:stage/sWyAydfRqqF8"
}
```

#### 返回示例

```json
{
  "success": true,
  "data": {
    "userId": "viewer-001",
    "stageArn": "arn:aws:ivs:ap-northeast-1:125371974421:stage/sWyAydfRqqF8",
    "lastHeartbeat": "2025-10-19T12:00:00.000Z"
  }
}
```

#### 說明

- 觀眾需要每 30 秒發送一次心跳
- 超過 60 秒未發送心跳將被自動移除
- 心跳失敗不影響觀看，但會影響統計準確性

---

### POST /api/viewer/leave

觀眾離開直播間

#### 請求參數

**Body (JSON)**

| 參數 | 類型 | 必填 | 說明 |
|------|------|------|------|
| userId | string | ✅ | 觀眾 ID |
| stageArn | string | ✅ | Stage ARN |

#### 請求示例

```json
{
  "userId": "viewer-001",
  "stageArn": "arn:aws:ivs:ap-northeast-1:125371974421:stage/sWyAydfRqqF8"
}
```

#### 返回示例

```json
{
  "success": true,
  "data": {
    "userId": "viewer-001",
    "stageArn": "arn:aws:ivs:ap-northeast-1:125371974421:stage/sWyAydfRqqF8",
    "watchDuration": 1850,
    "watchDurationFormatted": "30分 50秒"
  }
}
```

---

### GET /api/viewer/list/:stageArn

獲取特定 Stage 的觀眾列表

#### 請求參數

**Path Parameters**

| 參數 | 類型 | 必填 | 說明 |
|------|------|------|------|
| stageArn | string | ✅ | Stage ARN (URL encoded) |

#### 返回示例

```json
{
  "success": true,
  "data": {
    "stageArn": "arn:aws:ivs:ap-northeast-1:125371974421:stage/sWyAydfRqqF8",
    "viewers": [
      {
        "userId": "viewer-001",
        "participantId": "obT9s4Qwhy5u",
        "joinedAt": "2025-10-19T11:30:00.000Z",
        "lastHeartbeat": "2025-10-19T11:59:45.000Z"
      },
      {
        "userId": "viewer-002",
        "participantId": "Ek1rlumBEnKp",
        "joinedAt": "2025-10-19T11:31:00.000Z",
        "lastHeartbeat": "2025-10-19T11:59:50.000Z"
      }
    ],
    "totalViewers": 2,
    "timestamp": "2025-10-19T12:00:00.000Z"
  }
}
```

---

### GET /api/viewer/duration

獲取觀眾的觀看時長

#### 請求參數

**Query Parameters**

| 參數 | 類型 | 必填 | 說明 |
|------|------|------|------|
| userId | string | ✅ | 觀眾 ID |
| stageArn | string | ✅ | Stage ARN |

#### 請求示例

```
GET /api/viewer/duration?userId=viewer-001&stageArn=arn:aws:ivs:ap-northeast-1:125371974421:stage/sWyAydfRqqF8
```

#### 返回示例

```json
{
  "success": true,
  "data": {
    "userId": "viewer-001",
    "stageArn": "arn:aws:ivs:ap-northeast-1:125371974421:stage/sWyAydfRqqF8",
    "watchDuration": 1850,
    "watchDurationFormatted": "30分 50秒"
  }
}
```

---

## 📊 統計數據

### GET /api/stats

獲取總體統計資訊

#### 請求參數

無

#### 返回示例

```json
{
  "success": true,
  "data": {
    "totalViewers": 55,
    "activeStages": 2,
    "isPublisherLive": true,
    "stages": [
      {
        "stageArn": "arn:aws:ivs:ap-northeast-1:125371974421:stage/sWyAydfRqqF8",
        "stageName": "master-stage",
        "viewerCount": 45,
        "autoScaled": false,
        "createdAt": "2025-10-19T08:00:00.000Z"
      },
      {
        "stageArn": "arn:aws:ivs:ap-northeast-1:125371974421:stage/wTlyfr2LLy5v",
        "stageName": "auto-stage-1760868709374",
        "viewerCount": 10,
        "autoScaled": true,
        "createdAt": "2025-10-19T10:11:49.000Z"
      }
    ],
    "timestamp": "2025-10-19T12:00:00.000Z"
  }
}
```

#### 說明

- `totalViewers`: 即時計算的總觀眾數（所有 Stage 的觀眾數總和）
- `activeStages`: 從 AWS IVS API 獲取的 Stage 總數
- `isPublisherLive`: 主播是否在線
- `stages`: 所有 Stage 的詳細資訊

---

### GET /api/stats/viewers

獲取觀眾統計

#### 請求參數

無

#### 返回示例

```json
{
  "success": true,
  "data": {
    "totalViewers": 55,
    "calculatedFrom": "real-time sum",
    "timestamp": "2025-10-19T12:00:00.000Z"
  }
}
```

---

### GET /api/stats/stages

獲取 Stage 統計

#### 請求參數

無

#### 返回示例

```json
{
  "success": true,
  "data": {
    "totalStages": 2,
    "stages": [
      {
        "stageArn": "arn:aws:ivs:ap-northeast-1:125371974421:stage/sWyAydfRqqF8",
        "stageName": "master-stage",
        "viewerCount": 45,
        "autoScaled": false,
        "createdAt": "2025-10-19T08:00:00.000Z",
        "tags": {}
      },
      {
        "stageArn": "arn:aws:ivs:ap-northeast-1:125371974421:stage/wTlyfr2LLy5v",
        "stageName": "auto-stage-1760868709374",
        "viewerCount": 10,
        "autoScaled": true,
        "createdAt": "2025-10-19T10:11:49.000Z",
        "tags": {
          "AutoScaled": "true"
        }
      }
    ],
    "timestamp": "2025-10-19T12:00:00.000Z"
  }
}
```

---

### GET /api/stats/stages/:stageArn

獲取特定 Stage 的統計

#### 請求參數

**Path Parameters**

| 參數 | 類型 | 必填 | 說明 |
|------|------|------|------|
| stageArn | string | ✅ | Stage ARN (URL encoded) |

#### 返回示例

```json
{
  "success": true,
  "data": {
    "stageArn": "arn:aws:ivs:ap-northeast-1:125371974421:stage/sWyAydfRqqF8",
    "viewerCount": 45,
    "info": {
      "name": "master-stage",
      "autoScaled": false,
      "createdAt": "2025-10-19T08:00:00.000Z"
    },
    "timestamp": "2025-10-19T12:00:00.000Z"
  }
}
```

---

### GET /api/stats/publisher

獲取主播狀態

#### 請求參數

無

#### 返回示例

```json
{
  "success": true,
  "data": {
    "isLive": true,
    "timestamp": "2025-10-19T12:00:00.000Z"
  }
}
```

---

## 📋 通用錯誤碼

所有 API 可能返回的通用錯誤：

| HTTP 狀態碼 | 錯誤碼 | 說明 |
|------------|--------|------|
| 400 | VALIDATION_ERROR | 請求參數驗證失敗 |
| 401 | UNAUTHORIZED | 未提供 API Key 或 API Key 無效 |
| 403 | FORBIDDEN | 無權限執行此操作 |
| 404 | NOT_FOUND | 資源不存在 |
| 429 | TOO_MANY_REQUESTS | 請求頻率過高 |
| 500 | INTERNAL_ERROR | 伺服器內部錯誤 |
| 503 | SERVICE_UNAVAILABLE | 服務暫時不可用 |

### 錯誤返回格式

```json
{
  "error": "VALIDATION_ERROR",
  "message": "缺少必填參數: userId",
  "details": "userId is required"
}
```

---

## 🔄 系統限制

| 項目 | 限制值 | 說明 |
|------|--------|------|
| **最大 Stage 數量** | 20 | 包含主 Stage 和自動擴展的 Stage |
| **每個 Stage 最大觀眾數** | 50 | AWS IVS Real-time 限制 |
| **Token 有效期 (主播)** | 4 小時 | 14400 秒 |
| **Token 有效期 (觀眾)** | 1 小時 | 3600 秒 |
| **心跳超時** | 60 秒 | 超過 60 秒未發送心跳將被移除 |
| **自動擴展觸發閾值** | 45 人 | Stage 達到 45 人時自動創建新 Stage |
| **自動縮減觸發閾值** | 5 人 | 自動創建的 Stage 少於 5 人時考慮刪除 |
| **API 請求頻率限制** | 100 次/分鐘 | 每個 API Key 的限制 |

---

## 📝 使用範例

### cURL 範例

#### 生成主播 Token

```bash
curl -X POST http://localhost:3000/api/token/publisher \
  -H "x-api-key: your-api-key" \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "broadcaster-001",
    "attributes": {
      "displayName": "主播小明"
    }
  }'
```

#### 生成觀眾 Token

```bash
curl -X POST http://localhost:3000/api/token/viewer \
  -H "x-api-key: your-api-key" \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "viewer-001",
    "attributes": {
      "displayName": "觀眾小華"
    }
  }'
```

#### 獲取統計資訊

```bash
curl -X GET http://localhost:3000/api/stats \
  -H "x-api-key: your-api-key"
```

---

### JavaScript 範例

#### 使用 Fetch API

```javascript
// 生成觀眾 Token
async function getViewerToken(userId) {
  const response = await fetch('http://localhost:3000/api/token/viewer', {
    method: 'POST',
    headers: {
      'x-api-key': 'your-api-key',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      userId: userId,
      attributes: {
        displayName: '觀眾' + userId
      }
    })
  });
  
  const data = await response.json();
  
  if (data.success) {
    console.log('Token:', data.data.token);
    console.log('Stage:', data.data.stageArn);
    console.log('當前觀眾數:', data.data.currentViewers);
    return data.data;
  } else {
    console.error('錯誤:', data.message);
    throw new Error(data.message);
  }
}

// 發送心跳
async function sendHeartbeat(userId, stageArn) {
  const response = await fetch('http://localhost:3000/api/viewer/heartbeat', {
    method: 'POST',
    headers: {
      'x-api-key': 'your-api-key',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      userId: userId,
      stageArn: stageArn
    })
  });
  
  return await response.json();
}

// 定時發送心跳
setInterval(() => {
  sendHeartbeat('viewer-001', 'arn:aws:ivs:...')
    .then(result => console.log('心跳成功'))
    .catch(err => console.error('心跳失敗:', err));
}, 30000); // 每 30 秒
```

---

### Python 範例

```python
import requests
import time
import threading

API_URL = 'http://localhost:3000'
API_KEY = 'your-api-key'

class IVSClient:
    def __init__(self, api_url, api_key):
        self.api_url = api_url
        self.headers = {
            'x-api-key': api_key,
            'Content-Type': 'application/json'
        }
        self.heartbeat_thread = None
        self.stop_heartbeat = False
    
    def get_viewer_token(self, user_id, attributes=None):
        """獲取觀眾 Token"""
        response = requests.post(
            f'{self.api_url}/api/token/viewer',
            headers=self.headers,
            json={
                'userId': user_id,
                'attributes': attributes or {}
            }
        )
        return response.json()
    
    def send_heartbeat(self, user_id, stage_arn):
        """發送心跳"""
        response = requests.post(
            f'{self.api_url}/api/viewer/heartbeat',
            headers=self.headers,
            json={
                'userId': user_id,
                'stageArn': stage_arn
            }
        )
        return response.json()
    
    def start_heartbeat_service(self, user_id, stage_arn, interval=30):
        """啟動心跳服務"""
        def heartbeat_loop():
            while not self.stop_heartbeat:
                try:
                    result = self.send_heartbeat(user_id, stage_arn)
                    print(f'心跳成功: {result}')
                except Exception as e:
                    print(f'心跳失敗: {e}')
                time.sleep(interval)
        
        self.heartbeat_thread = threading.Thread(target=heartbeat_loop)
        self.heartbeat_thread.start()
    
    def stop_heartbeat_service(self):
        """停止心跳服務"""
        self.stop_heartbeat = True
        if self.heartbeat_thread:
            self.heartbeat_thread.join()
    
    def get_stats(self):
        """獲取統計資訊"""
        response = requests.get(
            f'{self.api_url}/api/stats',
            headers=self.headers
        )
        return response.json()

# 使用範例
if __name__ == '__main__':
    client = IVSClient(API_URL, API_KEY)
    
    # 獲取 Token
    token_data = client.get_viewer_token(
        'viewer-001',
        {'displayName': '測試觀眾'}
    )
    
    if token_data['success']:
        stage_arn = token_data['data']['stageArn']
        
        # 啟動心跳
        client.start_heartbeat_service('viewer-001', stage_arn)
        
        # 模擬觀看 5 分鐘
        time.sleep(300)
        
        # 停止心跳
        client.stop_heartbeat_service()
```

---

## 🔧 WebSocket 連接

### 連接 URL

```
ws://localhost:3000/ws
```

### 訂閱統計更新

連接成功後發送：

```json
{
  "type": "subscribe",
  "channel": "stats"
}
```

### 接收統計更新 (每 5 秒)

```json
{
  "type": "stats_update",
  "data": {
    "viewerCount": 55,
    "activeStages": 2,
    "timestamp": "2025-10-19T12:00:00.000Z"
  }
}
```

---

## 📌 注意事項

### 觀眾心跳機制

1. 觀眾獲取 Token 後自動加入觀眾列表
2. 必須每 30 秒發送一次心跳
3. 超過 60 秒未發送心跳將被自動移除
4. 心跳失敗不影響實際觀看體驗，但會影響統計準確性

### Stage 自動擴展

1. 當 Stage 觀眾數達到 45 人時自動創建新 Stage
2. 新觀眾會自動分配到觀眾數最少的 Stage
3. 自動創建的 Stage 會標記 `autoScaled: true`
4. 當自動創建的 Stage 觀眾數少於 5 人且存在超過 5 分鐘時會被刪除

### 數據一致性

1. 統計 API 的 `totalViewers` 是即時計算的（所有 Stage 觀眾數總和）
2. 不依賴可能過期的快取值
3. 每次請求都從 AWS IVS API 獲取最新的 Stage 列表
4. 觀眾數從 Redis 讀取（毫秒級更新）

---

## 📞 技術支援

如有問題，請聯繫：

- Email: support@example.com
- 文檔: https://docs.example.com
- GitHub: https://github.com/example/ivs-api

---

**文檔版本:** v1.0.0  
**最後更新:** 2025-10-19  
**API 版本:** v1.0.0
