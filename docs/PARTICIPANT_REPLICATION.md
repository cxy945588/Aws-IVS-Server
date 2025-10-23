# AWS IVS Participant Replication 功能實現

## 概述

本次更新實現了 AWS IVS Real-time 的 **Participant Replication** 功能。這個功能允許將主播從一個 Stage 複製到其他 Stage，使得主播只需要推一條流，但多個 Stage 的觀眾都能看到主播的直播。

## 功能特點

### 1. 自動化複製
- 當自動擴展創建新 Stage 時，自動將主播複製到新 Stage
- 刪除 Stage 時自動停止複製
- 無需主播端任何額外操作

### 2. 手動管理
- 提供 API 端點手動啟動/停止複製
- 可查詢複製狀態
- 可查詢當前主播資訊

### 3. 狀態追蹤
- 在 Redis 中記錄主播資訊（participantId）
- 追蹤每個 Stage 的複製狀態
- 提供完整的日誌記錄

## 架構設計

### 工作流程

```
1. 主播請求 Token
   └─> POST /api/token/publisher
       └─> 生成 Token 並返回 participantId
       └─> 將 participantId 存儲到 Redis

2. 自動擴展觸發
   └─> 創建新 Stage
       └─> 從 Redis 獲取主播 participantId
       └─> 調用 StartParticipantReplication
       └─> 記錄複製狀態到 Redis

3. 觀眾加入
   └─> 被自動分配到不同 Stage
   └─> 所有 Stage 都能看到主播

4. Stage 縮減
   └─> 從 Redis 獲取複製狀態
   └─> 調用 StopParticipantReplication
   └─> 刪除 Stage
```

## 文件變更

### 1. IVSService.ts
新增方法：
- `startParticipantReplication()` - 啟動參與者複製
- `stopParticipantReplication()` - 停止參與者複製
- `listParticipantReplications()` - 列出複製狀態

### 2. RedisService.ts
新增方法：
- `setPublisherInfo()` - 存儲主播資訊
- `getPublisherInfo()` - 獲取主播資訊
- `clearPublisherInfo()` - 清除主播資訊
- `setReplicationStatus()` - 記錄複製狀態
- `getReplicationStatus()` - 獲取複製狀態
- `clearReplicationStatus()` - 清除複製狀態

### 3. StageAutoScalingService.ts
更新方法：
- `scaleUp()` - 創建 Stage 後自動啟動複製
- `scaleDown()` - 刪除 Stage 前停止複製

### 4. routes/token.ts
更新：
- 在生成主播 Token 後存儲 participantId

### 5. routes/stage.ts
新增路由：
- `POST /api/stage/replication/start` - 手動啟動複製
- `DELETE /api/stage/replication/stop` - 停止複製
- `GET /api/stage/replication/status/:stageArn` - 查詢複製狀態
- `GET /api/stage/replication/publisher-info` - 獲取主播資訊

## API 使用說明

### 1. 獲取主播資訊

```bash
curl http://localhost:3000/api/stage/replication/publisher-info
```

回應：
```json
{
  "success": true,
  "data": {
    "hasPublisher": true,
    "publisherInfo": {
      "participantId": "xxx",
      "stageArn": "arn:aws:ivs:...",
      "userId": "broadcaster-123",
      "joinedAt": "2025-10-23T..."
    }
  }
}
```

### 2. 手動啟動複製

```bash
curl -X POST http://localhost:3000/api/stage/replication/start \
  -H "Content-Type: application/json" \
  -d '{
    "sourceStageArn": "arn:aws:ivs:...:stage/xxxxx",
    "destinationStageArn": "arn:aws:ivs:...:stage/yyyyy",
    "participantId": "participant-id"
  }'
```

### 3. 查詢複製狀態

```bash
curl http://localhost:3000/api/stage/replication/status/arn:aws:ivs:...:stage/xxxxx
```

### 4. 停止複製

```bash
curl -X DELETE http://localhost:3000/api/stage/replication/stop \
  -H "Content-Type: application/json" \
  -d '{
    "sourceStageArn": "arn:aws:ivs:...:stage/xxxxx",
    "destinationStageArn": "arn:aws:ivs:...:stage/yyyyy",
    "participantId": "participant-id"
  }'
```

## 測試

### 運行測試腳本

```bash
# 設置 API 地址（可選）
export API_BASE_URL=http://localhost:3000

# 運行測試
node test-participant-replication.js
```

測試流程：
1. ✅ 生成主播 Token
2. ✅ 查詢主播資訊
3. ✅ 創建新 Stage
4. ✅ 啟動 Participant Replication
5. ✅ 查詢 Replication 狀態
6. ✅ 停止 Replication
7. ✅ 清理測試資源

## 注意事項

### 1. SDK 版本要求

⚠️ **重要：** Participant Replication 功能需要 `@aws-sdk/client-ivs-realtime >= 3.600.0`

當前專案使用的是 `3.500.0`，需要升級：

```bash
cd api-server
npm install @aws-sdk/client-ivs-realtime@latest
```

### 2. AWS 區域支持

Participant Replication 是 2025年5月發布的新功能，請確保您的 AWS 區域支持此功能。

### 3. 錯誤處理

代碼中包含了友好的錯誤處理：
- 如果 SDK 版本不支持，會提示升級
- Replication 失敗不會影響 Stage 的創建或刪除
- 所有操作都有詳細的日誌記錄

### 4. 自動化行為

- 自動擴展時，如果主播在線，會自動啟動複製
- 如果主播不在線，會記錄警告但不影響 Stage 創建
- Stage 刪除時會自動停止複製（如果存在）

## 優勢

### 相比之前的方案

**之前：**
- 創建多個 Stage
- 主播需要分別推流到不同 Stage
- 消耗更多帶寬和資源

**現在：**
- 創建多個 Stage ✅
- 主播只推一條流到 Master Stage ✅
- 通過 Participant Replication 複製到其他 Stage ✅
- 節省帶寬和資源 ✅

## 參考資料

- [AWS IVS Participant Replication 文檔](https://docs.aws.amazon.com/ivs/latest/RealTimeUserGuide/rt-participant-replication.html)
- [AWS CLI 參考](https://docs.aws.amazon.com/cli/latest/reference/ivs-realtime/start-participant-replication.html)
- [AWS 官方公告](https://aws.amazon.com/about-aws/whats-new/2025/05/amazon-ivs-real-time-streaming-participant-replication/)

## 未來改進

1. 支持多主播複製
2. 添加複製健康檢查
3. 自動處理複製失敗並重試
4. 提供更詳細的複製統計資訊
5. 支持複製優先級管理

## 變更日期

2025-10-23

## 作者

Claude Code (AI Assistant)
