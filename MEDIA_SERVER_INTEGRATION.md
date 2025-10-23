# Media Server 整合完整實現說明

## 📚 概覽

本文檔說明 Media Server 與 API Server 的完整整合方案，包括架構設計、實現細節和部署指南。

## 🏗️ 整體架構

### 數據流

```
┌──────────────────────────────────────────────────────────────┐
│                         整體架構                              │
└──────────────────────────────────────────────────────────────┘

主播 (OBS/Web)
    │
    ↓ WHIP (Token-Media)
┌───────────────────────────────────────┐
│       Media Server (EC2)              │
│                                       │
│  ┌─────────────────────────────────┐ │
│  │  1. 接收主播推流 (WHIP)         │ │
│  │  2. 監聽 API Server (WebSocket) │ │
│  │  3. 自動連接所有 Stage          │ │
│  │  4. 轉發流到多個 Stage          │ │
│  └─────────────────────────────────┘ │
│                                       │
│  服務:                                │
│  • APIClientService                   │
│  • StageManager                       │
│  • WHIPClient                         │
└───────┬───────────────────────────────┘
        │
        ↓ WHIP (Token-0, Token-1, Token-N)
    ┌───┴───┬───────┬───────┐
    ↓       ↓       ↓       ↓
Stage-0  Stage-1  Stage-2  Stage-N
    │       │       │       │
    ↓       ↓       ↓       ↓
觀眾0-50 觀眾51-100 觀眾101-150 ...
```

### 通信流程

```
┌─────────────┐          ┌─────────────┐          ┌─────────────┐
│   主播端    │          │ Media Server│          │  API Server │
└──────┬──────┘          └──────┬──────┘          └──────┬──────┘
       │                        │                        │
       │   1. WHIP 推流         │                        │
       │──────────────────────>│                        │
       │                        │                        │
       │                        │   2. 註冊 Media Server │
       │                        │──────────────────────>│
       │                        │                        │
       │                        │   3. 建立 WebSocket    │
       │                        │<──────────────────────│
       │                        │                        │
       │                        │   4. 獲取 Stage 列表   │
       │                        │──────────────────────>│
       │                        │<──────────────────────│
       │                        │                        │
       │                        │   5. 為每個 Stage 獲取 Token
       │                        │──────────────────────>│
       │                        │<──────────────────────│
       │                        │                        │
       │                        │   6. 連接所有 Stage (WHIP)
       │                        │──────────────────────> IVS Stages
       │                        │                        │
       │                        │   7. 定期心跳          │
       │                        │──────────────────────>│
       │                        │                        │
       │                        │   8. Stage 創建通知    │
       │                        │<══════════════════════│ (WebSocket)
       │                        │                        │
       │                        │   9. 自動連接新 Stage  │
       │                        │──────────────────────> New Stage
```

## 🔧 API Server 改動

### 1. 新增 `/api/media` 路由

**文件**: `api-server/src/routes/media.ts`

**端點**:

| 方法 | 路徑 | 功能 |
|------|------|------|
| POST | `/api/media/register` | Media Server 註冊 |
| GET | `/api/media/stages` | 獲取所有活躍 Stage |
| POST | `/api/media/heartbeat` | Media Server 心跳 |
| POST | `/api/media/token` | 獲取 Stage Token |

**示例**:

```typescript
// 註冊 Media Server
POST /api/media/register
{
  "serverId": "media-server-01",
  "ipAddress": "192.168.1.100",
  "port": 3001
}

// 獲取 Stage 列表
GET /api/media/stages
Response:
{
  "stages": [
    {
      "stageArn": "arn:aws:ivs:...",
      "viewerCount": 45,
      "stageId": "abc123def456"
    }
  ]
}
```

### 2. 修改 `index.ts` - WebSocket 支持

**改動**:

1. **識別 Media Server 連接**:
```typescript
const clientType = url.searchParams.get('type');
if (clientType === 'media-server') {
  (ws as any).isMediaServer = true;
}
```

2. **添加通知函數**:
```typescript
export function notifyMediaServerStageCreated(stageArn: string): void {
  wss.clients.forEach((client) => {
    if ((client as any).isMediaServer && client.readyState === 1) {
      client.send(JSON.stringify({
        type: 'stage_created',
        data: { stageArn, timestamp: new Date().toISOString() },
      }));
    }
  });
}

export function notifyMediaServerStageDeleted(stageArn: string): void {
  // 類似實現
}
```

### 3. 修改 `StageAutoScalingService.ts`

