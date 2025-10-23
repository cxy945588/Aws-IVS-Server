# 生产就绪架构方案

## 🎯 简化后的可上线架构

### 原方案的问题
- Media Server 需要完整的 WebRTC 实现（复杂度极高）
- WHIP 协议在 Node.js 中的实现需要大量底层工作
- 不适合快速上线

### 新方案：前端多 Stage 推流

```
┌─────────────────────────────────────────────────────────┐
│                    新架构（生产就绪）                    │
└─────────────────────────────────────────────────────────┘

主播 Web 界面（使用 AWS IVS Web Broadcast SDK）
  │
  │ 1. 请求所有 Stage 的 Publisher Token
  ↓
API Server
  │
  │ 2. 返回所有 Stage 的 Token
  ↓
主播 Web 界面
  │
  │ 3. 使用 SDK 同时加入所有 Stage
  ├────→ Stage-0 (0-50 观众)
  ├────→ Stage-1 (51-100 观众)
  ├────→ Stage-2 (101-150 观众)
  └────→ Stage-N

观众 Web 界面
  │
  │ 1. 请求 Viewer Token
  ↓
API Server (智能分配)
  │
  │ 2. 返回观众数最少的 Stage Token
  ↓
观众连接到分配的 Stage
```

## 优势

✅ **使用官方 SDK**：AWS IVS Web Broadcast SDK，稳定可靠
✅ **无需 Media Server**：不需要复杂的流转发
✅ **实现简单**：主要是前端代码
✅ **快速上线**：可立即部署
✅ **易于维护**：架构清晰简单

## 实现要点

### 1. API Server 新增端点

```typescript
// POST /api/token/publisher-all
// 返回所有 Stage 的 Publisher Token
{
  "tokens": [
    {
      "stageArn": "arn:aws:ivs:...",
      "token": "...",
      "participantId": "..."
    }
  ]
}
```

### 2. 主播 Web 界面

使用 AWS IVS Web Broadcast SDK：

```javascript
// 获取所有 Stage Token
const response = await fetch('/api/token/publisher-all');
const { tokens } = await response.json();

// 同时加入所有 Stage
for (const tokenInfo of tokens) {
  const stage = new IVSBroadcastClient.Stage(tokenInfo.token, {
    stageArn: tokenInfo.stageArn
  });

  await stage.join();

  // 添加本地媒体流
  stage.addVideoInputDevice(videoDevice);
  stage.addAudioInputDevice(audioDevice);
}
```

### 3. 观众 Web 界面

正常流程，API Server 自动分配最优 Stage：

```javascript
// 获取 Viewer Token（自动分配）
const response = await fetch('/api/token/viewer', {
  method: 'POST',
  body: JSON.stringify({ userId: 'viewer-123' })
});

const { token, stageArn } = await response.json();

// 加入 Stage
const stage = new IVSBroadcastClient.Stage(token, { stageArn });
await stage.join();
```

## Media Server 的新角色

Media Server 不再处理流，而是作为：
1. **监控服务**：监控所有 Stage 状态
2. **管理服务**：协调 Stage 创建/删除
3. **统计服务**：收集和分析数据

保留但简化实现。

## 部署方案

### 1. API Server（必需）
- 处理 Token 生成
- Stage 自动扩展
- 观众智能分配

### 2. Web 前端（必需）
- 主播推流界面
- 观众观看界面

### 3. Media Server（可选）
- 监控和管理
- 不处理流
