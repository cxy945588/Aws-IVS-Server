/**
 * 觀眾心跳檢測服務
 * 追蹤觀眾在線狀態，自動清理離線觀眾
 */

import { RedisService } from './RedisService';
import { logger } from '../utils/logger';

interface ViewerSession {
  userId: string;
  stageArn: string;
  participantId: string;
  joinedAt: number;
  lastHeartbeat: number;
}

export class ViewerHeartbeatService {
  private static instance: ViewerHeartbeatService;
  private redis: RedisService;
  private cleanupInterval?: NodeJS.Timeout;
  private isRunning: boolean = false;
  
  // 心跳超時時間（秒）
  private readonly HEARTBEAT_TIMEOUT = 60; // 60 秒沒心跳就視為離線
  
  // 清理間隔（毫秒）
  private readonly CLEANUP_INTERVAL = 30000; // 每 30 秒檢查一次

  private constructor() {
    this.redis = RedisService.getInstance();
    logger.info('Viewer Heartbeat Service 初始化完成');
  }

  public static getInstance(): ViewerHeartbeatService {
    if (!ViewerHeartbeatService.instance) {
      ViewerHeartbeatService.instance = new ViewerHeartbeatService();
    }
    return ViewerHeartbeatService.instance;
  }

  /**
   * 啟動心跳檢測
   */
  public startMonitoring(): void {
    if (this.isRunning) {
      logger.warn('Viewer Heartbeat 已在運行中');
      return;
    }

    this.isRunning = true;
    logger.info('💓 啟動 Viewer Heartbeat 監控', {
      timeout: `${this.HEARTBEAT_TIMEOUT}s`,
      cleanupInterval: `${this.CLEANUP_INTERVAL}ms`,
    });

    // 定期清理離線觀眾
    this.cleanupInterval = setInterval(() => {
      this.cleanupInactiveViewers();
    }, this.CLEANUP_INTERVAL);
  }

