# 📺 AWS IVS 觀眾連線流程說明

> 給前端工程師的整合文檔

---

## 🎯 核心概念

### Token ≠ 連線
- **Token** = 入場券（24小時有效）
- **連線** = 實際進場看直播（前端控制）
- **AWS 計費** = 連線時長（每分鐘 $0.006）

### 省錢策略
**30 秒沒在看直播 → 自動斷線 → 停止計費**

---

## 📋 API 列表

### 1. 首次加入直播
```http
POST /api/token/viewer
Content-Type: application/json
x-api-key: your-api-key

{
  "userId": "viewer-123"
}
```

**回應：**
```json
{
  "success": true,
  "data": {
    "token": "eyJhbGc...",
    "participantId": "abc123",
    "userId": "viewer-123",
    "stageArn": "arn:aws:ivs:...",
    "expiresAt": "2025-10-19T18:00:00.000Z",
    "expiresIn": 86400
  }
}
```

**後端做了什麼：**
- ✅ 生成 Token（24小時有效）
- ✅ 觀眾計數 +1
- ✅ 記錄心跳（用於追蹤在線狀態）

---

### 2. 重新加入直播（Token 還有效時）
```http
POST /api/viewer/rejoin
Content-Type: application/json
x-api-key: your-api-key

{
  "userId": "viewer-123",
  "stageArn": "arn:aws:ivs:...",
  "participantId": "abc123"
}
```

**回應：**
```json
{
  "success": true,
  "message": "重新加入成功",
  "data": {
    "currentViewers": 45
  }
}
```

**後端做了什麼：**
- ✅ 觀眾計數 +1
- ✅ 重新記錄心跳

---

### 3. 心跳（每 30 秒）
```http
POST /api/viewer/heartbeat
Content-Type: application/json
x-api-key: your-api-key

{
  "userId": "viewer-123",
  "stageArn": "arn:aws:ivs:..."
}
```

**用途：** 告訴後端「我還在線」

---

### 4. 離開直播
```http
POST /api/viewer/leave
Content-Type: application/json
x-api-key: your-api-key

{
  "userId": "viewer-123",
  "stageArn": "arn:aws:ivs:..."
}
```

**後端做了什麼：**
- ✅ 觀眾計數 -1
- ✅ 刪除心跳記錄

---

## 🔄 完整流程圖

### 情境 1：首次進入直播

```
用戶進入直播頁面
    ↓
① 呼叫 POST /api/token/viewer
    ↓
② 獲得 Token 和 stageArn
    ↓
③ stage.join(token) ← AWS 開始計費
    ↓
④ 開始心跳（每 30 秒）
    ↓
⑤ 用戶觀看直播中...
```

---

### 情境 2：切換到其他頁面（省錢）

```
用戶切換到下注頁面
    ↓
① 停止心跳
    ↓
② 開始倒數計時（30 秒）
    ↓
③ 30 秒後自動斷線
   - stage.leave() ← AWS 停止計費
   - 呼叫 POST /api/viewer/leave
    ↓
④ Token 保留（不清空）
```

---

### 情境 3：重新回到直播頁面

```
用戶切回直播頁面
    ↓
① 檢查 Token 是否過期
    ↓
    ├─ Token 過期 → 重新走「首次進入」流程
    │
    └─ Token 有效 ↓
       ② 呼叫 POST /api/viewer/rejoin
          ↓
       ③ stage.join(舊Token) ← AWS 重新計費
          ↓
       ④ 重新開始心跳
```

---

## 💻 前端實作範例

### 核心類別

