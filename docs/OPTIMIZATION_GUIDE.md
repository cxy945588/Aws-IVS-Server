# AWS IVS API Server - 實務環境優化建議

> 📋 **審查日期**: 2025-10-21
> 🎯 **目標**: 生產環境就緒
> ⚡ **優先級**: 高 → 中 → 低

---

## 📊 執行摘要

### 當前狀態評估

| 類別 | 評分 | 狀態 |
|------|------|------|
| **功能完整性** | 8/10 | ✅ 良好 |
| **生產就緒度** | 5/10 | ⚠️ 需改進 |
| **可維護性** | 7/10 | ✅ 良好 |
| **安全性** | 6/10 | ⚠️ 需加強 |
| **性能優化** | 6/10 | ⚠️ 可優化 |
| **監控告警** | 5/10 | ⚠️ 需完善 |
| **測試覆蓋** | 0/10 | ❌ 缺失 |
| **文檔完整性** | 9/10 | ✅ 優秀 |

**總體評分**: **6.5/10** - 適合開發環境，但需要改進才能進入生產環境

---

## 🚨 高優先級優化 (Critical)

### 1. ⚠️ 數據持久化問題

**現狀**:
- ✅ 有 DynamoDB 依賴和環境變數配置
- ❌ 但完全沒有實現，所有數據都在 Redis
- ❌ Redis 故障會導致所有數據丟失

**風險**:
- 🔴 Redis 單點故障
- 🔴 重啟後所有觀眾數據丟失
- 🔴 無法進行歷史數據分析

**解決方案**:

```typescript
// services/DynamoDBService.ts
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  PutCommand,
  GetCommand,
  QueryCommand,
  UpdateCommand
} from '@aws-sdk/lib-dynamodb';

export class DynamoDBService {
  private static instance: DynamoDBService;
  private docClient: DynamoDBDocumentClient;

  private constructor() {
    const client = new DynamoDBClient({
      region: process.env.AWS_REGION,
    });
    this.docClient = DynamoDBDocumentClient.from(client);
  }

  static getInstance(): DynamoDBService {
    if (!this.instance) {
      this.instance = new DynamoDBService();
    }
    return this.instance;
  }

  // 儲存 Token 記錄（用於審計）
  async saveTokenRecord(tokenData: {
    userId: string;
    tokenType: 'publisher' | 'viewer';
    stageArn: string;
    participantId: string;
    issuedAt: string;
    expiresAt: string;
  }) {
    await this.docClient.send(new PutCommand({
      TableName: process.env.DYNAMODB_TOKENS_TABLE,
      Item: {
        ...tokenData,
        ttl: Math.floor(new Date(tokenData.expiresAt).getTime() / 1000),
      },
    }));
  }

  // 儲存觀眾 Session（用於分析）
  async saveViewerSession(sessionData: {
    userId: string;
    stageArn: string;
    joinedAt: string;
    leftAt?: string;
    watchDuration?: number;
  }) {
    await this.docClient.send(new PutCommand({
      TableName: process.env.DYNAMODB_SESSIONS_TABLE,
      Item: sessionData,
    }));
  }

  // 查詢觀眾觀看歷史
  async getViewerHistory(userId: string) {
    const result = await this.docClient.send(new QueryCommand({
      TableName: process.env.DYNAMODB_SESSIONS_TABLE,
      KeyConditionExpression: 'userId = :userId',
      ExpressionAttributeValues: {
        ':userId': userId,
      },
    }));
    return result.Items || [];
  }
}
```

**實現計劃**:
1. ✅ 創建 DynamoDB 表格（已有環境變數配置）
2. 🔨 實現 DynamoDBService
3. 🔨 Token 生成時寫入 DynamoDB
4. 🔨 觀眾 Session 寫入 DynamoDB
5. 🔨 Redis 作為快取層，DynamoDB 作為持久層

**預期效果**:
- ✅ 數據持久化
- ✅ 可進行歷史分析
- ✅ 審計追蹤
- ✅ Redis 故障也不會丟失數據

---

### 2. ⚠️ 缺少請求驗證層

