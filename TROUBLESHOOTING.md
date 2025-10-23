# 快速啟動指南

## 🚀 問題：前端 "Failed to fetch" 錯誤

如果你在主播端看到 "獲取 Stage 列表失敗: Failed to fetch"，請按照以下步驟檢查：

## ✅ 解決方案

### 1. 確保 API Server 正在運行

**步驟 1：啟動 API Server**

```bash
cd api-server
npm run dev
```

你應該看到類似的輸出：
```
🚀 API Server 運行於 http://localhost:3000
🔌 WebSocket 運行於 ws://localhost:3000/ws
```

**步驟 2：測試 API Server**

在另一個終端運行：
```bash
curl http://localhost:3000/health
```

應該返回：
```json
{
  "status": "ok",
  "timestamp": "..."
}
```

### 2. 檢查環境變數

確保你的 `.env` 文件配置正確：

```bash
# 最小配置（用於測試）
API_PORT=3000
API_SECRET_KEY=your-api-key-here
AWS_REGION=ap-northeast-1
AWS_ACCESS_KEY_ID=your-access-key
AWS_SECRET_ACCESS_KEY=your-secret-key
MASTER_STAGE_ARN=arn:aws:ivs:region:account:stage/xxxxx

# Redis（可選，如果沒有運行 Redis 會有警告但不影響測試）
REDIS_HOST=localhost
REDIS_PORT=6379
```

### 3. 啟動前端頁面

**主播端：**
```bash
cd web-frontend/broadcaster
python3 -m http.server 8080
```

訪問：`http://localhost:8080`

**觀眾端：**
```bash
cd web-frontend/viewer
python3 -m http.server 8081
```

訪問：`http://localhost:8081`

### 4. 配置前端頁面

在瀏覽器中：

1. **API Server URL**: `http://localhost:3000`
2. **API Key**: 輸入你在 `.env` 中設置的 `API_SECRET_KEY`

### 5. 測試連接

點擊「開始直播」，你應該看到：

```
✅ 本地媒體流已就緒
✅ 獲取到 N 個活躍 Stage
✅ WebSocket 已連接
✅ 直播已開始！
```

## 🔍 常見問題排查

### 問題 1: "Failed to fetch"

**可能原因：**
- API Server 沒有運行
- CORS 配置問題
- 防火牆阻擋

**解決方法：**
```bash
# 檢查 API Server 是否運行
ps aux | grep node

# 測試 API 端點
curl -v http://localhost:3000/api/broadcaster/stages \
  -H "x-api-key: your-api-key"

# 檢查 CORS（從瀏覽器開發者工具查看）
# 應該看到 Access-Control-Allow-Origin 標頭
```

### 問題 2: "獲取到 0 個活躍 Stage"

**可能原因：**
- AWS 還沒有創建任何 Stage
- Stage ARN 配置錯誤

**解決方法：**
```bash
# 檢查環境變數
cat api-server/.env | grep MASTER_STAGE_ARN

# 手動創建一個 Stage（通過 AWS Console 或 CLI）
aws ivs-realtime create-stage \
  --name "test-stage" \
  --region ap-northeast-1
```

### 問題 3: "WebSocket 錯誤"

**可能原因：**
- WebSocket 連接被阻擋
- API Key 錯誤

**解決方法：**
```bash
# 檢查 WebSocket 是否可用
curl http://localhost:3000/ws
# 應該返回 "Upgrade Required"

# 在瀏覽器開發者工具中檢查 WebSocket 連接
# Network → WS → 查看連接狀態
```

### 問題 4: 攝像頭/麥克風權限被拒絕

**解決方法：**
- 確保使用 HTTPS 或 localhost
- 檢查瀏覽器權限設置
- Chrome: 設置 → 隱私和安全 → 網站設置 → 攝像頭/麥克風

### 問題 5: Redis 連接錯誤（警告）

這是**預期行為**，如果測試環境沒有 Redis：

```
Redis 連接錯誤 ECONNREFUSED
```

**影響：**
- 觀眾計數功能不可用
- 自動擴展功能不可用
- Token 生成和基本功能**仍可使用**

**解決方法（如果需要完整功能）：**
```bash
# 使用 Docker 運行 Redis
docker run -d --name ivs-redis -p 6379:6379 redis:7

# 或使用 apt/brew 安裝
sudo apt install redis-server
redis-server
```

## 📋 完整測試流程

### Terminal 1: API Server
```bash
cd /path/to/Aws-IVS-Server/api-server
npm run dev
```

等待看到：
```
✅ API Server 運行於 http://localhost:3000
```

### Terminal 2: 主播端
```bash
cd /path/to/Aws-IVS-Server/web-frontend/broadcaster
python3 -m http.server 8080
```

### Terminal 3: 觀眾端（可選）
```bash
cd /path/to/Aws-IVS-Server/web-frontend/viewer
python3 -m http.server 8081
```

### 瀏覽器 1: 主播端
1. 訪問 `http://localhost:8080`
2. 輸入：
   - API Server URL: `http://localhost:3000`
   - API Key: `your-api-key-here`
3. 點擊「開始直播」
4. 授權攝像頭和麥克風

### 瀏覽器 2: 觀眾端（可選）
1. 訪問 `http://localhost:8081`
2. 輸入相同的 API Server URL 和 API Key
3. 點擊「加入觀看」

## 🎯 預期結果

**主播端應該顯示：**
```
✅ 本地媒體流已就緒
✅ 獲取到 1 個活躍 Stage
🔗 正在連接到 Stage: xxxxx...
✅ 已連接到 Stage: xxxxx
✅ WebSocket 已連接
✅ 直播已開始！
```

**觀眾端應該顯示：**
```
正在加入直播...
✅ 播放器就緒
✅ 播放中
```

## 🔧 調試技巧

### 1. 瀏覽器開發者工具

**Console（控制台）：**
- 查看詳細的日誌輸出
- 查看錯誤信息

**Network（網絡）：**
- 查看 API 請求
- 檢查 CORS 標頭
- 查看 WebSocket 連接

**Application（應用）：**
- 查看 localStorage
- 檢查攝像頭/麥克風權限

### 2. API Server 日誌

在運行 `npm run dev` 的終端查看：
- 請求日誌
- 錯誤信息
- WebSocket 連接狀態

### 3. curl 測試

```bash
# 測試健康檢查
curl http://localhost:3000/health

# 測試主播端 API（需要 API Key）
curl -X GET http://localhost:3000/api/broadcaster/stages \
  -H "x-api-key: your-api-key-here"

# 測試觀眾端 API
curl -X POST http://localhost:3000/api/viewer/join \
  -H "x-api-key: your-api-key-here" \
  -H "Content-Type: application/json"
```

## 📞 獲取幫助

如果問題仍未解決：

1. 檢查 API Server 終端的完整錯誤日誌
2. 檢查瀏覽器開發者工具的 Console 和 Network
3. 確保所有環境變數正確配置
4. 嘗試使用不同的瀏覽器（推薦 Chrome）

## 🎉 成功標誌

當一切正常時，你應該看到：

**API Server 終端：**
```
📋 主播端請求 Stage 列表
📡 主播端 WebSocket 已連接
```

**主播端瀏覽器：**
- 視頻預覽顯示你的攝像頭畫面
- Stage 卡片顯示為綠色（已連接）
- 日誌顯示「✅ 直播已開始！」

**觀眾端瀏覽器：**
- 視頻播放主播的畫面
- 狀態顯示「播放中」
