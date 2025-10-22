/**
 * 統計快照服務
 * 定期將 Redis 中的觀眾統計數據快照到 PostgreSQL
 */

import { RedisService } from './RedisService';
import { PostgresService } from './PostgresService';
import { ViewerRecordService } from './ViewerRecordService';
import { logger } from '../utils/logger';

export class StatsSnapshotService {
  private static instance: StatsSnapshotService;
  private redis: RedisService;
  private db: PostgresService;
  private viewerRecord: ViewerRecordService;
  private snapshotInterval?: NodeJS.Timeout;
  private cleanupInterval?: NodeJS.Timeout;
  private isRunning: boolean = false;

  // 快照間隔：5 分鐘
  private readonly SNAPSHOT_INTERVAL = 5 * 60 * 1000;

  // 清理間隔：每天
  private readonly CLEANUP_INTERVAL = 24 * 60 * 60 * 1000;

  // 保留天數：90 天
  private readonly RETENTION_DAYS = 90;

  private constructor() {
    this.redis = RedisService.getInstance();
    this.db = PostgresService.getInstance();
    this.viewerRecord = ViewerRecordService.getInstance();
  }

  public static getInstance(): StatsSnapshotService {
    if (!StatsSnapshotService.instance) {
      StatsSnapshotService.instance = new StatsSnapshotService();
    }
    return StatsSnapshotService.instance;
  }

  /**
   * 啟動快照服務
   */
  public start(): void {
    if (this.isRunning) {
      logger.warn('統計快照服務已在運行中');
      return;
    }

    this.isRunning = true;
    logger.info('📸 啟動統計快照服務', {
      snapshotInterval: `${this.SNAPSHOT_INTERVAL / 1000}秒`,
      cleanupInterval: `${this.CLEANUP_INTERVAL / 1000}秒`,
      retentionDays: this.RETENTION_DAYS,
    });

    // 定期快照
    this.snapshotInterval = setInterval(async () => {
      await this.takeSnapshot();
    }, this.SNAPSHOT_INTERVAL);

    // 定期清理舊數據
    this.cleanupInterval = setInterval(async () => {
      await this.cleanupOldData();
    }, this.CLEANUP_INTERVAL);

    // 立即執行一次快照
    this.takeSnapshot();
  }

  /**
   * 停止快照服務
   */
  public stop(): void {
    if (this.snapshotInterval) {
      clearInterval(this.snapshotInterval);
      this.snapshotInterval = undefined;
    }

    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = undefined;
    }

