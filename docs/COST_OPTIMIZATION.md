# 成本優化方案：Redis + DynamoDB 混合架構

## 🎯 問題

在高流量直播場景中，如果純粹使用 DynamoDB 存儲觀眾心跳數據：

- **10,000 觀眾**每小時產生 **240 萬次請求** (120萬讀 + 122萬寫)
- **每月成本約 $1,320** (僅 DynamoDB)
- **成本過高，不適合生產環境**

---

## ✅ 解決方案：分層存儲架構

### 架構設計

```
┌─────────────────┐
│   前端客戶端     │
└────────┬────────┘
         │ 心跳 (每30秒)
         ▼
┌─────────────────┐
│   API Server    │
└────────┬────────┘
         │
    ┌────┴────┐
    │         │
    ▼         ▼
┌───────┐  ┌──────────────┐
│ Redis │  │  DynamoDB    │
│(熱數據)│  │  (冷數據)    │
└───┬───┘  └──────┬───────┘
    │             │
    │             │
    └─────┬───────┘
          │
    定期同步 (每5分鐘)
```

### 數據分層策略

| 數據類型 | 存儲位置 | 更新頻率 | TTL | 用途 |
|---------|---------|---------|-----|------|
| 觀眾心跳 | **Redis** | 30秒 | 2分鐘 | 實時在線狀態 |
| 觀眾計數 | **Redis** | 實時 | 無 | 實時統計 |
| 觀看記錄 | **DynamoDB** | 5分鐘 | 永久 | 歷史分析、計費 |
| Stage配置 | **DynamoDB** | 創建時 | 永久 | 持久化配置 |

---

## 📝 實現方案

### 方案 1：心跳留在 Redis，定期快照到 DynamoDB

**適合場景**：中小型直播（<50,000 觀眾）

#### 優點
- ✅ 成本極低 (Redis: $22/月)
- ✅ 性能極好 (毫秒級響應)
- ✅ 數據可恢復 (DynamoDB 快照)

#### 缺點
- ⚠️ Redis 重啟會丟失 5 分鐘內的數據
- ⚠️ 不適合需要實時計費的場景

#### 實現代碼

```typescript
// api-server/src/services/SnapshotService.ts

import { RedisService } from './RedisService';
import { DynamoDBService } from './DynamoDBService';
import { logger } from '../utils/logger';

export class SnapshotService {
  private static instance: SnapshotService;
  private redis: RedisService;
  private dynamodb: DynamoDBService;
  private snapshotInterval?: NodeJS.Timeout;

  // 快照間隔: 5 分鐘
  private readonly SNAPSHOT_INTERVAL = 5 * 60 * 1000;

  private constructor() {
    this.redis = RedisService.getInstance();
    this.dynamodb = DynamoDBService.getInstance();
  }

  public static getInstance(): SnapshotService {
    if (!SnapshotService.instance) {
      SnapshotService.instance = new SnapshotService();
    }
    return SnapshotService.instance;
  }

  /**
   * 啟動定期快照
   */
  public start(): void {
    logger.info('📸 啟動定期快照服務', {
      interval: `${this.SNAPSHOT_INTERVAL / 1000}秒`,
    });

    this.snapshotInterval = setInterval(async () => {
      await this.takeSnapshot();
    }, this.SNAPSHOT_INTERVAL);

    // 立即執行一次
    this.takeSnapshot();
  }

  /**
   * 停止快照服務
   */
  public stop(): void {
    if (this.snapshotInterval) {
      clearInterval(this.snapshotInterval);
      this.snapshotInterval = undefined;
      logger.info('快照服務已停止');
    }
  }

  /**
   * 執行快照：將 Redis 數據同步到 DynamoDB
   */
  private async takeSnapshot(): Promise<void> {
    try {
      const startTime = Date.now();

      // 1. 獲取所有活躍 Stage
      const stageArns = await this.redis.getActiveStages();

      if (stageArns.length === 0) {
        logger.debug('無活躍 Stage，跳過快照');
        return;
      }

      let savedRecords = 0;

      // 2. 遍歷每個 Stage，保存觀眾數據
      for (const stageArn of stageArns) {
        const viewerCount = await this.redis.getStageViewerCount(stageArn);

        // 保存到 DynamoDB
        await this.dynamodb.saveViewerSnapshot({
          stageArn,
          timestamp: Date.now(),
          viewerCount,
          ttl: Math.floor(Date.now() / 1000) + 86400 * 30, // 保留 30 天
        });

        savedRecords++;
      }

      const duration = Date.now() - startTime;
      logger.info('✅ 快照完成', {
        savedRecords,
        duration: `${duration}ms`,
      });
    } catch (error: any) {
      logger.error('快照失敗', { error: error.message });
    }
  }

  /**
   * 從 DynamoDB 恢復數據到 Redis
   * (用於 Redis 重啟後)
   */
  public async restoreFromSnapshot(): Promise<void> {
    try {
      logger.info('🔄 從 DynamoDB 恢復數據...');

      const snapshots = await this.dynamodb.getRecentSnapshots(10);

      for (const snapshot of snapshots) {
        // 恢復觀眾計數
        await this.redis.set(
          `viewers:${snapshot.stageArn}`,
          String(snapshot.viewerCount)
        );
      }

      logger.info('✅ 數據恢復完成', { restoredStages: snapshots.length });
    } catch (error: any) {
      logger.error('數據恢復失敗', { error: error.message });
    }
  }
}
```

