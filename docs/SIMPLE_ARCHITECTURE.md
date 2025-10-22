# 簡化架構方案：單 Server + 傳統資料庫

## 🎯 方案概述

將直播 API 與網站 API 部署在同一台 Server，使用**傳統資料庫**（PostgreSQL/MySQL）存儲冷數據，Redis 僅用於熱數據快取。

---

## 🏗️ 架構設計

```
┌─────────────────────────────────────────┐
│         單一 Server (EC2/VPS)            │
│                                         │
│  ┌──────────────┐  ┌─────────────────┐ │
│  │  網站 API    │  │   直播 API      │ │
│  │  (Express)   │  │   (Express)     │ │
│  └──────┬───────┘  └────────┬────────┘ │
│         │                   │          │
│         └─────────┬─────────┘          │
│                   │                    │
│         ┌─────────▼─────────┐          │
│         │   共享 Redis       │          │
│         │   (熱數據快取)      │          │
│         └─────────┬─────────┘          │
│                   │                    │
└───────────────────┼────────────────────┘
                    │
            ┌───────▼───────┐
            │  PostgreSQL   │
            │  (冷數據存儲)   │
            └───────────────┘
```

---

## 📊 數據分層策略

### 熱數據 → Redis (記憶體快取)

| 數據類型 | Key 格式 | TTL | 說明 |
|---------|---------|-----|------|
| 觀眾心跳 | `viewer:{userId}:{stageArn}` | 120秒 | 實時在線狀態 |
| 觀眾計數 | `viewers:{stageArn}` | 無 | 實時統計 |
| Stage 列表 | `stage:{stageArn}:viewers` | 無 | 在線觀眾 Set |

**特點**：
- ✅ 毫秒級響應
- ✅ 高頻讀寫不影響資料庫
- ⚠️ Server 重啟會丟失（可接受，只是計數歸零）

### 冷數據 → PostgreSQL (持久化存儲)

| 數據類型 | 表名 | 更新頻率 | 說明 |
|---------|------|---------|------|
| 觀看記錄 | `viewer_sessions` | 離開時寫入 | 完整觀看記錄 |
| 觀眾統計 | `viewer_stats` | 每5分鐘 | 時序統計數據 |
| Stage 配置 | `stages` | 創建時 | Stage 元數據 |
| 用戶資訊 | `users` | 註冊時 | 用戶基本資料 |

**特點**：
- ✅ 數據永久保存
- ✅ 可用於分析和報表
- ✅ 低頻寫入，不影響性能

---

## 🗄️ 資料庫 Schema 設計

### PostgreSQL Schema

```sql
-- ==========================================
-- 1. Stage 配置表
-- ==========================================
CREATE TABLE stages (
  id SERIAL PRIMARY KEY,
  stage_arn VARCHAR(255) UNIQUE NOT NULL,
  stage_name VARCHAR(100),
  is_master BOOLEAN DEFAULT false,
  max_viewers INTEGER DEFAULT 50,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  INDEX idx_stage_arn (stage_arn),
  INDEX idx_is_master (is_master)
);

-- ==========================================
-- 2. 觀眾會話記錄表
-- ==========================================
CREATE TABLE viewer_sessions (
  id SERIAL PRIMARY KEY,
  user_id VARCHAR(100) NOT NULL,
  stage_arn VARCHAR(255) NOT NULL,
  participant_id VARCHAR(255),

  -- 時間記錄
  joined_at TIMESTAMP NOT NULL,
  left_at TIMESTAMP,
  watch_duration_seconds INTEGER,

  -- 元數據
  user_agent TEXT,
  ip_address INET,
  country_code VARCHAR(2),

  -- 索引
  INDEX idx_user_id (user_id),
  INDEX idx_stage_arn (stage_arn),
  INDEX idx_joined_at (joined_at),
  INDEX idx_left_at (left_at)
);

-- ==========================================
-- 3. 觀眾統計快照表（時序數據）
-- ==========================================
CREATE TABLE viewer_stats_snapshots (
  id SERIAL PRIMARY KEY,
  stage_arn VARCHAR(255) NOT NULL,
  snapshot_time TIMESTAMP NOT NULL,
  viewer_count INTEGER NOT NULL,

  INDEX idx_stage_time (stage_arn, snapshot_time)
);

-- 自動清理 30 天前的快照（可選）
CREATE INDEX idx_snapshot_time ON viewer_stats_snapshots(snapshot_time);

-- ==========================================
-- 4. 用戶表（如果需要）
-- ==========================================
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  user_id VARCHAR(100) UNIQUE NOT NULL,
  username VARCHAR(50),
  email VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  INDEX idx_user_id (user_id)
);
```