    this.isRunning = false;
    logger.info('統計快照服務已停止');
  }

  /**
   * 執行快照：將 Redis 數據同步到 PostgreSQL
   */
  private async takeSnapshot(): Promise<void> {
    try {
      const startTime = Date.now();

      // 獲取所有活躍 Stage
      const stageArns = await this.redis.getActiveStages();

      if (stageArns.length === 0) {
        logger.debug('無活躍 Stage，跳過快照');
        return;
      }

      let savedRecords = 0;

      // 遍歷每個 Stage，保存觀眾數據
      for (const stageArn of stageArns) {
        try {
          const viewerCount = await this.redis.getStageViewerCount(stageArn);

          // 保存到 PostgreSQL
          await this.db.query(
            `INSERT INTO viewer_stats_snapshots
             (stage_arn, snapshot_time, viewer_count)
             VALUES ($1, $2, $3)`,
            [stageArn, new Date(), viewerCount]
          );

          savedRecords++;
        } catch (error: any) {
          logger.error('保存快照失敗', {
            stageArn: stageArn.substring(stageArn.length - 12),
            error: error.message,
          });
        }
      }

      const duration = Date.now() - startTime;
      logger.info('✅ 統計快照完成', {
        savedRecords,
        totalStages: stageArns.length,
        duration: `${duration}ms`,
      });

      // 同時關閉過期的觀眾 Session
      await this.viewerRecord.closeStaleSesDions(10);
    } catch (error: any) {
      logger.error('統計快照失敗', { error: error.message });
    }
  }

  /**
   * 清理舊數據
   */
  private async cleanupOldData(): Promise<void> {
    try {
      const deletedCount = await this.db.cleanupOldData(this.RETENTION_DAYS);

      if (deletedCount > 0) {
        logger.info('🧹 舊數據清理完成', {
          deletedSnapshots: deletedCount,
          retentionDays: this.RETENTION_DAYS,
        });
      }
    } catch (error: any) {
      logger.error('舊數據清理失敗', { error: error.message });
    }
  }

  /**
   * 從 PostgreSQL 恢復數據到 Redis（用於 Redis 重啟後）
   */
  public async restoreFromSnapshot(): Promise<void> {
    try {
      logger.info('🔄 從 PostgreSQL 恢復數據到 Redis...');

      // 獲取最近的快照（每個 Stage 的最新一筆）
      const result = await this.db.query(`
        SELECT DISTINCT ON (stage_arn)
          stage_arn,
          viewer_count,
          snapshot_time
        FROM viewer_stats_snapshots
        WHERE snapshot_time >= NOW() - INTERVAL '1 hour'
        ORDER BY stage_arn, snapshot_time DESC
      `);

      let restoredCount = 0;

      for (const row of result.rows) {
        try {
          // 恢復觀眾計數到 Redis
          const key = `viewers:${row.stage_arn}`;
          await this.redis.set(key, String(row.viewer_count));

          logger.debug('恢復 Stage 數據', {
            stageArn: row.stage_arn.substring(row.stage_arn.length - 12),
            viewerCount: row.viewer_count,
            snapshotTime: row.snapshot_time,
          });

          restoredCount++;
        } catch (error: any) {
          logger.error('恢復 Stage 數據失敗', {
            stageArn: row.stage_arn,
            error: error.message,
          });
        }
      }

      logger.info('✅ 數據恢復完成', {
        restoredStages: restoredCount,
        totalRecords: result.rows.length,
      });
    } catch (error: any) {
      logger.error('數據恢復失敗', { error: error.message });
    }
  }

  /**
   * 手動觸發快照（用於測試或緊急情況）
   */
  public async manualSnapshot(): Promise<void> {
    logger.info('📸 手動觸發快照');
    await this.takeSnapshot();
  }

  /**
   * 獲取快照統計
   */
  public async getSnapshotStats(days: number = 7): Promise<any> {
    try {
      const result = await this.db.query(
        `SELECT
           COUNT(*)::INTEGER as total_snapshots,
           COUNT(DISTINCT stage_arn)::INTEGER as unique_stages,
           MIN(snapshot_time) as earliest_snapshot,
           MAX(snapshot_time) as latest_snapshot
         FROM viewer_stats_snapshots
         WHERE snapshot_time >= NOW() - INTERVAL '1 day' * $1`,
        [days]
      );

      return result.rows[0];
    } catch (error: any) {
      logger.error('獲取快照統計失敗', { error: error.message });
      return null;
    }
  }

  /**
   * 獲取 Stage 的時序數據
   */
  public async getStageTimeSeries(
    stageArn: string,
    hours: number = 24
  ): Promise<any[]> {
    try {
      const result = await this.db.query(
        `SELECT
           snapshot_time,
           viewer_count
         FROM viewer_stats_snapshots
         WHERE stage_arn = $1
           AND snapshot_time >= NOW() - INTERVAL '1 hour' * $2
         ORDER BY snapshot_time ASC`,
        [stageArn, hours]
      );

      return result.rows.map(row => ({
        time: row.snapshot_time,
        viewerCount: row.viewer_count,
      }));
    } catch (error: any) {
      logger.error('獲取時序數據失敗', {
        error: error.message,
        stageArn,
      });
      return [];
    }
  }

  /**
   * 檢查服務狀態
   */
  public isActive(): boolean {
    return this.isRunning;
  }
}

export default StatsSnapshotService;