**改動**: 在創建/刪除 Stage 時調用通知函數

```typescript
// scaleUp() 方法中
if (response.stage?.arn) {
  // ... 原有邏輯 ...

  // 通知 Media Server
  try {
    notifyMediaServerStageCreated(response.stage.arn);
  } catch (error: any) {
    logger.error('通知 Media Server 失敗', { error: error.message });
  }
}

// scaleDown() 方法中
await this.client.send(command);

// 通知 Media Server
try {
  notifyMediaServerStageDeleted(stageArn);
} catch (error: any) {
  logger.error('通知 Media Server 失敗', { error: error.message });
}
```

### 4. 環境變數

**新增** (`.env.example`):

```env
# Media Server 整合
ENABLE_MEDIA_SERVER=true
MEDIA_SERVER_URL=http://localhost:3001
MEDIA_SERVER_SECRET=your_media_server_secret_key_here
```

## 📦 Media Server 實現

### 項目結構

```
media-server/
├── src/
│   ├── index.ts                      # 主程式入口
│   ├── services/
│   │   ├── APIClientService.ts       # API Server 通信
│   │   ├── StageManager.ts           # Stage 連接管理
│   │   └── WHIPClient.ts             # WHIP 客戶端
│   ├── routes/
│   │   └── health.ts                 # 健康檢查
│   ├── utils/
│   │   ├── logger.ts                 # 日誌工具
│   │   └── constants.ts              # 常數定義
│   └── types/
│       └── index.ts                  # 類型定義
├── package.json
├── tsconfig.json
├── .env.example
└── README.md
```

### 核心服務

#### 1. APIClientService

**職責**:
- 向 API Server 註冊
- 獲取 Stage 列表
- 獲取 Stage Token
- WebSocket 監聽 Stage 變化
- 定期心跳

**關鍵方法**:
```typescript
async register(): Promise<void>
async getActiveStages(): Promise<StageInfo[]>
async getStageToken(stageArn: string): Promise<string | null>
connectWebSocket(): void
onMessage(type: string, handler: (data: any) => void): void
```

#### 2. StageManager

**職責**:
- 管理所有 Stage 連接
- 監聽 Stage 創建/刪除事件
- 自動連接/斷開 Stage
- 管理流轉發

**關鍵方法**:
```typescript
async initialize(): Promise<void>
async syncAllStages(): Promise<void>
async connectToStage(stageArn: string): Promise<void>
async disconnectFromStage(stageArn: string): Promise<void>
async onPublisherConnected(): Promise<void>
async onPublisherDisconnected(): Promise<void>
```

#### 3. WHIPClient

**職責**:
- 使用 WHIP 協議連接到 IVS Stage
- 發送媒體流
- 管理 WebRTC 連接

**注意**: 當前實現是框架，需要完整的 WebRTC 實現

**關鍵方法**:
```typescript
async connect(): Promise<void>
async startPublishing(): Promise<void>
async stopPublishing(): Promise<void>
async disconnect(): Promise<void>
```

### 啟動流程

```typescript
// 1. 初始化 API Client 並註冊
const apiClient = APIClientService.getInstance();
await apiClient.register();

// 2. 初始化 Stage Manager
const stageManager = StageManager.getInstance();
await stageManager.initialize();

// 3. 連接 WebSocket
apiClient.connectWebSocket();

// 4. 同步所有 Stage
await stageManager.syncAllStages();

// 5. 啟動定期同步
stageManager.startPeriodicSync(60000);
```

## 🚀 部署指南

### 1. 部署 API Server

```bash
cd api-server

# 安裝依賴
npm install

# 配置環境變數
cp .env.example .env
# 編輯 .env，設置:
# - MEDIA_SERVER_SECRET
# - ENABLE_MEDIA_SERVER=true

# 啟動
npm run dev  # 開發環境
npm start    # 生產環境
```

### 2. 部署 Media Server

```bash
cd media-server

# 安裝依賴
npm install

# 配置環境變數
cp .env.example .env
# 編輯 .env，設置:
# - API_SERVER_URL
# - API_SECRET_KEY
# - MEDIA_SERVER_SECRET (與 API Server 相同)
# - AWS 憑證

# 啟動
npm run dev  # 開發環境
npm start    # 生產環境
```

### 3. 驗證部署

#### 檢查 API Server

```bash
# 健康檢查
curl http://localhost:3000/health

# 檢查 Media 路由
curl -H "x-api-key: YOUR_KEY" \
     http://localhost:3000/api/media/stages
```