---

## 💻 實現代碼

### 1. PostgreSQL Service

```typescript
// api-server/src/services/PostgresService.ts

import { Pool, PoolClient } from 'pg';
import { logger } from '../utils/logger';

export class PostgresService {
  private static instance: PostgresService;
  private pool: Pool;

  private constructor() {
    this.pool = new Pool({
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '5432'),
      database: process.env.DB_NAME || 'ivs_live',
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD,
      max: 20, // 連接池大小
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    });

    this.pool.on('error', (err) => {
      logger.error('PostgreSQL 連接池錯誤', { error: err.message });
    });

    logger.info('PostgreSQL 連接池已初始化');
  }

  public static getInstance(): PostgresService {
    if (!PostgresService.instance) {
      PostgresService.instance = new PostgresService();
    }
    return PostgresService.instance;
  }

  public getPool(): Pool {
    return this.pool;
  }

  public async query(text: string, params?: any[]): Promise<any> {
    const start = Date.now();
    try {
      const result = await this.pool.query(text, params);
      const duration = Date.now() - start;

      logger.debug('SQL 查詢完成', { duration, rows: result.rowCount });
      return result;
    } catch (error: any) {
      logger.error('SQL 查詢失敗', { error: error.message, query: text });
      throw error;
    }
  }

  public async disconnect(): Promise<void> {
    await this.pool.end();
    logger.info('PostgreSQL 連接池已關閉');
  }
}
```

### 2. 觀看記錄服務

```typescript
// api-server/src/services/ViewerRecordService.ts

import { PostgresService } from './PostgresService';
import { logger } from '../utils/logger';

interface ViewerSession {
  userId: string;
  stageArn: string;
  participantId: string;
  joinedAt: Date;
  userAgent?: string;
  ipAddress?: string;
}

export class ViewerRecordService {
  private static instance: ViewerRecordService;
  private db: PostgresService;

  private constructor() {
    this.db = PostgresService.getInstance();
  }

  public static getInstance(): ViewerRecordService {
    if (!ViewerRecordService.instance) {
      ViewerRecordService.instance = new ViewerRecordService();
    }
    return ViewerRecordService.instance;
  }

  /**
   * 記錄觀眾加入（寫入資料庫）
   */
  async recordJoin(session: ViewerSession): Promise<number> {
    try {
      const result = await this.db.query(
        `INSERT INTO viewer_sessions
         (user_id, stage_arn, participant_id, joined_at, user_agent, ip_address)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id`,
        [
          session.userId,
          session.stageArn,
          session.participantId,
          session.joinedAt,
          session.userAgent,
          session.ipAddress,
        ]
      );

      const sessionId = result.rows[0].id;
      logger.info('📝 觀看記錄已保存', { sessionId, userId: session.userId });
      return sessionId;
    } catch (error: any) {
      logger.error('保存觀看記錄失敗', { error: error.message });
      throw error;
    }
  }

  /**
   * 記錄觀眾離開（更新資料庫）
   */
  async recordLeave(userId: string, stageArn: string): Promise<void> {
    try {
      const leftAt = new Date();

      await this.db.query(
        `UPDATE viewer_sessions
         SET left_at = $1,
             watch_duration_seconds = EXTRACT(EPOCH FROM ($1 - joined_at))::INTEGER
         WHERE user_id = $2
           AND stage_arn = $3
           AND left_at IS NULL`,
        [leftAt, userId, stageArn]
      );

      logger.info('📝 觀看記錄已更新', { userId });
    } catch (error: any) {
      logger.error('更新觀看記錄失敗', { error: error.message });
      // 不拋出異常，避免影響主流程
    }
  }

  /**
   * 獲取觀眾的觀看歷史
   */
  async getViewerHistory(userId: string, limit: number = 10): Promise<any[]> {
    try {
      const result = await this.db.query(
        `SELECT
           stage_arn,
           participant_id,
           joined_at,
           left_at,
           watch_duration_seconds
         FROM viewer_sessions
         WHERE user_id = $1
         ORDER BY joined_at DESC
         LIMIT $2`,
        [userId, limit]
      );

      return result.rows;
    } catch (error: any) {
      logger.error('獲取觀看歷史失敗', { error: error.message });
      return [];
    }
  }

  /**
   * 獲取 Stage 的統計數據
   */
  async getStageStats(stageArn: string, days: number = 7): Promise<any> {
    try {
      const result = await this.db.query(
        `SELECT
           COUNT(*) as total_views,
           COUNT(DISTINCT user_id) as unique_viewers,
           AVG(watch_duration_seconds) as avg_watch_duration,
           MAX(watch_duration_seconds) as max_watch_duration
         FROM viewer_sessions
         WHERE stage_arn = $1
           AND joined_at >= NOW() - INTERVAL '${days} days'`,
        [stageArn]
      );

      return result.rows[0];
    } catch (error: any) {
      logger.error('獲取統計數據失敗', { error: error.message });
      return null;
    }
  }
}
```