**現狀**:
- ✅ 已安裝 Joi 依賴
- ❌ 完全沒有使用
- ❌ 每個路由手動驗證參數

**問題**:
```typescript
// ❌ 當前做法 - 重複代碼
if (!userId) {
  return sendValidationError(res, '缺少 userId', ['userId']);
}
if (!stageArn) {
  return sendValidationError(res, '缺少 stageArn', ['stageArn']);
}
```

**解決方案**:

```typescript
// middleware/validation.ts
import Joi from 'joi';
import { Request, Response, NextFunction } from 'express';
import { sendValidationError } from '../utils/responseHelper';

// 驗證中間件工廠函數
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

    req.body = value; // 使用驗證後的值
    next();
  };
};

// schemas/token.schemas.ts
export const publisherTokenSchema = Joi.object({
  userId: Joi.string().required().min(1).max(100),
  attributes: Joi.object().optional(),
});

export const viewerTokenSchema = Joi.object({
  userId: Joi.string().required().min(1).max(100),
  stageArn: Joi.string().optional()
    .pattern(/^arn:aws:ivs:[a-z0-9-]+:[0-9]+:stage\/[a-zA-Z0-9]+$/),
});

// routes/token.ts
import { validate } from '../middleware/validation';
import { publisherTokenSchema, viewerTokenSchema } from '../schemas/token.schemas';

// ✅ 使用驗證中間件
router.post('/publisher', validate(publisherTokenSchema), async (req, res) => {
  // 不需要手動驗證，參數已經驗證過了
  const { userId, attributes } = req.body;
  // ...
});

router.post('/viewer', validate(viewerTokenSchema), async (req, res) => {
  const { userId, stageArn } = req.body;
  // ...
});
```

**預期效果**:
- ✅ 統一的驗證邏輯
- ✅ 減少重複代碼
- ✅ 更詳細的錯誤訊息
- ✅ 自動過濾無效欄位

---

### 3. ⚠️ 缺少單元測試和集成測試

**現狀**:
- ✅ 已安裝 Jest 和 ts-jest
- ❌ 沒有任何測試文件
- ❌ 測試覆蓋率 0%

**解決方案**:

```typescript
// __tests__/services/RedisService.test.ts
import { RedisService } from '../../src/services/RedisService';

describe('RedisService', () => {
  let redis: RedisService;

  beforeAll(() => {
    redis = RedisService.getInstance();
  });

  afterAll(async () => {
    await redis.disconnect();
  });

  describe('觀眾計數', () => {
    const testStageArn = 'arn:aws:ivs:test:123:stage/test';

    beforeEach(async () => {
      // 清理測試數據
      await redis.del(`viewers:${testStageArn}`);
    });

    test('應該正確增加觀眾數', async () => {
      await redis.incrementViewerCount(testStageArn);
      const count = await redis.getStageViewerCount(testStageArn);
      expect(count).toBe(1);
    });

    test('應該正確減少觀眾數', async () => {
      await redis.incrementViewerCount(testStageArn);
      await redis.incrementViewerCount(testStageArn);
      await redis.decrementViewerCount(testStageArn);
      const count = await redis.getStageViewerCount(testStageArn);
      expect(count).toBe(1);
    });

    test('觀眾數不應該為負數', async () => {
      await redis.decrementViewerCount(testStageArn);
      const count = await redis.getStageViewerCount(testStageArn);
      expect(count).toBe(0);
    });
  });
});

// __tests__/routes/token.test.ts
import request from 'supertest';
import { app } from '../../src/index';

describe('Token API', () => {
  const apiKey = process.env.API_SECRET_KEY;

  describe('POST /api/token/publisher', () => {
    test('應該成功生成主播 Token', async () => {
      const response = await request(app)
        .post('/api/token/publisher')
        .set('x-api-key', apiKey)
        .send({ userId: 'test-publisher' })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('token');
      expect(response.body.data.capabilities).toContain('PUBLISH');
    });

    test('缺少 userId 應該返回驗證錯誤', async () => {
      const response = await request(app)
        .post('/api/token/publisher')
        .set('x-api-key', apiKey)
        .send({})
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    test('沒有 API Key 應該返回 401', async () => {
      await request(app)
        .post('/api/token/publisher')
        .send({ userId: 'test' })
        .expect(401);
    });
  });
});
```

