/**
 * Redis 服務
 * 使用 Singleton 模式管理 Redis 連接
 * 用於快取、計數器和即時資料
 */

import Redis from 'ioredis';
import { logger } from '../utils/logger';
import { REDIS_KEYS } from '../utils/constants';

export class RedisService {
  private static instance: RedisService;
  private client: Redis;
  private isConnected: boolean = false;

  private constructor() {
    const options: any = {
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      password: process.env.REDIS_PASSWORD || undefined,
      db: parseInt(process.env.REDIS_DB || '0'),
      retryStrategy: (times: number) => {
        const delay = Math.min(times * 50, 2000);
        return delay;
      },
      maxRetriesPerRequest: 3,
      enableReadyCheck: true,
      enableOfflineQueue: true, // 改成 true
      lazyConnect: false,
    };

    // TLS 支援 (ElastiCache)
    if (process.env.REDIS_TLS_ENABLED === 'true') {
      options.tls = {};
    }

    this.client = new Redis(options);

    // 連接事件
    this.client.on('connect', () => {
      this.isConnected = true;
      logger.info('Redis 連接成功', {
        host: process.env.REDIS_HOST,
        port: process.env.REDIS_PORT,
      });
    });

    this.client.on('error', (error) => {
      this.isConnected = false;
      logger.error('Redis 連接錯誤', { error });
    });

    this.client.on('close', () => {
      this.isConnected = false;
      logger.warn('Redis 連接已關閉');
    });

    this.client.on('reconnecting', () => {
      logger.info('正在重新連接 Redis...');
    });
  }

  public static getInstance(): RedisService {
    if (!RedisService.instance) {
      RedisService.instance = new RedisService();
    }
    return RedisService.instance;
  }

  // ==========================================
  // 基本操作
  // ==========================================

  async ping(): Promise<string> {
    // 等待連接就緒
    if (!this.isConnected) {
      await new Promise((resolve) => {
        this.client.once('ready', resolve);
      });
    }
    return await this.client.ping();
  }

  async get(key: string): Promise<string | null> {
    const prefixedKey = this.getPrefixedKey(key);
    return await this.client.get(prefixedKey);
  }

  async set(key: string, value: string, ttl?: number): Promise<void> {
    const prefixedKey = this.getPrefixedKey(key);
    if (ttl) {
      await this.client.setex(prefixedKey, ttl, value);
    } else {
      await this.client.set(prefixedKey, value);
    }
  }

  async del(key: string): Promise<number> {
    const prefixedKey = this.getPrefixedKey(key);
    return await this.client.del(prefixedKey);
  }

  async exists(key: string): Promise<number> {
    const prefixedKey = this.getPrefixedKey(key);
    return await this.client.exists(prefixedKey);
  }

  async expire(key: string, seconds: number): Promise<number> {
    const prefixedKey = this.getPrefixedKey(key);
    return await this.client.expire(prefixedKey, seconds);
  }

  // ==========================================
  // 計數器操作
  // ==========================================

  async incr(key: string): Promise<number> {
    const prefixedKey = this.getPrefixedKey(key);
    return await this.client.incr(prefixedKey);
  }

  async decr(key: string): Promise<number> {
    const prefixedKey = this.getPrefixedKey(key);
    return await this.client.decr(prefixedKey);
  }

  async incrBy(key: string, increment: number): Promise<number> {
    const prefixedKey = this.getPrefixedKey(key);
    return await this.client.incrby(prefixedKey, increment);
  }

  async decrBy(key: string, decrement: number): Promise<number> {
    const prefixedKey = this.getPrefixedKey(key);
    return await this.client.decrby(prefixedKey, decrement);
  }

  // ==========================================
  // Hash 操作
  // ==========================================

  async hget(key: string, field: string): Promise<string | null> {
    const prefixedKey = this.getPrefixedKey(key);
    return await this.client.hget(prefixedKey, field);
  }

  async hset(key: string, field: string, value: string): Promise<number> {
    const prefixedKey = this.getPrefixedKey(key);
    return await this.client.hset(prefixedKey, field, value);
  }

  async hgetall(key: string): Promise<Record<string, string>> {
    const prefixedKey = this.getPrefixedKey(key);
    return await this.client.hgetall(prefixedKey);
  }

  async hdel(key: string, ...fields: string[]): Promise<number> {
    const prefixedKey = this.getPrefixedKey(key);
    return await this.client.hdel(prefixedKey, ...fields);
  }

  // ==========================================
  // Set 操作
  // ==========================================

  async sadd(key: string, ...members: string[]): Promise<number> {
    const prefixedKey = this.getPrefixedKey(key);
    return await this.client.sadd(prefixedKey, ...members);
  }

  async srem(key: string, ...members: string[]): Promise<number> {
    const prefixedKey = this.getPrefixedKey(key);
    return await this.client.srem(prefixedKey, ...members);
  }

  async smembers(key: string): Promise<string[]> {
    const prefixedKey = this.getPrefixedKey(key);
    return await this.client.smembers(prefixedKey);
  }