### 3. 定期快照服務（簡化版）

```typescript
// api-server/src/services/StatsSnapshotService.ts

import { RedisService } from './RedisService';
import { PostgresService } from './PostgresService';
import { logger } from '../utils/logger';

export class StatsSnapshotService {
  private static instance: StatsSnapshotService;
  private redis: RedisService;
  private db: PostgresService;
  private snapshotInterval?: NodeJS.Timeout;

  private readonly SNAPSHOT_INTERVAL = 5 * 60 * 1000; // 5 分鐘

  private constructor() {
    this.redis = RedisService.getInstance();
    this.db = PostgresService.getInstance();
  }

  public static getInstance(): StatsSnapshotService {
    if (!StatsSnapshotService.instance) {
      StatsSnapshotService.instance = new StatsSnapshotService();
    }
    return StatsSnapshotService.instance;
  }

  public start(): void {
    logger.info('📸 啟動統計快照服務', {
      interval: `${this.SNAPSHOT_INTERVAL / 1000}秒`,
    });

    this.snapshotInterval = setInterval(async () => {
      await this.takeSnapshot();
    }, this.SNAPSHOT_INTERVAL);

    // 立即執行一次
    this.takeSnapshot();
  }

  public stop(): void {
    if (this.snapshotInterval) {
      clearInterval(this.snapshotInterval);
      this.snapshotInterval = undefined;
      logger.info('統計快照服務已停止');
    }
  }

  private async takeSnapshot(): Promise<void> {
    try {
      const stageArns = await this.redis.getActiveStages();

      for (const stageArn of stageArns) {
        const viewerCount = await this.redis.getStageViewerCount(stageArn);

        // 保存到資料庫
        await this.db.query(
          `INSERT INTO viewer_stats_snapshots
           (stage_arn, snapshot_time, viewer_count)
           VALUES ($1, $2, $3)`,
          [stageArn, new Date(), viewerCount]
        );
      }

      logger.debug('📸 統計快照已保存', { stageCount: stageArns.length });
    } catch (error: any) {
      logger.error('統計快照失敗', { error: error.message });
    }
  }
}
```

### 4. 修改觀眾路由（加入資料庫記錄）

```typescript
// api-server/src/routes/viewer.ts

import { ViewerRecordService } from '../services/ViewerRecordService';

// 在觀眾加入時
router.post('/rejoin', async (req: Request, res: Response) => {
  // ... 原有邏輯 ...

  // 1. 更新 Redis (即時)
  await heartbeat.recordViewerJoin(userId, stageArn, participantId);
  await redis.incrementViewerCount(stageArn);

  // 2. 寫入資料庫 (持久化) - 不阻塞響應
  ViewerRecordService.getInstance()
    .recordJoin({
      userId,
      stageArn,
      participantId,
      joinedAt: new Date(),
      userAgent: req.headers['user-agent'],
      ipAddress: req.ip,
    })
    .catch(err => logger.error('寫入觀看記錄失敗', { error: err.message }));

  // 3. 立即返回響應
  sendSuccess(res, { /* ... */ });
});

// 在觀眾離開時
router.post('/leave', async (req: Request, res: Response) => {
  // 1. 更新 Redis
  await heartbeat.recordViewerLeave(userId, stageArn);

  // 2. 更新資料庫 - 不阻塞響應
  ViewerRecordService.getInstance()
    .recordLeave(userId, stageArn)
    .catch(err => logger.error('更新觀看記錄失敗', { error: err.message }));

  sendSuccess(res, { /* ... */ });
});
```