**測試配置**:

```json
// jest.config.js
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
      branches: 70,
      functions: 70,
      lines: 70,
      statements: 70,
    },
  },
};
```

**測試腳本**:

```json
// package.json
{
  "scripts": {
    "test": "jest",
    "test:watch": "jest --watch",
    "test:coverage": "jest --coverage",
    "test:integration": "jest --testPathPattern=integration"
  }
}
```

**預期效果**:
- ✅ 測試覆蓋率 > 70%
- ✅ 持續集成自動測試
- ✅ 重構時有信心
- ✅ 文檔化的行為

---

### 4. ⚠️ 缺少 APM 和錯誤追蹤

**現狀**:
- ❌ 沒有錯誤追蹤工具
- ❌ 無法追蹤錯誤堆疊
- ❌ 難以定位生產環境問題

**解決方案**:

**選項 1: AWS X-Ray**

```typescript
// middleware/xray.ts
import AWSXRay from 'aws-xray-sdk-core';
import AWS from 'aws-sdk';

// 包裝 AWS SDK
AWSXRay.captureAWS(AWS);

// Express 中間件
export const xrayMiddleware = AWSXRay.express.openSegment('IVS-API');
export const xrayCloseMiddleware = AWSXRay.express.closeSegment();

// index.ts
app.use(xrayMiddleware);
// ... 其他中間件和路由
app.use(xrayCloseMiddleware);
```

**選項 2: Sentry** (推薦)

```typescript
// utils/sentry.ts
import * as Sentry from '@sentry/node';
import { ProfilingIntegration } from '@sentry/profiling-node';

export function initSentry(app: Express) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV,
    integrations: [
      new Sentry.Integrations.Http({ tracing: true }),
      new Sentry.Integrations.Express({ app }),
      new ProfilingIntegration(),
    ],
    tracesSampleRate: 1.0,
    profilesSampleRate: 1.0,
  });

  // 請求處理器
  app.use(Sentry.Handlers.requestHandler());
  app.use(Sentry.Handlers.tracingHandler());
}

export function setupSentryErrorHandler(app: Express) {
  // 錯誤處理器（必須在所有路由之後）
  app.use(Sentry.Handlers.errorHandler());
}

// index.ts
import { initSentry, setupSentryErrorHandler } from './utils/sentry';

initSentry(app);
// ... 路由
setupSentryErrorHandler(app);
```

**預期效果**:
- ✅ 自動錯誤捕獲
- ✅ 堆疊追蹤
- ✅ 性能監控
- ✅ 告警通知

---

### 5. ⚠️ API 版本控制缺失

**現狀**:
- ❌ 所有 API 沒有版本號
- ❌ 未來破壞性變更會影響所有客戶端

**解決方案**:

```typescript
// routes/v1/index.ts
import { Router } from 'express';
import tokenRoutes from './token';
import stageRoutes from './stage';
import statsRoutes from './stats';
import viewerRoutes from './viewer';

const router = Router();

router.use('/token', tokenRoutes);
router.use('/stage', stageRoutes);
router.use('/stats', statsRoutes);
router.use('/viewer', viewerRoutes);

export default router;

// routes/v2/index.ts (未來版本)
// ... v2 的路由

// index.ts
import v1Routes from './routes/v1';
// import v2Routes from './routes/v2'; // 未來

app.use('/api/v1', apiKeyAuth, v1Routes);
// app.use('/api/v2', apiKeyAuth, v2Routes);

// 向後兼容（暫時指向 v1）
app.use('/api', apiKeyAuth, v1Routes);
```

**版本策略**:

```typescript
// middleware/apiVersion.ts
export const supportedVersions = ['v1', 'v2'];

export function checkApiVersion(req: Request, res: Response, next: NextFunction) {
  const version = req.baseUrl.split('/')[2]; // /api/v1/...

  if (version && !supportedVersions.includes(version)) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'UNSUPPORTED_API_VERSION',
        message: `API version ${version} is not supported`,
        supportedVersions,
      },
      timestamp: new Date().toISOString(),
    });
  }

  next();
}
```

