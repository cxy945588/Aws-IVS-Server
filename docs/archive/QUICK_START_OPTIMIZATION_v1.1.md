# 🚀 快速開始優化指南

> 📌 **針對**: 實務環境部署
> ⏱️ **預估時間**: 1 週
> 🎯 **目標**: 讓 API 達到生產環境就緒

---

## ✅ 立即實施檢查清單

### 🔴 本週必須完成（Critical）

#### 1. 請求驗證層 (4 小時)

```bash
# 1. 安裝依賴（已有 Joi）
cd api-server
npm install

# 2. 創建文件
# - src/middleware/validation.ts
# - src/schemas/token.schemas.ts
# - src/schemas/stage.schemas.ts
# - src/schemas/viewer.schemas.ts

# 3. 更新所有路由使用驗證中間件
```

**優先級**: 🔴 Critical
**理由**: 防止無效數據進入系統

---

#### 2. 基礎測試 (8 小時)

```bash
# 1. 創建測試目錄
mkdir -p __tests__/services
mkdir -p __tests__/routes

# 2. 配置 Jest
# - jest.config.js

# 3. 編寫測試
# - __tests__/services/RedisService.test.ts
# - __tests__/routes/token.test.ts
# - __tests__/routes/health.test.ts

# 4. 運行測試
npm run test:coverage

# 目標: 50% 以上覆蓋率
```

**優先級**: 🔴 Critical
**理由**: 確保代碼質量，防止回歸錯誤

---

#### 3. 錯誤追蹤 (2 小時)

```bash
# 1. 安裝 Sentry
npm install @sentry/node @sentry/profiling-node

# 2. 創建配置
# - src/utils/sentry.ts

# 3. 在 index.ts 集成
```

**優先級**: 🔴 Critical
**理由**: 生產環境錯誤可視化

---

### 🟡 本月必須完成（High）

#### 4. DynamoDB 持久化 (12 小時)

```bash
# 1. 創建 DynamoDB Service
# - src/services/DynamoDBService.ts

# 2. 創建表格（AWS Console 或 CDK）
# - ivs-tokens
# - ivs-sessions
# - ivs-stages
# - ivs-users

# 3. 集成到現有服務
# - Token 生成時寫入 DynamoDB
# - Session 記錄寫入 DynamoDB
```

**優先級**: 🟡 High
**理由**: 數據持久化，防止 Redis 故障丟失數據

---

#### 5. API 版本控制 (4 小時)

```bash
# 1. 創建 v1 目錄
mkdir -p src/routes/v1
mv src/routes/*.ts src/routes/v1/

# 2. 創建 v1 index
# - src/routes/v1/index.ts

# 3. 更新 src/index.ts 使用 /api/v1
```

**優先級**: 🟡 High
**理由**: 未來升級不影響現有客戶端

---

#### 6. Docker 優化 (4 小時)

```bash
# 1. 創建多階段 Dockerfile
# - api-server/Dockerfile

# 2. 優化 docker-compose.yml
# - 添加健康檢查
# - 添加資源限制
# - 添加網絡配置

# 3. 測試
docker-compose up --build
```

**優先級**: 🟡 High
**理由**: 生產環境部署需要

---

### 🟢 下月完成（Medium）

#### 7. CI/CD Pipeline (8 小時)

```bash
# 1. 創建 GitHub Actions
# - .github/workflows/ci.yml
# - .github/workflows/cd.yml

# 2. 設置 AWS ECR
# 3. 配置自動部署到 ECS/EC2
```

**優先級**: 🟢 Medium
**理由**: 自動化部署流程

---

## 📋 詳細實施步驟

### 步驟 1: 請求驗證層（最高優先級）

#### 1.1 創建驗證中間件

**檔案**: `src/middleware/validation.ts`

```typescript
import Joi from 'joi';
import { Request, Response, NextFunction } from 'express';
import { sendValidationError } from '../utils/responseHelper';

export const validate = (schema: Joi.ObjectSchema) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const { error, value } = schema.validate(req.body, {
      abortEarly: false,
      stripUnknown: true,
    });

    if (error) {
      const missingFields = error.details.map(d => d.path.join('.'));
      const message = error.details.map(d => d.message).join(', ');
      return sendValidationError(res, message, missingFields);
    }

    req.body = value;
    next();
  };
};
```

#### 1.2 創建 Token Schemas

**檔案**: `src/schemas/token.schemas.ts`

```typescript
import Joi from 'joi';

export const publisherTokenSchema = Joi.object({
  userId: Joi.string().required().min(1).max(100)
    .messages({
      'string.empty': 'userId 不能為空',
      'any.required': '缺少 userId',
    }),
  attributes: Joi.object().optional(),
});

export const viewerTokenSchema = Joi.object({
  userId: Joi.string().required().min(1).max(100),
  stageArn: Joi.string().optional()
    .pattern(/^arn:aws:ivs:[a-z0-9-]+:[0-9]+:stage\/[a-zA-Z0-9]+$/)
    .messages({
      'string.pattern.base': 'stageArn 格式不正確',
    }),
});
```