---

## 💰 成本分析

### Server 配置建議

| 觀眾規模 | Server 規格 | 月費 | 資料庫 | 總成本 |
|---------|-----------|------|--------|--------|
| < 1,000 | t3.small (2GB) | $15 | 內建 PostgreSQL | **$15/月** |
| < 5,000 | t3.medium (4GB) | $30 | 內建 PostgreSQL | **$30/月** |
| < 10,000 | t3.large (8GB) | $60 | RDS t3.micro | **$75/月** |
| < 50,000 | c5.xlarge (8GB) | $120 | RDS t3.small | **$145/月** |

### 與其他方案對比

| 方案 | 10,000 觀眾成本 | 複雜度 | 可靠性 |
|------|----------------|--------|--------|
| 純 DynamoDB | $1,320/月 | 低 | 極高 |
| Redis + DynamoDB 快照 | $24/月 | 中 | 高 |
| **單 Server + PostgreSQL (推薦)** | **$75/月** | **低** | **高** |

---

## ✅ 優點

1. **成本極低**：$75/月 vs $1,320/月（省 94%）
2. **架構簡單**：無需管理多個 AWS 服務
3. **開發容易**：傳統 SQL，團隊熟悉
4. **易於擴展**：可隨時升級 Server 規格
5. **數據分析方便**：SQL 查詢強大
6. **備份簡單**：pg_dump 定期備份即可

---

## ⚠️ 注意事項

### 1. 資料庫連接池優化

```typescript
// 避免連接耗盡
const pool = new Pool({
  max: 20, // 不要設太大
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});
```

### 2. 異步寫入資料庫

```typescript
// ❌ 錯誤：同步等待資料庫
await db.recordJoin(...);
return res.json(...);

// ✅ 正確：異步寫入，立即返回
db.recordJoin(...).catch(err => logger.error(err));
return res.json(...);
```

### 3. 定期清理舊數據

```sql
-- 每月清理 90 天前的快照數據
DELETE FROM viewer_stats_snapshots
WHERE snapshot_time < NOW() - INTERVAL '90 days';
```

### 4. 建立適當索引

```sql
-- 觀看記錄查詢優化
CREATE INDEX idx_user_stage ON viewer_sessions(user_id, stage_arn);
CREATE INDEX idx_joined_at ON viewer_sessions(joined_at);
```

---

## 🎯 最終建議

### 適合場景

✅ **強烈推薦使用**，如果：
- 觀眾規模 < 50,000
- 已有網站 API 基礎設施
- 團隊熟悉傳統資料庫
- 預算有限
- 需要數據分析功能

❌ **不推薦使用**，如果：
- 觀眾規模 > 100,000
- 需要多區域部署
- 需要極高可用性 (99.99%)
- 有充足預算

---

## 🚀 部署步驟

### 1. 安裝 PostgreSQL
```bash
# Ubuntu
sudo apt install postgresql postgresql-contrib

# 或使用 Docker
docker run -d \
  --name postgres \
  -e POSTGRES_PASSWORD=your_password \
  -p 5432:5432 \
  postgres:15
```

### 2. 創建資料庫
```bash
psql -U postgres
CREATE DATABASE ivs_live;
\c ivs_live
-- 執行上面的 Schema SQL
```

### 3. 安裝依賴
```bash
npm install pg
```

### 4. 設置環境變數
```env
DB_HOST=localhost
DB_PORT=5432
DB_NAME=ivs_live
DB_USER=postgres
DB_PASSWORD=your_password
```

### 5. 啟動服務
```typescript
// api-server/src/index.ts
import { StatsSnapshotService } from './services/StatsSnapshotService';

// 啟動快照服務
StatsSnapshotService.getInstance().start();
```

---

## 📈 擴展路徑

當業務增長時，可平滑升級：

```
階段 1: 單 Server + PostgreSQL ($75/月)
  ↓ 觀眾突破 50,000
階段 2: Server + RDS (讀寫分離) ($200/月)
  ↓ 觀眾突破 100,000
階段 3: 多 Server + ElastiCache + RDS ($500/月)
  ↓ 觀眾突破 500,000
階段 4: 微服務 + DynamoDB ($1,500/月)
```

**結論**：從簡單開始，按需擴展，避免過度設計！