**預期效果**:
- ✅ 平滑升級
- ✅ 向後兼容
- ✅ 客戶端可選擇版本

---

## 🔥 中優先級優化 (High)

### 6. 🔒 安全性加強

#### 6.1 JWT Token 而非簡單 API Key

**當前問題**:
- API Key 是靜態的
- 無法撤銷特定用戶
- 無法設置細粒度權限

**解決方案**:

```typescript
// utils/jwt.ts
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';
const JWT_EXPIRY = '24h';

export interface JWTPayload {
  userId: string;
  role: 'admin' | 'user';
  permissions: string[];
}

export function generateJWT(payload: JWTPayload): string {
  return jwt.sign(payload, JWT_SECRET, {
    expiresIn: JWT_EXPIRY,
    issuer: 'ivs-api-server',
  });
}

export function verifyJWT(token: string): JWTPayload {
  return jwt.verify(token, JWT_SECRET) as JWTPayload;
}

// middleware/jwtAuth.ts
export function jwtAuth(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith('Bearer ')) {
    return sendUnauthorized(res, '缺少 Bearer Token');
  }

  const token = authHeader.substring(7);

  try {
    const payload = verifyJWT(token);
    req.user = payload;
    next();
  } catch (error) {
    return sendUnauthorized(res, 'Token 無效或已過期');
  }
}

// 權限檢查中間件
export function requirePermission(...permissions: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    const user = req.user;

    if (!user) {
      return sendUnauthorized(res);
    }

    const hasPermission = permissions.some(p => user.permissions.includes(p));

    if (!hasPermission) {
      return sendForbidden(res, '權限不足');
    }

    next();
  };
}

// 使用
router.post('/stage',
  jwtAuth,
  requirePermission('stage:create'),
  async (req, res) => {
    // ...
  }
);
```

#### 6.2 請求簽名驗證（用於 Webhook）

```typescript
// middleware/signatureVerification.ts
import crypto from 'crypto';

export function verifyWebhookSignature(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const signature = req.headers['x-webhook-signature'];
  const timestamp = req.headers['x-webhook-timestamp'];

  // 防止重放攻擊
  const requestTime = parseInt(timestamp as string);
  const now = Date.now();
  if (Math.abs(now - requestTime) > 300000) { // 5 分鐘
    return sendForbidden(res, '請求已過期');
  }

  // 驗證簽名
  const payload = JSON.stringify(req.body);
  const expectedSignature = crypto
    .createHmac('sha256', process.env.WEBHOOK_SECRET!)
    .update(`${timestamp}.${payload}`)
    .digest('hex');

  if (signature !== expectedSignature) {
    return sendForbidden(res, '簽名驗證失敗');
  }

  next();
}
```

#### 6.3 速率限制改進

**當前問題**:
- 全局限制不夠靈活
- 沒有按用戶限制
- 沒有動態調整

**改進方案**:

```typescript
// middleware/advancedRateLimiter.ts
import rateLimit from 'express-rate-limit';
import RedisStore from 'rate-limit-redis';
import { RedisService } from '../services/RedisService';

// 按 IP 限制
export const ipRateLimiter = rateLimit({
  store: new RedisStore({
    client: RedisService.getInstance().getClient(),
    prefix: 'rl:ip:',
  }),
  windowMs: 60 * 1000, // 1 分鐘
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
});

// 按用戶限制（更高限制）
export const userRateLimiter = rateLimit({
  store: new RedisStore({
    client: RedisService.getInstance().getClient(),
    prefix: 'rl:user:',
  }),
  windowMs: 60 * 1000,
  max: (req) => {
    // 管理員更高限制
    return req.user?.role === 'admin' ? 1000 : 500;
  },
  keyGenerator: (req) => req.user?.userId || req.ip,
});

// Token 生成特殊限制
export const tokenGenerationLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10, // 每分鐘最多 10 個 Token
  keyGenerator: (req) => req.body.userId || req.ip,
  handler: (req, res) => {
    sendError(
      res,
      'RATE_LIMIT_EXCEEDED',
      'Token 生成過於頻繁，請稍後再試',
      429
    );
  },
});

// 使用
app.use('/api/', ipRateLimiter);
app.use('/api/', userRateLimiter);
app.use('/api/token/', tokenGenerationLimiter);
```

