/**
 * 觀眾記錄服務
 * 負責將觀眾觀看數據持久化到 PostgreSQL
 */

import { PostgresService } from './PostgresService';
import { logger } from '../utils/logger';

interface ViewerSession {
  userId: string;
  stageArn: string;
  participantId: string;
  joinedAt: Date;
  userAgent?: string;
  ipAddress?: string;
  countryCode?: string;
}

interface ViewerHistory {
  id: number;
  userId: string;
  stageArn: string;
  participantId: string;
  joinedAt: Date;
  leftAt: Date | null;
  watchDurationSeconds: number | null;
}

interface StageStats {
  stageArn: string;
  totalViews: number;
  uniqueViewers: number;
  avgWatchDuration: number;
  maxWatchDuration: number;
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
  public async recordJoin(session: ViewerSession): Promise<number | null> {
    try {
      const result = await this.db.query(
        `INSERT INTO viewer_sessions
         (user_id, stage_arn, participant_id, joined_at, user_agent, ip_address, country_code)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id`,
        [
          session.userId,
          session.stageArn,
          session.participantId,
          session.joinedAt,
          session.userAgent || null,
          session.ipAddress || null,
          session.countryCode || null,
        ]
      );

      const sessionId = result.rows[0].id;
      logger.info('📝 觀看記錄已保存', {
        sessionId,
        userId: session.userId,
        stageArn: session.stageArn.substring(session.stageArn.length - 12),
      });

      return sessionId;
    } catch (error: any) {
      logger.error('保存觀看記錄失敗', {
        error: error.message,
        userId: session.userId,
      });
      // 不拋出異常，避免影響主流程
      return null;
    }
  }

  /**
   * 記錄觀眾離開（更新資料庫）
   */
  public async recordLeave(userId: string, stageArn: string): Promise<boolean> {
    try {
      const leftAt = new Date();

      const result = await this.db.query(
        `UPDATE viewer_sessions
         SET left_at = $1,
             watch_duration_seconds = EXTRACT(EPOCH FROM ($1 - joined_at))::INTEGER
         WHERE user_id = $2
           AND stage_arn = $3
           AND left_at IS NULL
         RETURNING id, watch_duration_seconds`,
        [leftAt, userId, stageArn]
      );

      if (result.rowCount && result.rowCount > 0) {
        const duration = result.rows[0].watch_duration_seconds;
        logger.info('📝 觀看記錄已更新', {
          userId,
          stageArn: stageArn.substring(stageArn.length - 12),
          watchDuration: `${duration}s`,
        });
        return true;
      } else {
        logger.warn('未找到對應的觀看記錄', { userId, stageArn });
        return false;
      }
    } catch (error: any) {
      logger.error('更新觀看記錄失敗', {
        error: error.message,
        userId,
      });
      // 不拋出異常，避免影響主流程
      return false;
    }
  }

  /**
   * 獲取觀眾的觀看歷史
   */
  public async getViewerHistory(
    userId: string,
    limit: number = 10
  ): Promise<ViewerHistory[]> {
    try {
      const result = await this.db.query(
        `SELECT
           id,
           user_id,
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

      return result.rows.map((row: any) => ({
        id: row.id,
        userId: row.user_id,
        stageArn: row.stage_arn,
        participantId: row.participant_id,
        joinedAt: row.joined_at,
        leftAt: row.left_at,
        watchDurationSeconds: row.watch_duration_seconds,
      }));
    } catch (error: any) {
      logger.error('獲取觀看歷史失敗', {
        error: error.message,
        userId,
      });
      return [];
    }
  }

  /**
   * 獲取 Stage 的統計數據
   */
  public async getStageStats(
    stageArn: string,
    days: number = 7
  ): Promise<StageStats | null> {
    try {
      const result = await this.db.query(
        `SELECT
           $1 as stage_arn,
           COUNT(*)::INTEGER as total_views,
           COUNT(DISTINCT user_id)::INTEGER as unique_viewers,
           COALESCE(ROUND(AVG(watch_duration_seconds)), 0)::INTEGER as avg_watch_duration,
           COALESCE(MAX(watch_duration_seconds), 0)::INTEGER as max_watch_duration
         FROM viewer_sessions
         WHERE stage_arn = $1
           AND joined_at >= NOW() - INTERVAL '1 day' * $2`,
        [stageArn, days]
      );

      if (result.rows.length === 0) {
        return null;
      }

      const row = result.rows[0];
      return {
        stageArn: row.stage_arn,
        totalViews: row.total_views,
        uniqueViewers: row.unique_viewers,
        avgWatchDuration: row.avg_watch_duration,
        maxWatchDuration: row.max_watch_duration,
      };
    } catch (error: any) {
      logger.error('獲取統計數據失敗', {
        error: error.message,
        stageArn,
      });
      return null;
    }
  }

  /**
   * 獲取所有活躍觀眾（最近 5 分鐘加入且未離開）
   */
  public async getActiveViewers(stageArn?: string): Promise<any[]> {
    try {
      const query = stageArn
        ? `SELECT
             user_id,
             stage_arn,
             participant_id,
             joined_at,
             EXTRACT(EPOCH FROM (NOW() - joined_at))::INTEGER as duration_seconds
           FROM viewer_sessions
           WHERE stage_arn = $1
             AND left_at IS NULL
             AND joined_at >= NOW() - INTERVAL '5 minutes'
           ORDER BY joined_at DESC`
        : `SELECT
             user_id,
             stage_arn,
             participant_id,
             joined_at,
             EXTRACT(EPOCH FROM (NOW() - joined_at))::INTEGER as duration_seconds
           FROM viewer_sessions
           WHERE left_at IS NULL
             AND joined_at >= NOW() - INTERVAL '5 minutes'
           ORDER BY joined_at DESC`;

      const params = stageArn ? [stageArn] : [];
      const result = await this.db.query(query, params);

      return result.rows.map((row: any) => ({
        userId: row.user_id,
        stageArn: row.stage_arn,
        participantId: row.participant_id,
        joinedAt: row.joined_at,
        durationSeconds: row.duration_seconds,
      }));
    } catch (error: any) {
      logger.error('獲取活躍觀眾失敗', { error: error.message });
      return [];
    }
  }

  /**
   * 批量更新離開時間（用於定期清理未正常離開的觀眾）
   */
  public async closeStaleSesDions(timeoutMinutes: number = 10): Promise<number> {
    try {
      const result = await this.db.query(
        `UPDATE viewer_sessions
         SET left_at = joined_at + INTERVAL '1 minute' * $1,
             watch_duration_seconds = $1 * 60
         WHERE left_at IS NULL
           AND joined_at < NOW() - INTERVAL '1 minute' * $1
         RETURNING id`,
        [timeoutMinutes]
      );

      const closedCount = result.rowCount || 0;

      if (closedCount > 0) {
        logger.info('🧹 關閉過期 Session', {
          closedCount,
          timeoutMinutes,
        });
      }

      return closedCount;
    } catch (error: any) {
      logger.error('關閉過期 Session 失敗', { error: error.message });
      return 0;
    }
  }

  /**
   * 獲取觀眾總數（歷史記錄）
   */
  public async getTotalViewerCount(): Promise<number> {
    try {
      const result = await this.db.query(
        'SELECT COUNT(DISTINCT user_id)::INTEGER as count FROM viewer_sessions'
      );
      return result.rows[0].count;
    } catch (error: any) {
      logger.error('獲取觀眾總數失敗', { error: error.message });
      return 0;
    }
  }
}

export default ViewerRecordService;
