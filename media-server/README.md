# AWS IVS Media Server

Media Server 用於接收主播推流並自動轉發到多個 IVS Stage，實現大規模觀眾觀看。

## 🎯 功能

- **自動 Stage 管理**: 自動連接和斷開 Stage
- **實時同步**: 通過 WebSocket 實時接收 Stage 變化通知
- **流轉發**: 將主播流轉發到所有活躍 Stage
- **健康監控**: 提供健康檢查端點
- **優雅關閉**: 支持優雅關閉和資源清理

## 📋 系統需求

- Node.js 20.x
- TypeScript 5.x
- 可訪問的 API Server
- 有效的 AWS 憑證

## 🚀 快速開始

### 1. 安裝依賴

```bash
cd media-server
npm install
```

### 2. 配置環境變數

複製 `.env.example` 到 `.env` 並配置：

```bash
cp .env.example .env
```

**必須配置的環境變數**:

```env
# API Server 配置
API_SERVER_URL=http://localhost:3000
API_SECRET_KEY=your_api_secret_key_here
MEDIA_SERVER_SECRET=your_media_server_secret_key_here

# Server 配置
SERVER_ID=media-server-01
SERVER_IP=localhost
PORT=3001

# AWS 配置
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=your_access_key
AWS_SECRET_ACCESS_KEY=your_secret_key
```

### 3. 啟動開發服務器

```bash
npm run dev
```

### 4. 生產環境部署

```bash
# 構建
npm run build

# 啟動
npm start
```

## 📡 架構說明

### 整體流程

```
主播 (OBS/Web)
    │
    ↓ WHIP
┌───────────────────────────┐
│   Media Server (EC2)      │
│                           │
│  1. 接收主播流            │
│  2. 監聽 API Server       │
│  3. 自動連接所有 Stage    │
│  4. 轉發流到多個 Stage    │
└───────┬───────────────────┘
        │
        ↓ WHIP (多個連接)
    ┌───┴───┬───────┬───────┐
    ↓       ↓       ↓       ↓
Stage-0  Stage-1  Stage-2  Stage-N
    │       │       │       │
    ↓       ↓       ↓       ↓
觀眾0-50 觀眾51-100 觀眾101-150 ...
```

### 核心組件

#### 1. APIClientService

負責與 API Server 通信：

- **註冊**: 向 API Server 註冊 Media Server
- **獲取 Stage 列表**: 定期同步所有活躍 Stage
- **獲取 Token**: 為每個 Stage 獲取連接 Token
- **WebSocket**: 監聽 Stage 創建/刪除事件
- **心跳**: 定期發送心跳保持活躍

```typescript
const apiClient = APIClientService.getInstance();
await apiClient.register();
apiClient.connectWebSocket();
```

#### 2. StageManager

管理所有 Stage 連接：

- **同步 Stage**: 連接到所有活躍 Stage
- **自動連接**: 監聽新 Stage 並自動連接
- **自動斷開**: 監聽刪除事件並斷開連接
- **流轉發**: 管理主播流到所有 Stage 的轉發

```typescript
const stageManager = StageManager.getInstance();
await stageManager.initialize();
await stageManager.syncAllStages();
```

#### 3. WHIPClient

使用 WHIP 協議連接到 IVS Stage：

- **連接**: 建立 WebRTC 連接
- **推流**: 發送媒體流到 Stage
- **斷開**: 優雅關閉連接

```typescript
const whipClient = new WHIPClient({
  stageArn,
  token,
});
await whipClient.connect();
await whipClient.startPublishing();
```

## 🔄 與 API Server 集成

### WebSocket 通信

Media Server 通過 WebSocket 監聽 Stage 變化：

**連接 URL**:
```
ws://localhost:3000/ws?type=media-server
```

**消息格式**:

```json
{
  "type": "stage_created",
  "data": {
    "stageArn": "arn:aws:ivs:...",
    "timestamp": "2025-10-23T..."
  }
}
```

```json
{
  "type": "stage_deleted",
  "data": {
    "stageArn": "arn:aws:ivs:...",
    "timestamp": "2025-10-23T..."
  }
}
```

### API 端點

#### 1. 註冊 Media Server

```http
POST /api/media/register
Headers:
  x-api-key: {API_SECRET_KEY}
  x-media-auth: {MEDIA_SERVER_SECRET}
Body:
{
  "serverId": "media-server-01",
  "ipAddress": "192.168.1.100",
  "port": 3001
}
```

#### 2. 獲取 Stage 列表

```http
GET /api/media/stages
Headers:
  x-api-key: {API_SECRET_KEY}
```

#### 3. 獲取 Stage Token

```http
POST /api/media/token
Headers:
  x-api-key: {API_SECRET_KEY}
  x-media-auth: {MEDIA_SERVER_SECRET}
Body:
{
  "serverId": "media-server-01",
  "stageArn": "arn:aws:ivs:..."
}
```

#### 4. 發送心跳