---

### 7. 📊 監控告警完善

#### 7.1 自定義 CloudWatch 告警

```typescript
// services/AlertingService.ts
import { CloudWatchClient, PutMetricAlarmCommand } from '@aws-sdk/client-cloudwatch';
import { SNSClient, PublishCommand } from '@aws-sdk/client-sns';

export class AlertingService {
  private cloudwatch: CloudWatchClient;
  private sns: SNSClient;

  constructor() {
    this.cloudwatch = new CloudWatchClient({
      region: process.env.AWS_REGION,
    });
    this.sns = new SNSClient({
      region: process.env.AWS_REGION,
    });
  }

  // 創建告警
  async createAlarms() {
    // 高錯誤率告警
    await this.cloudwatch.send(new PutMetricAlarmCommand({
      AlarmName: 'IVS-API-HighErrorRate',
      MetricName: 'ErrorCount',
      Namespace: 'IVS/Production',
      Statistic: 'Sum',
      Period: 300, // 5 分鐘
      EvaluationPeriods: 1,
      Threshold: 10,
      ComparisonOperator: 'GreaterThanThreshold',
      AlarmActions: [process.env.SNS_TOPIC_ARN!],
    }));

    // Redis 連接失敗告警
    await this.cloudwatch.send(new PutMetricAlarmCommand({
      AlarmName: 'IVS-API-RedisDown',
      MetricName: 'RedisConnectionFailures',
      Namespace: 'IVS/Production',
      Statistic: 'Sum',
      Period: 60,
      EvaluationPeriods: 2,
      Threshold: 3,
      ComparisonOperator: 'GreaterThanThreshold',
      AlarmActions: [process.env.SNS_TOPIC_ARN!],
    }));

    // 高延遲告警
    await this.cloudwatch.send(new PutMetricAlarmCommand({
      AlarmName: 'IVS-API-HighLatency',
      MetricName: 'APILatency',
      Namespace: 'IVS/Production',
      Statistic: 'Average',
      Period: 300,
      EvaluationPeriods: 2,
      Threshold: 1000, // 1 秒
      ComparisonOperator: 'GreaterThanThreshold',
      AlarmActions: [process.env.SNS_TOPIC_ARN!],
    }));
  }

  // 發送緊急告警
  async sendCriticalAlert(message: string, details: any) {
    await this.sns.send(new PublishCommand({
      TopicArn: process.env.SNS_TOPIC_ARN,
      Subject: '🚨 IVS API 緊急告警',
      Message: JSON.stringify({
        message,
        details,
        timestamp: new Date().toISOString(),
        environment: process.env.NODE_ENV,
      }, null, 2),
    }));
  }
}
```

#### 7.2 健康檢查增強

```typescript
// routes/health.ts (增強版)
router.get('/', async (req: Request, res: Response) => {
  const checks = {
    redis: 'unknown',
    dynamodb: 'unknown',
    aws_ivs: 'unknown',
  };

  let healthy = true;

  // Redis 檢查
  try {
    await redis.ping();
    checks.redis = 'healthy';
  } catch (error) {
    checks.redis = 'unhealthy';
    healthy = false;
  }

  // DynamoDB 檢查
  try {
    const dynamodb = DynamoDBService.getInstance();
    await dynamodb.healthCheck();
    checks.dynamodb = 'healthy';
  } catch (error) {
    checks.dynamodb = 'unhealthy';
    healthy = false;
  }

  // AWS IVS 檢查
  try {
    const ivs = IVSService.getInstance();
    await ivs.healthCheck();
    checks.aws_ivs = 'healthy';
  } catch (error) {
    checks.aws_ivs = 'unhealthy';
    healthy = false;
  }

  const statusCode = healthy ? 200 : 503;

  res.status(statusCode).json({
    success: healthy,
    data: {
      status: healthy ? 'healthy' : 'degraded',
      checks,
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      timestamp: new Date().toISOString(),
    },
  });
});

// Kubernetes/ECS 就緒探針
router.get('/ready', async (req, res) => {
  // 只檢查關鍵依賴
  try {
    await redis.ping();
    res.status(200).send('OK');
  } catch (error) {
    res.status(503).send('Not Ready');
  }
});

// Kubernetes/ECS 存活探針
router.get('/live', (req, res) => {
  res.status(200).send('OK');
});
```