  async sismember(key: string, member: string): Promise<number> {
    const prefixedKey = this.getPrefixedKey(key);
    return await this.client.sismember(prefixedKey, member);
  }

  async scard(key: string): Promise<number> {
    const prefixedKey = this.getPrefixedKey(key);
    return await this.client.scard(prefixedKey);
  }

  // ==========================================
  // 業務邏輯方法
  // ==========================================

  // 檢查用戶是否已在 Stage 中
  async isViewerInStage(userId: string, stageArn: string): Promise<boolean> {
    const key = `stage:${stageArn}:viewers`;
    const isMember = await this.sismember(key, userId);
    return isMember === 1;
  }

  // 增加觀眾數
  async incrementViewerCount(stageId?: string): Promise<number> {
    const pipeline = this.client.pipeline();

    // 增加總觀眾數
    pipeline.incr(this.getPrefixedKey(REDIS_KEYS.TOTAL_VIEWERS));

    // 如果指定了 Stage，也增加該 Stage 的觀眾數
    if (stageId) {
      pipeline.incr(this.getPrefixedKey(REDIS_KEYS.VIEWER_COUNT(stageId)));
    }

    const results = await pipeline.exec();
    return results?.[0]?.[1] as number || 0;
  }

  // 修復: 只有當用戶不在 Stage 中時才增加計數（去重）
  async incrementViewerCountIfNew(userId: string, stageArn: string): Promise<{ incremented: boolean; count: number }> {
    // 檢查用戶是否已在 Stage 中
    const isExisting = await this.isViewerInStage(userId, stageArn);

    if (isExisting) {
      // 用戶已存在，不增加計數，只返回當前計數
      const count = await this.getStageViewerCount(stageArn);
      logger.debug('用戶已在 Stage 中，跳過計數增加', {
        userId,
        stageArn: stageArn.substring(stageArn.length - 12),
        currentCount: count,
      });
      return { incremented: false, count };
    }

    // 用戶不存在，增加計數
    const count = await this.incrementViewerCount(stageArn);
    logger.debug('新用戶加入 Stage，計數已增加', {
      userId,
      stageArn: stageArn.substring(stageArn.length - 12),
      newCount: count,
    });
    return { incremented: true, count };
  }

  // 減少觀眾數
  async decrementViewerCount(stageId?: string): Promise<number> {
    const pipeline = this.client.pipeline();
    
    // 減少總觀眾數
    pipeline.decr(this.getPrefixedKey(REDIS_KEYS.TOTAL_VIEWERS));
    
    // 如果指定了 Stage，也減少該 Stage 的觀眾數
    if (stageId) {
      pipeline.decr(this.getPrefixedKey(REDIS_KEYS.VIEWER_COUNT(stageId)));
    }
    
    const results = await pipeline.exec();
    return results?.[0]?.[1] as number || 0;
  }

  // 獲取總觀眾數
  // 修復: 添加錯誤處理
  async getTotalViewerCount(): Promise<number> {
    try {
      const count = await this.get(REDIS_KEYS.TOTAL_VIEWERS);
      return parseInt(count || '0', 10);
    } catch (error: any) {
      logger.warn('Redis 資料類型錯誤，重置總觀眾數', {
        error: error.message,
      });
      await this.set(REDIS_KEYS.TOTAL_VIEWERS, '0');
      return 0;
    }
  }

  // 獲取 Stage 觀眾數
  // 修復: 添加錯誤處理，防止 WRONGTYPE 錯誤
  async getStageViewerCount(stageId: string): Promise<number> {
    try {
      const count = await this.get(REDIS_KEYS.VIEWER_COUNT(stageId));
      return parseInt(count || '0', 10);
    } catch (error: any) {
      // 資料類型錯誤時，重置為 0
      logger.warn('Redis 資料類型錯誤，重置計數器', {
        key: REDIS_KEYS.VIEWER_COUNT(stageId),
        error: error.message,
      });
      await this.set(REDIS_KEYS.VIEWER_COUNT(stageId), '0');
      return 0;
    }
  }

  // 設定 Stage 資訊
  async setStageInfo(stageId: string, info: any): Promise<void> {
    await this.set(REDIS_KEYS.STAGE_INFO(stageId), JSON.stringify(info), 3600);
  }

  // 獲取 Stage 資訊
  async getStageInfo(stageId: string): Promise<any | null> {
    const info = await this.get(REDIS_KEYS.STAGE_INFO(stageId));
    return info ? JSON.parse(info) : null;
  }

  // 獲取所有活躍 Stage
  // 修復: 使用正確的 pattern 來匹配 viewers:{stageArn} keys
  async getActiveStages(): Promise<string[]> {
    try {
      // 從 Redis 中查詢所有 viewers:{stageArn} 鍵
      const pattern = this.getPrefixedKey('viewers:*');
      const keys = await this.client.keys(pattern);
      
      logger.debug('Searching for active stages', {
        pattern,
        keysFound: keys.length,
      });
      
      // 提取 stageArn（從 ivs:prod:viewers:arn:aws:ivs:... 中提取 arn:aws:ivs:...）
      const prefix = this.getPrefixedKey('viewers:');
      const stageArns = keys
        .map(key => key.replace(prefix, ''))
        .filter(arn => arn && arn.length > 0);
      
      logger.debug('Active stages from Redis', {
        count: stageArns.length,
        stageIds: stageArns.map(arn => arn.substring(arn.lastIndexOf('/') + 1)),
      });
      
      return stageArns;
    } catch (error: any) {
      logger.error('Redis getActiveStages 失敗', { error: error.message });
      return [];
    }
  }

