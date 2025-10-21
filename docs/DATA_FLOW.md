# 📊 `/api/stats` 數據來源分析

## 🔍 當你打 `http://localhost:3000/api/stats` 時

### **數據完全來自 Redis，不是 AWS IVS API**

---

## 📈 完整數據流程

```
客戶端請求
    ↓
GET /api/stats
    ↓
stats.ts (路由處理)
    ↓
RedisService.getInstance()
    ↓
┌─────────────────────────────────────────────────┐
│         從 Redis 讀取 4 個數據源               │
├─────────────────────────────────────────────────┤
│                                                  │
│  1️⃣ totalViewers                                │
│     └─ Redis Key: "ivs:prod:total_viewers"     │
│     └─ 類型: String (數字)                      │
│     └─ 方法: redis.getTotalViewerCount()       │
│                                                  │
│  2️⃣ activeStages (Stage ARN 列表)              │
│     └─ Redis Pattern: "ivs:prod:viewer:count:*"│
│     └─ 類型: Keys 搜尋                          │
│     └─ 方法: redis.getActiveStages()           │
│     └─ 範例: ["arn:aws:ivs:...:stage/sWyA..."]│
│                                                  │
│  3️⃣ isPublisherLive                             │
│     └─ Redis Key: "ivs:prod:publisher:status"  │
│     └─ 類型: String ("live" 或 "offline")      │
│     └─ 方法: redis.getPublisherStatus()        │
│                                                  │
│  4️⃣ 每個 Stage 的詳細資訊 (迴圈查詢)           │
│     ├─ viewerCount                              │
│     │  └─ Key: "ivs:prod:viewers:{stageArn}"   │
│     │  └─ 方法: redis.getStageViewerCount()    │
│     │                                            │
│     └─ stageInfo (metadata)                     │
│        └─ Key: "ivs:prod:stage:{stageArn}"     │
│        └─ 方法: redis.getStageInfo()           │
│        └─ 內容: {name, autoScaled, createdAt}  │
│                                                  │
└─────────────────────────────────────────────────┘
    ↓
組合成 JSON 回應
    ↓
返回給客戶端
```

---

## 🗂️ Redis 數據結構詳解

### **1. 總觀眾數計數器**
```redis
Key:   ivs:prod:total_viewers
Type:  String
Value: "60"
TTL:   無 (永久)
```
**更新時機:**
- 觀眾加入: `incrementViewerCount()` → INCR
- 觀眾離開: `decrementViewerCount()` → DECR

---

### **2. Stage 觀眾計數器**
```redis
Key:   ivs:prod:viewers:arn:aws:ivs:ap-northeast-1:125371974421:stage/sWyAydfRqqF8
Type:  String
Value: "50"
TTL:   無 (永久)
```
**更新時機:**
- 觀眾加入特定 Stage: INCR
- 觀眾離開特定 Stage: DECR

---

### **3. Stage 元數據**
```redis
Key:   ivs:prod:stage:arn:aws:ivs:ap-northeast-1:125371974421:stage/sWyAydfRqqF8
Type:  String (JSON)
Value: {
  "name": "auto-stage-1729356123456",
  "arn": "arn:aws:ivs:...",
  "autoScaled": true,
  "createdAt": "2025-10-19T10:53:15.000Z",
  "parentStage": "arn:aws:ivs:...:stage/sWyAydfRqqF8"
}
TTL:   3600 秒 (1 小時)
```
**更新時機:**
- Stage 創建時: `setStageInfo()`
- 自動擴展創建 Stage 時

---

### **4. 主播狀態**
```redis
Key:   ivs:prod:publisher:status
Type:  String
Value: "live" 或 "offline"
TTL:   86400 秒 (24 小時)
```
**更新時機:**
- 主播獲取 Token: 設為 "live"
- 手動設定離線: 設為 "offline"

---

### **5. 觀眾心跳追蹤** (用於自動清理)
```redis
Key:   ivs:prod:viewer:heartbeat:{stageArn}
Type:  Hash
Field: {userId}
Value: {timestamp, participantId, joinedAt}
TTL:   無 (由心跳服務管理)
```
**更新時機:**
- 觀眾加入: HSET
- 觀眾發送心跳: HSET (更新時間戳)
- 心跳超時: HDEL (自動清理)

---

## 📝 API 返回格式