---

### 8. 🐳 Docker 和部署優化

#### 8.1 多階段 Dockerfile

```dockerfile
# Dockerfile
# ==========================================
# Stage 1: 依賴安裝
# ==========================================
FROM node:20-alpine AS dependencies

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production && npm cache clean --force

# ==========================================
# Stage 2: 構建
# ==========================================
FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# ==========================================
# Stage 3: 生產環境
# ==========================================
FROM node:20-alpine AS production

# 安全性
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

WORKDIR /app

# 只複製必要文件
COPY --from=dependencies --chown=nodejs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nodejs:nodejs /app/dist ./dist
COPY --from=builder --chown=nodejs:nodejs /app/package*.json ./

# 健康檢查
HEALTHCHECK --interval=30s --timeout=3s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# 切換到非 root 用戶
USER nodejs

EXPOSE 3000

CMD ["node", "dist/index.js"]
```

#### 8.2 Docker Compose 完善

```yaml
# docker-compose.yml
version: '3.8'

services:
  api:
    build:
      context: ./api-server
      dockerfile: Dockerfile
      target: production
    ports:
      - "3000:3000"
    environment:
      NODE_ENV: production
      REDIS_HOST: redis
      REDIS_PORT: 6379
    env_file:
      - .env.production
    depends_on:
      redis:
        condition: service_healthy
    restart: unless-stopped
    networks:
      - ivs-network
    healthcheck:
      test: ["CMD", "wget", "--quiet", "--tries=1", "--spider", "http://localhost:3000/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    command: redis-server --appendonly yes
    volumes:
      - redis-data:/data
    restart: unless-stopped
    networks:
      - ivs-network
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 3s
      retries: 3

  # Nginx 反向代理（生產環境）
  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf:ro
      - ./ssl:/etc/nginx/ssl:ro
    depends_on:
      - api
    restart: unless-stopped
    networks:
      - ivs-network

volumes:
  redis-data:

networks:
  ivs-network:
    driver: bridge
```

---

## ⚡ 中低優先級優化 (Medium)

### 9. 🔄 CI/CD 流程

```yaml
# .github/workflows/ci.yml
name: CI/CD Pipeline

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main, develop]

jobs:
  test:
    runs-on: ubuntu-latest

    services:
      redis:
        image: redis:7-alpine
        ports:
          - 6379:6379
        options: >-
          --health-cmd "redis-cli ping"
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5

    steps:
      - uses: actions/checkout@v3

      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '20'
          cache: 'npm'
          cache-dependency-path: api-server/package-lock.json

      - name: Install dependencies
        run: |
          cd api-server
          npm ci

      - name: Lint
        run: |
          cd api-server
          npm run lint

      - name: Run tests
        run: |
          cd api-server
          npm run test:coverage
        env:
          REDIS_HOST: localhost
          REDIS_PORT: 6379

      - name: Upload coverage
        uses: codecov/codecov-action@v3
        with:
          files: ./api-server/coverage/lcov.info

  build:
    needs: test
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main'

    steps:
      - uses: actions/checkout@v3

      - name: Configure AWS credentials
        uses: aws-actions/configure-aws-credentials@v2
        with:
          aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
          aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
          aws-region: ap-northeast-1

      - name: Login to Amazon ECR
        id: login-ecr
        uses: aws-actions/amazon-ecr-login@v1

      - name: Build and push Docker image
        env:
          ECR_REGISTRY: ${{ steps.login-ecr.outputs.registry }}
          ECR_REPOSITORY: ivs-api-server
          IMAGE_TAG: ${{ github.sha }}
        run: |
          cd api-server
          docker build -t $ECR_REGISTRY/$ECR_REPOSITORY:$IMAGE_TAG .
          docker push $ECR_REGISTRY/$ECR_REPOSITORY:$IMAGE_TAG
          docker tag $ECR_REGISTRY/$ECR_REPOSITORY:$IMAGE_TAG $ECR_REGISTRY/$ECR_REPOSITORY:latest
          docker push $ECR_REGISTRY/$ECR_REPOSITORY:latest

  deploy:
    needs: build
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main'

    steps:
      - name: Deploy to ECS
        # 使用 AWS ECS 部署
        run: |
          aws ecs update-service \
            --cluster ivs-api-cluster \
            --service ivs-api-service \
            --force-new-deployment
```