#### 1.3 更新路由

**檔案**: `src/routes/token.ts`

```typescript
import { validate } from '../middleware/validation';
import { publisherTokenSchema, viewerTokenSchema } from '../schemas/token.schemas';

// 移除手動驗證，使用中間件
router.post('/publisher',
  validate(publisherTokenSchema),
  async (req, res) => {
    // 不需要 if (!userId) 驗證了
    const { userId, attributes } = req.body;
    // ... 業務邏輯
  }
);
```

---

### 步驟 2: 基礎測試

#### 2.1 Jest 配置

**檔案**: `jest.config.js`

```javascript
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src', '<rootDir>/__tests__'],
  testMatch: ['**/__tests__/**/*.test.ts'],
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/index.ts',
  ],
  coverageThreshold: {
    global: {
      branches: 50,
      functions: 50,
      lines: 50,
      statements: 50,
    },
  },
};
```

#### 2.2 範例測試

**檔案**: `__tests__/routes/health.test.ts`

```typescript
import request from 'supertest';
import { app } from '../../src/index';

describe('Health API', () => {
  test('GET /health 應該返回健康狀態', async () => {
    const response = await request(app)
      .get('/health')
      .expect(200);

    expect(response.body.success).toBe(true);
    expect(response.body.data).toHaveProperty('status');
    expect(response.body.data.status).toBe('healthy');
  });
});
```

---

### 步驟 3: Sentry 集成

#### 3.1 安裝依賴

```bash
npm install @sentry/node @sentry/profiling-node
```

#### 3.2 創建配置

**檔案**: `src/utils/sentry.ts`

```typescript
import * as Sentry from '@sentry/node';
import { ProfilingIntegration } from '@sentry/profiling-node';
import { Express } from 'express';

export function initSentry(app: Express) {
  if (process.env.NODE_ENV !== 'production') {
    return; // 開發環境不啟用
  }

  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV,
    integrations: [
      new Sentry.Integrations.Http({ tracing: true }),
      new Sentry.Integrations.Express({ app }),
      new ProfilingIntegration(),
    ],
    tracesSampleRate: 0.1, // 10% 採樣
    profilesSampleRate: 0.1,
  });

  app.use(Sentry.Handlers.requestHandler());
  app.use(Sentry.Handlers.tracingHandler());
}

export function setupSentryErrorHandler(app: Express) {
  if (process.env.NODE_ENV !== 'production') {
    return;
  }

  app.use(Sentry.Handlers.errorHandler());
}
```

#### 3.3 集成到 index.ts

```typescript
import { initSentry, setupSentryErrorHandler } from './utils/sentry';

// 在所有中間件之前
initSentry(app);

// ... 其他中間件和路由 ...

// 在錯誤處理之前
setupSentryErrorHandler(app);
app.use(errorHandler);
```

---

## 🎯 完成標準

### Week 1 目標

- [ ] ✅ 請求驗證層實現並測試
- [ ] ✅ 基礎測試達到 50% 覆蓋率
- [ ] ✅ Sentry 錯誤追蹤集成
- [ ] ✅ 所有測試通過
- [ ] ✅ 文檔更新

### 驗收測試

```bash
# 1. 所有測試通過
npm run test

# 2. 測試覆蓋率 ≥ 50%
npm run test:coverage

# 3. 編譯成功
npm run build

# 4. 啟動成功
npm start

# 5. 健康檢查通過
curl http://localhost:3000/health
```

---

## 📊 預期改進

| 指標 | 當前 | Week 1 後 | 改進 |
|------|------|-----------|------|
| 請求驗證 | 手動 | 自動化 | +100% |
| 測試覆蓋 | 0% | 50% | +50% |
| 錯誤可視化 | ❌ | ✅ | +100% |
| 代碼質量 | 7/10 | 8.5/10 | +21% |

---

## 🆘 需要幫助？

### 常見問題

**Q: Joi 驗證失敗怎麼辦？**
A: 檢查 schema 定義，確保 messages 配置正確

**Q: 測試連接 Redis 失敗？**
A: 確保 Redis 服務運行，或使用 jest.mock 模擬

**Q: Sentry 沒有收到錯誤？**
A: 檢查 SENTRY_DSN 環境變數，確保在 production 環境

---

## 📚 參考資源

- [Joi 文檔](https://joi.dev/)
- [Jest 文檔](https://jestjs.io/)
- [Sentry Node.js](https://docs.sentry.io/platforms/node/)
- [完整優化指南](OPTIMIZATION_GUIDE.md)

---

**創建日期**: 2025-10-21
**更新日期**: 2025-10-21