  // 設定主播狀態
  async setPublisherStatus(isLive: boolean): Promise<void> {
    await this.set(REDIS_KEYS.PUBLISHER_STATUS, isLive ? 'live' : 'offline', 86400);
  }

  // 獲取主播狀態
  async getPublisherStatus(): Promise<boolean> {
    const status = await this.get(REDIS_KEYS.PUBLISHER_STATUS);
    return status === 'live';
  }

  // 設定主播資訊（包含 participantId）
  async setPublisherInfo(participantId: string, stageArn: string, userId: string): Promise<void> {
    const info = {
      participantId,
      stageArn,
      userId,
      joinedAt: new Date().toISOString(),
    };
    await this.set('publisher:info', JSON.stringify(info), 86400);
    logger.info('✅ 主播資訊已存儲', {
      participantId,
      stageArn: stageArn.substring(stageArn.length - 12),
      userId,
    });
  }

  // 獲取主播資訊
  async getPublisherInfo(): Promise<{ participantId: string; stageArn: string; userId: string; joinedAt: string } | null> {
    const info = await this.get('publisher:info');
    if (!info) {
      return null;
    }
    try {
      return JSON.parse(info);
    } catch (error: any) {
      logger.error('解析主播資訊失敗', { error: error.message });
      return null;
    }
  }

  // 清除主播資訊
  async clearPublisherInfo(): Promise<void> {
    await this.del('publisher:info');
    logger.info('✅ 主播資訊已清除');
  }

  // 設定 Participant Replication 狀態
  async setReplicationStatus(sourceStageArn: string, destStageArn: string, participantId: string): Promise<void> {
    const key = `replication:${destStageArn}`;
    const info = {
      sourceStageArn,
      destStageArn,
      participantId,
      startedAt: new Date().toISOString(),
    };
    await this.set(key, JSON.stringify(info), 86400);
    logger.debug('Replication 狀態已記錄', {
      sourceStage: sourceStageArn.substring(sourceStageArn.length - 12),
      destStage: destStageArn.substring(destStageArn.length - 12),
      participantId,
    });
  }

  // 獲取 Replication 狀態
  async getReplicationStatus(destStageArn: string): Promise<any | null> {
    const key = `replication:${destStageArn}`;
    const info = await this.get(key);
    return info ? JSON.parse(info) : null;
  }

  // 清除 Replication 狀態
  async clearReplicationStatus(destStageArn: string): Promise<void> {
    const key = `replication:${destStageArn}`;
    await this.del(key);
    logger.debug('Replication 狀態已清除', {
      destStage: destStageArn.substring(destStageArn.length - 12),
    });
  }

  // ==========================================
  // 工具方法
  // ==========================================

  private getPrefixedKey(key: string): string {
    const prefix = process.env.REDIS_KEY_PREFIX || 'ivs:prod:';
    return `${prefix}${key}`;
  }

  public getClient(): Redis {
    return this.client;
  }

  public isReady(): boolean {
    return this.isConnected;
  }

  public async disconnect(): Promise<void> {
    await this.client.quit();
    logger.info('Redis 連接已斷開');
  }

  // 清除所有資料 (僅用於測試)
  public async flushAll(): Promise<void> {
    if (process.env.NODE_ENV !== 'production') {
      await this.client.flushall();
      logger.warn('Redis 資料已清除 (僅測試環境)');
    }
  }

  /**
   * 清理無效的 Redis key
   * 修復: 檢查並修正資料類型錯誤
   */
  public async cleanupInvalidKeys(): Promise<void> {
    try {
      const prefix = this.getPrefixedKey('');
      const keys = await this.client.keys(`${prefix}*`);
      
      let cleanedCount = 0;
      
      for (const key of keys) {
        try {
          const type = await this.client.type(key);
          
          // 檢查計數器 key 是否為字串類型
          if (key.includes('viewer:count:') && type !== 'string') {
            logger.warn('發現類型不符的 key，刪除', { key, type });
            await this.client.del(key);
            cleanedCount++;
          }
          
          if (key.includes('total:viewers') && type !== 'string') {
            logger.warn('發現類型不符的 key，刪除', { key, type });
            await this.client.del(key);
            cleanedCount++;
          }
        } catch (error: any) {
          logger.error('清理 key 失敗', { key, error: error.message });
        }
      }
      
      if (cleanedCount > 0) {
        logger.info(`✅ Redis 清理完成，刪除 ${cleanedCount} 個無效 key`);
      }
    } catch (error: any) {
      logger.error('Redis 清理失敗', { error: error.message });
    }
  }
}

export default RedisService;