```javascript
import { Stage } from 'amazon-ivs-web-broadcast';

class StreamViewer {
  constructor(apiKey) {
    this.apiKey = apiKey;
    this.tokenData = null;
    this.stage = null;
    this.heartbeatInterval = null;
    this.disconnectTimer = null;
    
    // 30 秒後斷線
    this.DISCONNECT_DELAY = 30 * 1000;
  }

  // 首次進入直播
  async join(userId) {
    const response = await fetch('/api/token/viewer', {
      method: 'POST',
      headers: {
        'x-api-key': this.apiKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ userId })
    });

    const data = await response.json();
    this.tokenData = data.data;

    // 連線到 AWS
    await this.connect();
  }

  // 重新進入直播
  async rejoin() {
    // 檢查 Token 是否過期
    const expiry = new Date(this.tokenData.expiresAt);
    if (expiry < new Date()) {
      // Token 過期，重新加入
      await this.join(this.tokenData.userId);
      return;
    }

    // Token 有效，通知後端
    await fetch('/api/viewer/rejoin', {
      method: 'POST',
      headers: {
        'x-api-key': this.apiKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        userId: this.tokenData.userId,
        stageArn: this.tokenData.stageArn,
        participantId: this.tokenData.participantId
      })
    });

    // 重新連線
    await this.connect();
  }

  // 連線到 Stage
  async connect() {
    this.stage = new Stage(this.tokenData.token, {
      // 你的配置...
    });

    await this.stage.join();
    this.startHeartbeat();
  }

  // 斷線
  async disconnect() {
    this.stopHeartbeat();
    
    if (this.stage) {
      await this.stage.leave();
    }

    await fetch('/api/viewer/leave', {
      method: 'POST',
      headers: {
        'x-api-key': this.apiKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        userId: this.tokenData.userId,
        stageArn: this.tokenData.stageArn
      })
    });
  }

  // 開始心跳
  startHeartbeat() {
    this.heartbeatInterval = setInterval(async () => {
      await fetch('/api/viewer/heartbeat', {
        method: 'POST',
        headers: {
          'x-api-key': this.apiKey,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          userId: this.tokenData.userId,
          stageArn: this.tokenData.stageArn
        })
      });
    }, 30000);
  }

  // 停止心跳
  stopHeartbeat() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }
  }

  // 監聽頁面切換
  setupPageVisibility() {
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        // 頁面隱藏，30 秒後斷線
        this.disconnectTimer = setTimeout(() => {
          this.disconnect();
        }, this.DISCONNECT_DELAY);
      } else {
        // 頁面顯示，取消斷線
        clearTimeout(this.disconnectTimer);
        
        // 如果已斷線，重新連線
        if (!this.stage || !this.stage.connected) {
          this.rejoin();
        }
      }
    });
  }
}
```

---

### 使用方式

```javascript
// 1. 初始化
const viewer = new StreamViewer('your-api-key');

// 2. 首次進入直播
await viewer.join('viewer-123');

// 3. 監聽頁面切換（自動處理斷線/重連）
viewer.setupPageVisibility();

// 4. 手動離開
await viewer.disconnect();
```

---

## ⚠️ 重要提醒

### Token 管理
- ✅ Token 有效期 24 小時
- ✅ 保存在記憶體（不要存 localStorage）
- ✅ 切換頁面時不要清空 Token
- ✅ Token 過期後自動重新獲取
- ✅ **重要：記得保存 `participantId`**（用於重新加入和 debug）

### 斷線策略
- ✅ 30 秒沒在看 → 自動斷線（省錢）
- ✅ 使用 `visibilitychange` 偵測頁面切換
- ✅ 重新進入時檢查 Token 有效性

### 心跳機制
- ✅ 每 30 秒發送一次
- ✅ 連線期間才發送
- ✅ 斷線後停止發送

---

## 🐛 常見問題

### Q1: 為什麼切回來要等 1-2 秒？
**A:** 需要重新連線到 AWS，這是正常的網路延遲。

### Q2: Token 過期會怎樣？
**A:** 前端檢查到過期後，自動呼叫 `/api/token/viewer` 重新獲取。

### Q3: 如果網頁直接關閉怎麼辦？
**A:** 後端會在 60 秒後自動清理（透過心跳超時）。

### Q4: participantId 是什麼？
**A:** AWS IVS 分配給每個連線的唯一 ID。雖然目前系統沒用資料庫，但 participantId 在 log 中非常有用，可以用來：
- 串接 AWS Console 的技術資訊
- Debug 連線問題
- 分析連線品質

前端請務必保存 `participantId`，在重新加入時需要提供。

### Q5: 可以在背景播放嗎？
**A:** 可以，但要考慮費用。建議還是 30 秒後斷線。

---

## 📞 聯絡方式

如有問題請聯繫後端團隊 🚀