  /**
   * 停止心跳檢測
   */
  public stopMonitoring(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = undefined;
      this.isRunning = false;
      logger.info('Viewer Heartbeat 監控已停止');
    }
  }

  /**
   * 記錄觀眾加入
   */
  public async recordViewerJoin(
    userId: string,
    stageArn: string,
    participantId: string
  ): Promise<void> {
    try {
      const session: ViewerSession = {
        userId,
        stageArn,
        participantId,
        joinedAt: Date.now(),
        lastHeartbeat: Date.now(),
      };

      const key = this.getViewerKey(userId, stageArn);
      await this.redis.set(key, JSON.stringify(session), this.HEARTBEAT_TIMEOUT * 2);
      
      // 加入到 Stage 的觀眾集合
      await this.redis.sadd(`stage:${stageArn}:viewers`, userId);

      logger.info('👤 觀眾加入', {
        userId,
        participantId,
        stageArn: stageArn.substring(stageArn.length - 12),
      });
    } catch (error: any) {
      logger.error('記錄觀眾加入失敗', { error: error.message });
    }
  }

  /**
   * 更新觀眾心跳
   */
  public async updateViewerHeartbeat(userId: string, stageArn: string): Promise<boolean> {
    try {
      const key = this.getViewerKey(userId, stageArn);
      const sessionData = await this.redis.get(key);

      if (!sessionData) {
        logger.warn('觀眾 Session 不存在', { userId, stageArn });
        return false;
      }

      const session: ViewerSession = JSON.parse(sessionData);
      session.lastHeartbeat = Date.now();

      await this.redis.set(key, JSON.stringify(session), this.HEARTBEAT_TIMEOUT * 2);

      logger.debug('💓 心跳更新', {
        userId,
        stageArn: stageArn.substring(stageArn.length - 12),
      });

      return true;
    } catch (error: any) {
      logger.error('更新心跳失敗', { error: error.message });
      return false;
    }
  }

  /**
   * 記錄觀眾離開
   */
  public async recordViewerLeave(userId: string, stageArn: string): Promise<void> {
    try {
      const key = this.getViewerKey(userId, stageArn);
      const sessionData = await this.redis.get(key);

      if (sessionData) {
        const session: ViewerSession = JSON.parse(sessionData);
        const duration = Math.floor((Date.now() - session.joinedAt) / 1000);

        logger.info('👋 觀眾離開', {
          userId,
          participantId: session.participantId,
          stageArn: stageArn.substring(stageArn.length - 12),
          watchDuration: `${duration}s`,
        });
      }

      // 刪除 Session
      await this.redis.del(key);
      
      // 從 Stage 的觀眾集合移除
      await this.redis.srem(`stage:${stageArn}:viewers`, userId);
      
      // 減少觀眾計數
      await this.redis.decrementViewerCount(stageArn);
    } catch (error: any) {
      logger.error('記錄觀眾離開失敗', { error: error.message });
    }
  }

  /**
   * 清理不活躍的觀眾
   * 
   * 修復: 正確處理 stageArn 格式，確保 decrementViewerCount 被呼叫
   */
  private async cleanupInactiveViewers(): Promise<void> {
    try {
      // 獲取所有 Stage 的觀眾集合 key
      const prefix = await this.redis.getClient().keys('*stage:*:viewers');
      const stageKeys = prefix.filter(key => key.includes(':viewers'));
      
      let cleanedCount = 0;
      const now = Date.now();

      for (const stageKey of stageKeys) {
        // 提取 stageArn (完整 ARN)
        // Key 格式: ivs:prod:stage:arn:aws:ivs:...:viewers
        const parts = stageKey.split(':');
        const viewersIndex = parts.indexOf('viewers');
        const stageIndex = parts.indexOf('stage');
        
        if (viewersIndex === -1 || stageIndex === -1) continue;
        
        // 重建完整 ARN
        const stageArn = parts.slice(stageIndex + 1, viewersIndex).join(':');
        
        if (!stageArn || !stageArn.startsWith('arn:aws:ivs:')) {
          logger.debug('跳過無效的 Stage key', { stageKey });
          continue;
        }
        
        // 獲取該 Stage 的所有觀眾
        const viewers = await this.redis.smembers(`stage:${stageArn}:viewers`);

        for (const userId of viewers) {
          const key = this.getViewerKey(userId, stageArn);
          const sessionData = await this.redis.get(key);

          if (!sessionData) {
            // Session 不存在，直接清理
            logger.warn('⚠️ 發現無 Session 的觀眾，清理', {
              userId,
              stageArn: stageArn.substring(Math.max(0, stageArn.length - 12)),
            });
            await this.recordViewerLeave(userId, stageArn);
            cleanedCount++;
            continue;
          }

          const session: ViewerSession = JSON.parse(sessionData);
          const timeSinceLastHeartbeat = (now - session.lastHeartbeat) / 1000;

          // 超過超時時間，視為離線
          if (timeSinceLastHeartbeat > this.HEARTBEAT_TIMEOUT) {
            logger.warn('⏱️ 觀眾心跳超時，自動移除', {
              userId,
              stageArn: stageArn.substring(Math.max(0, stageArn.length - 12)),
              inactiveDuration: `${Math.floor(timeSinceLastHeartbeat)}s`,
            });

            await this.recordViewerLeave(userId, stageArn);
            cleanedCount++;
          }
        }
      }

      if (cleanedCount > 0) {
        logger.info('🧹 清理不活躍觀眾', { cleanedCount });
      }
    } catch (error: any) {
      logger.error('清理不活躍觀眾失敗', { error: error.message, stack: error.stack });
    }
  }

  /**
   * 獲取 Stage 的實時觀眾列表
   */
  public async getActiveViewers(stageArn: string): Promise<string[]> {
    try {
      return await this.redis.smembers(`stage:${stageArn}:viewers`);
    } catch (error: any) {
      logger.error('獲取觀眾列表失敗', { error: error.message });
      return [];
    }
  }

  /**
   * 獲取觀眾的觀看時長
   */
  public async getViewerWatchDuration(userId: string, stageArn: string): Promise<number> {
    try {
      const key = this.getViewerKey(userId, stageArn);
      const sessionData = await this.redis.get(key);

      if (!sessionData) {
        return 0;
      }

      const session: ViewerSession = JSON.parse(sessionData);
      return Math.floor((Date.now() - session.joinedAt) / 1000);
    } catch (error: any) {
      logger.error('獲取觀看時長失敗', { error: error.message });
      return 0;
    }
  }

  /**
   * 生成觀眾的 Redis Key
   */
  private getViewerKey(userId: string, stageArn: string): string {
    return `viewer:${userId}:${stageArn}`;
  }
}

export default ViewerHeartbeatService;