---

### 10. 📈 性能優化

#### 10.1 Redis 連接池

```typescript
// services/RedisService.ts (優化版)
import Redis, { Cluster } from 'ioredis';

export class RedisService {
  private client: Redis | Cluster;

  private constructor() {
    const isCluster = process.env.REDIS_CLUSTER === 'true';

    if (isCluster) {
      // Redis Cluster 模式
      this.client = new Redis.Cluster(
        process.env.REDIS_CLUSTER_NODES!.split(',').map(node => {
          const [host, port] = node.split(':');
          return { host, port: parseInt(port) };
        }),
        {
          redisOptions: {
            password: process.env.REDIS_PASSWORD,
            tls: process.env.REDIS_TLS === 'true' ? {} : undefined,
          },
          clusterRetryStrategy: (times) => Math.min(times * 100, 2000),
        }
      );
    } else {
      // 單機模式（帶連接池）
      this.client = new Redis({
        host: process.env.REDIS_HOST,
        port: parseInt(process.env.REDIS_PORT || '6379'),
        password: process.env.REDIS_PASSWORD,
        tls: process.env.REDIS_TLS === 'true' ? {} : undefined,
        retryStrategy: (times) => Math.min(times * 50, 2000),
        maxRetriesPerRequest: 3,
        enableReadyCheck: true,
        enableOfflineQueue: false,
        // 連接池配置
        lazyConnect: false,
        keepAlive: 30000,
      });
    }

    this.setupEventHandlers();
  }

  private setupEventHandlers() {
    this.client.on('error', (error) => {
      logger.error('Redis 錯誤', { error });
      MetricsService.getInstance().recordRedisError();
    });

    this.client.on('reconnecting', () => {
      logger.warn('Redis 重新連接中...');
    });

    this.client.on('ready', () => {
      logger.info('Redis 連接就緒');
    });
  }
}
```

#### 10.2 快取策略

```typescript
// middleware/caching.ts
import { Request, Response, NextFunction } from 'express';
import { RedisService } from '../services/RedisService';

export function cacheMiddleware(duration: number = 60) {
  return async (req: Request, res: Response, next: NextFunction) => {
    // 只快取 GET 請求
    if (req.method !== 'GET') {
      return next();
    }

    const key = `cache:${req.originalUrl}`;
    const redis = RedisService.getInstance();

    try {
      const cached = await redis.get(key);

      if (cached) {
        logger.debug('快取命中', { key });
        return res.json(JSON.parse(cached));
      }

      // 包裝原始的 res.json
      const originalJson = res.json.bind(res);
      res.json = function(body: any) {
        // 快取回應
        redis.setex(key, duration, JSON.stringify(body)).catch(err => {
          logger.error('快取寫入失敗', { error: err });
        });

        return originalJson(body);
      };

      next();
    } catch (error) {
      logger.error('快取中間件錯誤', { error });
      next();
    }
  };
}

// 使用
router.get('/stats', cacheMiddleware(5), async (req, res) => {
  // 統計資料快取 5 秒
});

router.get('/stage/list', cacheMiddleware(30), async (req, res) => {
  // Stage 列表快取 30 秒
});
```