```typescript
// api-server/src/services/DynamoDBService.ts

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  PutCommand,
  QueryCommand,
} from '@aws-sdk/lib-dynamodb';
import { logger } from '../utils/logger';

interface ViewerSnapshot {
  stageArn: string;
  timestamp: number;
  viewerCount: number;
  ttl: number;
}

export class DynamoDBService {
  private static instance: DynamoDBService;
  private docClient: DynamoDBDocumentClient;
  private readonly TABLE_NAME = process.env.DYNAMODB_TABLE || 'ivs-viewer-snapshots';

  private constructor() {
    const client = new DynamoDBClient({
      region: process.env.AWS_REGION || 'us-east-1',
    });

    this.docClient = DynamoDBDocumentClient.from(client, {
      marshallOptions: {
        removeUndefinedValues: true,
      },
    });
  }

  public static getInstance(): DynamoDBService {
    if (!DynamoDBService.instance) {
      DynamoDBService.instance = new DynamoDBService();
    }
    return DynamoDBService.instance;
  }

  /**
   * 保存快照到 DynamoDB
   */
  async saveViewerSnapshot(snapshot: ViewerSnapshot): Promise<void> {
    try {
      await this.docClient.send(
        new PutCommand({
          TableName: this.TABLE_NAME,
          Item: {
            pk: `STAGE#${snapshot.stageArn}`,
            sk: `SNAPSHOT#${snapshot.timestamp}`,
            ...snapshot,
          },
        })
      );
    } catch (error: any) {
      logger.error('保存快照失敗', { error: error.message });
      throw error;
    }
  }

  /**
   * 獲取最近的快照
   */
  async getRecentSnapshots(limit: number = 10): Promise<ViewerSnapshot[]> {
    try {
      // 這裡需要使用 GSI 或 Scan，簡化示範
      const result = await this.docClient.send(
        new QueryCommand({
          TableName: this.TABLE_NAME,
          Limit: limit,
          ScanIndexForward: false, // 倒序
        })
      );

      return (result.Items || []) as ViewerSnapshot[];
    } catch (error: any) {
      logger.error('獲取快照失敗', { error: error.message });
      return [];
    }
  }
}
```

#### 成本對比

| 方案 | 每月成本 | 數據丟失風險 | 性能 |
|------|---------|-------------|------|
| **純 DynamoDB** | $1,320 | 無 | 中等 |
| **純 Redis** | $22 | 高 (重啟丟失全部) | 極好 |
| **Redis + DynamoDB 快照 (推薦)** | $24 | 低 (最多5分鐘) | 極好 |

**節省成本：98.2%** 🎉

---

### 方案 2：心跳批量寫入 DynamoDB

**適合場景**：需要實時計費或審計的直播平台

#### 優點
- ✅ 數據完整性高
- ✅ 適合計費場景
- ✅ 成本可控（批量寫入）

#### 缺點
- ⚠️ 實現複雜度較高
- ⚠️ 仍需 Redis 做快取

#### 實現策略

```typescript
// 批量寫入服務
export class BatchWriteService {
  private buffer: ViewerHeartbeat[] = [];
  private readonly BATCH_SIZE = 25; // DynamoDB 批量寫入限制
  private readonly FLUSH_INTERVAL = 30000; // 30秒