#### 檢查 Media Server

```bash
# 健康檢查
curl http://localhost:3001/health

# 查看統計
curl http://localhost:3001/
```

#### 檢查 WebSocket 連接

在 API Server 日誌中查看:
```
📡 Media Server WebSocket 已連接
```

在 Media Server 日誌中查看:
```
✅ WebSocket 已連接到 API Server
✅ Stage 同步完成
```

## 🔍 測試流程

### 1. 基本連接測試

```bash
# Terminal 1: 啟動 API Server
cd api-server
npm run dev

# Terminal 2: 啟動 Media Server
cd media-server
npm run dev

# 檢查日誌，應該看到:
# - Media Server 註冊成功
# - WebSocket 連接成功
# - Stage 同步完成
```

### 2. Stage 自動連接測試

```bash
# 創建新 Stage（通過 API Server 的自動擴展）
# 或手動觸發

# 觀察 Media Server 日誌:
# 📥 收到通知: Stage 已創建
# 🔗 正在連接 Stage
# ✅ Stage 連接成功
```

### 3. Stage 自動斷開測試

```bash
# 刪除 Stage（通過 API Server 的自動縮減）

# 觀察 Media Server 日誌:
# 📥 收到通知: Stage 已刪除
# 🔌 正在斷開 Stage
# ✅ Stage 已斷開
```

## ⚠️ 重要提示

### WHIP 實現

**當前狀態**: WHIPClient 是簡化的框架實現

**生產環境需要**:

1. **完整的 WebRTC 實現**:
   - 使用 `wrtc` 或 `node-webrtc` 庫
   - 實現 PeerConnection
   - 處理 SDP offer/answer
   - ICE candidate 交換

2. **WHIP 協議實現**:
   ```typescript
   // 示例流程
   async connect(): Promise<void> {
     // 1. 創建 PeerConnection
     const pc = new RTCPeerConnection();

     // 2. 創建 SDP Offer
     const offer = await pc.createOffer();
     await pc.setLocalDescription(offer);

     // 3. 發送 WHIP 請求
     const response = await axios.post(
       `${this.endpoint}/${this.token}`,
       offer.sdp,
       { headers: { 'Content-Type': 'application/sdp' } }
     );

     // 4. 處理 SDP Answer
     await pc.setRemoteDescription({
       type: 'answer',
       sdp: response.data,
     });

     // 5. 處理 ICE
     pc.onicecandidate = (event) => {
       if (event.candidate) {
         // 發送 ICE candidate
       }
     };
   }
   ```

3. **媒體流處理**:
   - 接收主播媒體流
   - 轉發到所有 Stage
   - 處理音視頻同步

### 擴展性建議

1. **多實例部署**:
   - 部署多個 Media Server 實例
   - 使用負載均衡
   - 每個實例管理部分 Stage

2. **區域部署**:
   - 在不同 AWS 區域部署
   - 降低延遲
   - 提高可用性

3. **監控告警**:
   - 集成 CloudWatch
   - 監控連接狀態
   - 監控流質量

## 📊 監控指標

### 關鍵指標

- **連接狀態**: 已連接的 Stage 數量
- **主播狀態**: 主播是否在線
- **流轉發**: 是否正常轉發到所有 Stage
- **心跳狀態**: 與 API Server 的心跳是否正常
- **錯誤率**: 連接錯誤、轉發錯誤

### 日誌監控

```bash
# 關鍵日誌示例
📡 已向 API Server 註冊
✅ WebSocket 已連接到 API Server
🔄 同步 5 個 Stage
🔗 正在連接 Stage
✅ Stage 連接成功
📹 主播已連接
📤 開始向 Stage 推流
```

## 🎯 後續優化

1. **完整的 WHIP 實現**: 實現完整的 WebRTC 和 WHIP 協議
2. **性能優化**: 優化流轉發性能
3. **錯誤恢復**: 實現斷線重連機制
4. **負載均衡**: 實現多 Media Server 負載均衡
5. **監控完善**: 集成完整的監控和告警系統

## 📝 相關文檔

- [Media Server README](./media-server/README.md)
- [API Server 文檔](./api-server/README.md)
- [AWS IVS Real-time 文檔](https://docs.aws.amazon.com/ivs/latest/RealTimeAPIReference/)
- [WHIP 協議規範](https://datatracker.ietf.org/doc/html/draft-ietf-wish-whip)

## 🤝 支持

如有問題，請提交 Issue 或聯繫開發團隊。
