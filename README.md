# AWS IVS Real-time 串流專案

AWS IVS Real-time API Server - 支援大規模即時串流

## 快速開始

```bash
cd api-server
npm install
cp ../.env.example .env.local  # 設定環境變數
npm run dev
```

## 環境變數

```env
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=your-key
AWS_SECRET_ACCESS_KEY=your-secret
MASTER_STAGE_ARN=arn:aws:ivs:...
REDIS_HOST=localhost
REDIS_PORT=6379
API_PORT=3000
API_SECRET_KEY=your-api-key
NODE_ENV=development
```

## 主要功能

- Token 生成 (主播/觀眾)
- Stage 管理
- 即時統計
- CloudWatch Metrics
- WebSocket 即時更新

## API 端點

- `POST /api/token/publisher` - 生成主播 Token
- `POST /api/token/viewer` - 生成觀眾 Token
- `GET /api/stats` - 獲取統計資料
- `GET /api/stage` - Stage 列表
- `GET /health` - 健康檢查

查看 [FIX-SUMMARY.md](api-server/FIX-SUMMARY.md) 了解最近的修復。