  async addHeartbeat(heartbeat: ViewerHeartbeat): Promise<void> {
    this.buffer.push(heartbeat);

    if (this.buffer.length >= this.BATCH_SIZE) {
      await this.flush();
    }
  }

  private async flush(): Promise<void> {
    if (this.buffer.length === 0) return;

    const batch = this.buffer.splice(0, this.BATCH_SIZE);

    // 使用 BatchWriteItem (25 items/batch)
    await this.dynamodb.batchWrite(batch);
  }
}
```

#### 成本優化

通過批量寫入，可將成本降低 **60-80%**：

```
原成本: $1,320/月
優化後: $250-500/月 (取決於批量大小)
```

---

## 🏆 最終推薦

### 推薦方案：**Redis 主 + DynamoDB 定期快照**

#### 為什麼？

1. **成本極低**：$24/月 vs $1,320/月 (節省 98%)
2. **性能極好**：所有讀寫都在 Redis (毫秒級)
3. **數據安全**：每 5 分鐘備份到 DynamoDB
4. **易於實現**：只需添加 SnapshotService

#### 部署步驟

1. **創建 DynamoDB 表**
   ```bash
   aws dynamodb create-table \
     --table-name ivs-viewer-snapshots \
     --attribute-definitions \
       AttributeName=pk,AttributeType=S \
       AttributeName=sk,AttributeType=S \
     --key-schema \
       AttributeName=pk,KeyType=HASH \
       AttributeName=sk,KeyType=RANGE \
     --billing-mode PAY_PER_REQUEST \
     --time-to-live-specification \
       Enabled=true,AttributeName=ttl
   ```

2. **啟用快照服務**
   ```typescript
   // api-server/src/index.ts
   import { SnapshotService } from './services/SnapshotService';

   // 啟動快照服務
   const snapshotService = SnapshotService.getInstance();
   snapshotService.start();
   ```

3. **Redis 重啟時恢復**
   ```typescript
   // 啟動時檢查 Redis 是否為空
   const totalViewers = await redis.getTotalViewerCount();
   if (totalViewers === 0) {
     await snapshotService.restoreFromSnapshot();
   }
   ```

---

## 📊 成本總結

### 10,000 觀眾場景

| 項目 | 方案 1 (純DynamoDB) | 方案 2 (推薦) | 節省 |
|------|-------------------|-------------|------|
| Redis | - | $22/月 | - |
| DynamoDB | $1,320/月 | $2/月 | -$1,318 |
| **總計** | **$1,320/月** | **$24/月** | **98.2%** |

### 50,000 觀眾場景

| 項目 | 方案 1 (純DynamoDB) | 方案 2 (推薦) | 節省 |
|------|-------------------|-------------|------|
| Redis | - | $88/月 (r6g.large) | - |
| DynamoDB | $6,600/月 | $10/月 | -$6,590 |
| **總計** | **$6,600/月** | **$98/月** | **98.5%** |

---

## 🎯 結論

**不要將心跳數據直接寫入 DynamoDB**，這會導致成本暴增。

採用 **Redis (熱數據) + DynamoDB (冷數據快照)** 的混合架構：
- ✅ 性能優秀 (Redis 毫秒級響應)
- ✅ 成本極低 (節省 98%)
- ✅ 數據安全 (定期快照到 DynamoDB)
- ✅ 易於實現 (只需添加快照服務)

這是**生產環境的最佳實踐**。