#### 10.3 資料庫查詢優化

```typescript
// services/DynamoDBService.ts (優化版)
import { BatchGetCommand, BatchWriteCommand } from '@aws-sdk/lib-dynamodb';

export class DynamoDBService {
  // 批量查詢
  async batchGetViewerSessions(userIds: string[]) {
    const chunks = this.chunkArray(userIds, 100); // DynamoDB 限制

    const results = await Promise.all(
      chunks.map(chunk =>
        this.docClient.send(new BatchGetCommand({
          RequestItems: {
            [process.env.DYNAMODB_SESSIONS_TABLE!]: {
              Keys: chunk.map(userId => ({ userId })),
            },
          },
        }))
      )
    );

    return results.flatMap(r => r.Responses?.[process.env.DYNAMODB_SESSIONS_TABLE!] || []);
  }

  // 批量寫入
  async batchSaveTokenRecords(tokens: TokenRecord[]) {
    const chunks = this.chunkArray(tokens, 25); // DynamoDB 限制

    await Promise.all(
      chunks.map(chunk =>
        this.docClient.send(new BatchWriteCommand({
          RequestItems: {
            [process.env.DYNAMODB_TOKENS_TABLE!]: chunk.map(token => ({
              PutRequest: { Item: token },
            })),
          },
        }))
      )
    );
  }

  private chunkArray<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }
}
```

---

## 📋 優化實施計劃

### Phase 1: 基礎設施 (Week 1-2)

| 任務 | 優先級 | 工時 |
|------|--------|------|
| 實現請求驗證層（Joi） | 🔴 Critical | 8h |
| 添加單元測試（70% 覆蓋率） | 🔴 Critical | 16h |
| 實現 DynamoDB 持久化 | 🔴 Critical | 16h |
| 設置 Sentry 錯誤追蹤 | 🔴 Critical | 4h |
| **小計** | | **44h** |

### Phase 2: 安全和監控 (Week 3)

| 任務 | 優先級 | 工時 |
|------|--------|------|
| 實現 JWT 認證 | 🟡 High | 8h |
| 改進速率限制 | 🟡 High | 4h |
| 設置 CloudWatch 告警 | 🟡 High | 4h |
| 增強健康檢查 | 🟡 High | 2h |
| **小計** | | **18h** |

### Phase 3: DevOps (Week 4)

| 任務 | 優先級 | 工時 |
|------|--------|------|
| 創建 Dockerfile | 🟢 Medium | 4h |
| 設置 CI/CD Pipeline | 🟢 Medium | 8h |
| API 版本控制 | 🟢 Medium | 4h |
| 性能優化（快取） | 🟢 Medium | 6h |
| **小計** | | **22h** |

**總工時**: ~84 小時 (~2.5 週全職開發)

---

## 📈 預期效果

實施所有優化後：

| 指標 | 當前 | 目標 | 改進 |
|------|------|------|------|
| **生產就緒度** | 5/10 | 9/10 | +80% |
| **測試覆蓋率** | 0% | 70%+ | +70% |
| **錯誤追蹤** | ❌ | ✅ | 100% |
| **數據持久化** | Redis only | Redis + DynamoDB | 可靠性 +100% |
| **API 響應時間** | ~200ms | ~100ms | -50% |
| **安全性評分** | 6/10 | 9/10 | +50% |
| **可維護性** | 7/10 | 9/10 | +29% |

---

## 🎯 立即行動項目（本週完成）

### 1. 請求驗證（8 小時）
- [ ] 安裝並配置 Joi
- [ ] 創建驗證 schemas
- [ ] 更新所有路由使用驗證中間件

### 2. 基礎測試（16 小時）
- [ ] 配置 Jest
- [ ] 編寫 RedisService 測試
- [ ] 編寫 Token API 測試
- [ ] 達到 50% 覆蓋率

### 3. 錯誤追蹤（4 小時）
- [ ] 註冊 Sentry 帳號
- [ ] 集成 Sentry SDK
- [ ] 測試錯誤上報

---

**文檔創建日期**: 2025-10-21
**下次審查**: 2025-11-01