```http
POST /api/media/heartbeat
Headers:
  x-api-key: {API_SECRET_KEY}
Body:
{
  "serverId": "media-server-01",
  "publisherActive": true,
  "connectedStages": 5
}
```

## 🏥 健康檢查

### 端點

- **GET /health**: 基本健康檢查
- **GET /health/ready**: 就緒檢查（K8s readiness probe）
- **GET /health/live**: 存活檢查（K8s liveness probe）

### 響應示例

```json
{
  "status": "healthy",
  "service": "Media Server",
  "version": "1.0.0",
  "serverId": "media-server-01",
  "uptime": 1234.56,
  "stats": {
    "publisherActive": true,
    "connectedStages": 5,
    "activeConnections": 5
  }
}
```

## 📊 監控和日誌

### 日誌級別

通過 `LOG_LEVEL` 環境變數配置：

- `debug`: 詳細調試信息
- `info`: 一般信息（推薦）
- `warn`: 警告信息
- `error`: 錯誤信息

### 關鍵日誌

```
📡 已向 API Server 註冊
✅ WebSocket 連接已建立
🔄 同步 5 個 Stage
🔗 正在連接 Stage
✅ Stage 連接成功
📹 主播已連接，開始向所有 Stage 轉發
📤 開始向 Stage 推流
```

## ⚠️ 重要說明

### WHIP 實現

**當前的 WHIPClient 是一個簡化的實現框架**。

實際部署需要完整的 WebRTC 實現：

1. **使用 WebRTC 庫**: 如 `wrtc` 或 `node-webrtc`
2. **實現 WHIP 協議**: 完整的握手和協商流程
3. **媒體流處理**: 接收和轉發音視頻流
4. **ICE 處理**: 處理 ICE candidate 交換
5. **錯誤恢復**: 實現斷線重連機制

**生產環境建議**：
- 使用成熟的 WebRTC 媒體服務器（如 Janus, Kurento）
- 或使用 AWS SDK 提供的官方 WHIP 客戶端
- 實現媒體流的轉碼和優化

### 擴展性考慮

- **多實例部署**: 使用負載均衡部署多個 Media Server
- **區域部署**: 在不同 AWS 區域部署以降低延遲
- **監控告警**: 集成 CloudWatch 監控和告警
- **日誌聚合**: 使用 ELK 或 CloudWatch Logs 聚合日誌

## 🛠️ 開發

### 項目結構

```
media-server/
├── src/
│   ├── index.ts                 # 主程式入口
│   ├── services/
│   │   ├── APIClientService.ts  # API 通信服務
│   │   ├── StageManager.ts      # Stage 管理服務
│   │   └── WHIPClient.ts        # WHIP 客戶端
│   ├── routes/
│   │   └── health.ts            # 健康檢查路由
│   ├── utils/
│   │   ├── logger.ts            # 日誌工具
│   │   └── constants.ts         # 常數定義
│   └── types/
│       └── index.ts             # 類型定義
├── package.json
├── tsconfig.json
├── .env.example
└── README.md
```

### 運行測試

```bash
npm test
```

### 代碼格式化

```bash
npm run format
```

### 代碼檢查

```bash
npm run lint
```

## 📝 環境變數完整列表

| 變數 | 說明 | 默認值 |
|------|------|--------|
| `NODE_ENV` | 運行環境 | `development` |
| `PORT` | 服務器端口 | `3001` |
| `SERVER_ID` | 服務器 ID | `media-server-01` |
| `SERVER_IP` | 服務器 IP | `localhost` |
| `API_SERVER_URL` | API Server URL | `http://localhost:3000` |
| `API_SECRET_KEY` | API 密鑰 | - |
| `MEDIA_SERVER_SECRET` | Media Server 密鑰 | - |
| `AWS_REGION` | AWS 區域 | `us-east-1` |
| `AWS_ACCESS_KEY_ID` | AWS Access Key | - |
| `AWS_SECRET_ACCESS_KEY` | AWS Secret Key | - |
| `WHIP_ENDPOINT` | WHIP 端點 | `https://global.whip.live-video.net` |
| `LOG_LEVEL` | 日誌級別 | `info` |
| `HEARTBEAT_INTERVAL` | 心跳間隔（ms） | `30000` |
| `STAGE_SYNC_INTERVAL` | Stage 同步間隔（ms） | `60000` |
| `ENABLE_AUTO_SYNC` | 啟用自動同步 | `true` |

## 🔐 安全性

### 認證

Media Server 使用雙重認證：

1. **API Key**: `x-api-key` header
2. **Media Server Secret**: `x-media-auth` header

### 最佳實踐

- 使用環境變數存儲敏感信息
- 定期輪換密鑰
- 限制 API Server 訪問來源
- 使用 HTTPS/WSS（生產環境）
- 實施 IP 白名單

## 🤝 貢獻

歡迎提交 Issue 和 Pull Request！

## 📄 許可證

MIT License
