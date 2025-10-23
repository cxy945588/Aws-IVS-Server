# AWS IVS 前端頁面

這個目錄包含主播端和觀眾端的前端頁面，使用 AWS IVS SDK 實現低延遲直播。

## 📁 目錄結構

```
web-frontend/
├── broadcaster/          # 主播端（推流）
│   └── index.html
├── viewer/              # 觀眾端（觀看）
│   └── index.html
└── README.md
```

## 🎬 主播端 (Broadcaster)

### 功能特性

- 📹 使用 AWS IVS Web Broadcast SDK
- 🔄 同時推流到多個 Stage
- 🔔 自動監聽新 Stage 創建
- 📊 實時狀態監控
- 📝 詳細日誌輸出

### 使用方法

1. **啟動服務器**

```bash
cd broadcaster
python3 -m http.server 8080
# 或使用 Node.js
npx serve -p 8080
```

2. **訪問頁面**

打開瀏覽器訪問 `http://localhost:8080`

3. **配置**

- API Server URL: `http://localhost:3000`
- API Key: 你的 API Key（在 API Server 環境變數中配置）

4. **開始直播**

- 點擊「開始直播」按鈕
- 授權攝像頭和麥克風訪問
- 等待連接到所有 Stage
- 開始推流！

### 技術實現

```javascript
// 使用 AWS IVS Web Broadcast SDK
const { Stage, LocalStageStream } = IVSBroadcastClient;

// 創建 Stage 客戶端
const stage = new Stage(token, strategy);

// 添加本地媒體流
const videoTrack = localStream.getVideoTracks()[0];
const audioTrack = localStream.getAudioTracks()[0];

strategy.stageStreamsToPublish = () => [
  new LocalStageStream(0, videoTrack),
  new LocalStageStream(1, audioTrack)
];

// 加入 Stage
await stage.join();
```

### 工作流程

1. 獲取本地攝像頭和麥克風
2. 從 API Server 獲取所有活躍 Stage 列表
3. 為每個 Stage 創建連接並推流
4. 通過 WebSocket 監聽新 Stage 創建
5. 自動連接到新創建的 Stage
6. 監聽 Stage 刪除並自動斷開

## 👀 觀眾端 (Viewer)

### 功能特性

- 📺 使用 AWS IVS Player SDK
- 🎯 自動分配最優 Stage
- 💓 心跳保持連接
- 📊 播放狀態監控
- 🔄 自動重連

### 使用方法

1. **啟動服務器**

```bash
cd viewer
python3 -m http.server 8081
# 或使用 Node.js
npx serve -p 8081
```

2. **訪問頁面**

打開瀏覽器訪問 `http://localhost:8081`

3. **配置**

- API Server URL: `http://localhost:3000`
- API Key: 你的 API Key

4. **加入觀看**

- 點擊「加入觀看」按鈕
- 系統自動分配最優 Stage
- 開始觀看直播！

### 技術實現

```javascript
// 使用 AWS IVS Player SDK
const player = IVSPlayer.create();
player.attachHTMLVideoElement(videoElement);

// 加載並播放
player.load(playbackUrl);
player.play();

// 監聽播放器事件
player.addEventListener(IVSPlayer.PlayerState.PLAYING, () => {
  console.log('播放中');
});
```

### 工作流程

1. 向 API Server 請求加入直播
2. 獲得分配的 Stage ARN 和 Token
3. 使用 Token 連接到 Stage
4. 開始播放直播流
5. 定期發送心跳保持連接
6. 離開時通知 API Server

## 🔧 配置選項

### API Server 配置

```javascript
// 主播端配置
const API_SERVER = 'http://localhost:3000';
const API_KEY = 'your-api-key';

// 獲取 Stage 列表
GET /api/broadcaster/stages

// 獲取單個 Stage Token
POST /api/broadcaster/stage-token
Body: { stageArn: "arn:aws:ivs:..." }
```