```json
{
  "success": true,
  "data": {
    "totalViewers": 60,              // ← Redis: total_viewers
    "activeStages": 2,                // ← Redis: viewer:count:* 的數量
    "isPublisherLive": true,          // ← Redis: publisher:status
    "stages": [                       // ← 迴圈查詢每個 Stage
      {
        "stageId": "arn:aws:ivs:...:stage/sWyAydfRqqF8",
        "viewerCount": 50,            // ← Redis: viewers:{stageArn}
        "info": {                     // ← Redis: stage:{stageArn}
          "name": "master-stage",
          "autoScaled": false,
          "createdAt": "2025-10-19T08:00:00.000Z"
        }
      },
      {
        "stageId": "arn:aws:ivs:...:stage/PvHUfQkBRp1c",
        "viewerCount": 10,
        "info": {
          "name": "auto-stage-1729356123456",
          "autoScaled": true,
          "createdAt": "2025-10-19T10:53:15.000Z"
        }
      }
    ],
    "timestamp": "2025-10-19T11:30:00.000Z"
  }
}
```

---

## 🔄 數據寫入時機

### **何時寫入 Redis?**

#### 1️⃣ **觀眾加入 (POST /api/token/viewer)**
```typescript
// token.ts → generateViewerToken()
await redis.incrementViewerCount(stageArn);  // total_viewers++, viewers:{stageArn}++
await redis.hset(`viewer:heartbeat:${stageArn}`, userId, ...);  // 記錄心跳
```

#### 2️⃣ **觀眾離開 (POST /api/viewer/leave)**
```typescript
// viewer.ts → handleViewerLeave()
await redis.decrementViewerCount(stageArn);  // total_viewers--, viewers:{stageArn}--
await redis.hdel(`viewer:heartbeat:${stageArn}`, userId);  // 移除心跳
```

#### 3️⃣ **自動擴展創建 Stage**
```typescript
// StageAutoScalingService.ts → scaleUp()
await redis.setStageInfo(newStageArn, {
  name: newStageName,
  arn: newStageArn,
  autoScaled: true,
  createdAt: new Date().toISOString(),
});
```

#### 4️⃣ **主播獲取 Token (POST /api/token/publisher)**
```typescript
// token.ts → generatePublisherToken()
await redis.setPublisherStatus(true);  // 設為 "live"
```

#### 5️⃣ **心跳超時自動清理**
```typescript
// ViewerHeartbeatService.ts → cleanupInactiveViewers()
// 每 30 秒檢查一次，移除 60 秒無心跳的觀眾
await redis.decrementViewerCount(stageArn);
await redis.hdel(`viewer:heartbeat:${stageArn}`, userId);
```

---

## ⚠️ 重要注意事項

### **Redis vs AWS IVS API**

| 數據來源 | 用途 | 即時性 | 準確性 |
|---------|------|--------|--------|
| **Redis** | 統計、監控、自動擴展 | ⚡ 毫秒級 | ✅ 高 (如果心跳正常) |
| **AWS IVS API** | Stage 管理、Token 生成 | 🐌 秒級 | ✅✅ 最高 (官方數據) |

### **為什麼使用 Redis 而不是 AWS API?**

1. **效能**: AWS API 延遲 200-500ms，Redis 只要 1-5ms
2. **成本**: 避免頻繁呼叫 AWS API 產生費用
3. **即時性**: 統計需要即時更新，Redis 更適合
4. **可控性**: 可以自定義計數邏輯和清理策略

### **潛在問題:**

❌ **Redis 數據可能不準確的情況:**
1. 觀眾直接關閉瀏覽器 (沒發送離開請求)
2. 網路斷線 (心跳中斷)
3. API Server 重啟 (Redis 數據可能丟失)
4. Redis 連線中斷

✅ **解決方案:**
- 心跳機制 (60 秒無心跳自動清理)
- 定期與 AWS IVS API 同步 (未實作)
- Redis 持久化 (RDB/AOF)

---

## 🎯 總結

**`/api/stats` 的數據完全來自 Redis，流程如下:**

```
1. 讀取 Redis: total_viewers → 總觀眾數
2. 掃描 Redis Keys: viewer:count:* → 所有 Stage ARN
3. 讀取 Redis: publisher:status → 主播狀態
4. 迴圈讀取每個 Stage:
   - viewers:{stageArn} → 觀眾數
   - stage:{stageArn} → Stage 元數據
5. 組合成 JSON 返回
```

**優點:** 快速、低成本、即時性高  
**缺點:** 需要維護 Redis 數據準確性

---

## 🔗 相關檔案

- `src/routes/stats.ts` - Stats API 路由
- `src/services/RedisService.ts` - Redis 操作
- `src/utils/constants.ts` - Redis Key 定義
- `src/services/ViewerHeartbeatService.ts` - 觀眾心跳管理