```javascript
// 觀眾端配置
const API_SERVER = 'http://localhost:3000';
const API_KEY = 'your-api-key';

// 加入觀看
POST /api/viewer/join

// 發送心跳
POST /api/viewer/heartbeat
Body: { viewerId: "...", stageArn: "..." }

// 離開
POST /api/viewer/leave
Body: { viewerId: "...", stageArn: "..." }
```

## 📊 架構說明

### 簡化架構 vs 原架構

#### 原架構（複雜）

```
主播 → Media Server (WebRTC/WHIP) → Stage 0, 1, 2...
```

- ❌ 需要 Media Server
- ❌ 需要實現 WebRTC
- ❌ 需要實現 WHIP 協議
- ❌ 複雜度高
- ❌ 維護困難

#### 新架構（簡化）

```
主播 → AWS IVS SDK → Stage 0, 1, 2...
```

- ✅ 無需 Media Server
- ✅ 使用官方 SDK
- ✅ 簡單易用
- ✅ 穩定可靠
- ✅ 易於維護

## 🎯 優勢總結

| 特性 | 原方案 | 新方案 |
|------|--------|--------|
| 複雜度 | 極高 | 低 |
| 開發時間 | 數週 | 數天 |
| 維護成本 | 高 | 低 |
| 穩定性 | 需大量測試 | AWS 官方支持 |
| 部署 | 需額外 EC2 | 靜態文件服務器 |
| 成本 | EC2 + 網絡 | 僅 IVS 費用 |
| 延遲 | 多一跳 | 直連最低 |

## 🚀 快速測試

### 本地測試完整流程

1. **啟動 API Server**

```bash
cd api-server
npm run dev
```

2. **啟動主播端**

```bash
cd web-frontend/broadcaster
python3 -m http.server 8080
```

訪問 `http://localhost:8080`，開始直播

3. **啟動觀眾端**

```bash
cd web-frontend/viewer
python3 -m http.server 8081
```

訪問 `http://localhost:8081`，加入觀看

## 📝 開發建議

### 生產環境部署

1. **使用 HTTPS**: 瀏覽器需要 HTTPS 才能訪問攝像頭
2. **CDN 加速**: 使用 CDN 分發前端文件
3. **域名配置**: 配置正確的 CORS 和域名
4. **錯誤處理**: 添加完善的錯誤處理和重試機制

### 自定義開發

你可以基於這些頁面進行自定義：

1. **UI 美化**: 修改 CSS 樣式
2. **功能擴展**: 添加聊天、禮物等功能
3. **Analytics**: 集成分析工具
4. **多語言**: 添加國際化支持

## 🔍 調試技巧

### 瀏覽器控制台

打開瀏覽器開發者工具 (F12)，查看：

- **Console**: 日誌輸出
- **Network**: API 請求
- **WebSocket**: WebSocket 連接
- **Media**: 媒體流狀態

### 常見問題

1. **無法訪問攝像頭**: 檢查瀏覽器權限設置
2. **無法連接 Stage**: 檢查 API Key 和網絡連接
3. **推流失敗**: 檢查 Token 是否有效
4. **播放卡頓**: 檢查網絡帶寬和 Stage 負載

## 📚 相關資源

- [AWS IVS Web Broadcast SDK 文檔](https://docs.aws.amazon.com/ivs/latest/userguide/broadcast.html)
- [AWS IVS Player SDK 文檔](https://docs.aws.amazon.com/ivs/latest/userguide/player.html)
- [WebRTC API 參考](https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API)
- [簡化架構文檔](../SIMPLIFIED_ARCHITECTURE.md)

## 🎉 總結

這個前端方案：

- ✅ **立即可用**: 開箱即用，無需複雜配置
- ✅ **生產就緒**: 基於 AWS 官方 SDK
- ✅ **易於維護**: 代碼簡潔，邏輯清晰
- ✅ **成本低廉**: 無需額外服務器
- ✅ **性能優異**: 直連 IVS，低延遲

**推薦立即採用進行生產部署！**
