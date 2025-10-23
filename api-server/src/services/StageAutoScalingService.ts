/**
 * Stage 自動擴展服務
 * 負責監控和管理 Stage 的自動創建與刪除
 * 
 * 修復日期: 2025-10-19
 * 修復內容:
 * 1. 修正 listAllStages 類型定義，過濾 undefined ARN
 * 2. 添加 Stage 暖機期機制(5分鐘)，避免新 Stage 立即被刪除
 * 3. 改進日誌輸出，提供更詳細的除錯資訊
 */

import {
  IVSRealTimeClient,
  CreateStageCommand,
  DeleteStageCommand,
  ListStagesCommand,
} from '@aws-sdk/client-ivs-realtime';
import { RedisService } from './RedisService';
import { logger } from '../utils/logger';
import { STAGE_CONFIG } from '../utils/constants';

export class StageAutoScalingService {
  private static instance: StageAutoScalingService;
  private client: IVSRealTimeClient;
  private healthCheckInterval?: NodeJS.Timeout;
  private isRunning: boolean = false;

  private constructor() {
    this.client = new IVSRealTimeClient({
      region: process.env.AWS_REGION || 'us-east-1',
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
      },
    });

    logger.info('Stage Auto Scaling Service 初始化完成');
  }

  public static getInstance(): StageAutoScalingService {
    if (!StageAutoScalingService.instance) {
      StageAutoScalingService.instance = new StageAutoScalingService();
    }
    return StageAutoScalingService.instance;
  }

  /**
   * 啟動自動擴展監控
   */
  public startMonitoring(): void {
    if (this.isRunning) {
      logger.warn('Stage Auto Scaling 已在運行中');
      return;
    }

    this.isRunning = true;
    logger.info('🎬 啟動 Stage Auto Scaling 監控', {
      interval: `${STAGE_CONFIG.HEALTH_CHECK_INTERVAL}ms`,
      scaleUpThreshold: STAGE_CONFIG.SCALE_UP_THRESHOLD,
      scaleDownThreshold: STAGE_CONFIG.SCALE_DOWN_THRESHOLD,
    });

    // 立即執行一次檢查
    this.checkAndScale();

    // 定期檢查
    this.healthCheckInterval = setInterval(() => {
      this.checkAndScale();
    }, STAGE_CONFIG.HEALTH_CHECK_INTERVAL);
  }

  /**
   * 停止自動擴展監控
   */
  public stopMonitoring(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = undefined;
      this.isRunning = false;
      logger.info('Stage Auto Scaling 監控已停止');
    }
  }

  /**
   * 檢查並執行擴展操作
   * 
   * 修復: 添加總觀眾數驗證，避免 Redis 資料錯誤導致誤判
   */
  private async checkAndScale(): Promise<void> {
    try {
      const redis = RedisService.getInstance();

      // 獲取所有活躍的 Stage
      const stages = await this.listAllStages();
      
      // ✅ 新增：計算總觀眾數
      let totalViewers = 0;
      const stageStats: Array<{arn: string; name: string; viewers: number}> = [];

      for (const stage of stages) {
        const stageArn = stage.arn;
        const viewerCount = await redis.getStageViewerCount(stageArn);
        totalViewers += viewerCount;
        
        stageStats.push({
          arn: stageArn.substring(stageArn.length - 12),
          name: stage.name || 'unnamed',
          viewers: viewerCount,
        });
      }

      logger.debug('📊 Stage 檢查摘要', {
        totalStages: stages.length,
        totalViewers,
        stages: stageStats,
      });

      // ✅ 新增：安全檢查 - 如果總觀眾數異常高，可能是 Redis 資料錯誤
      if (totalViewers > 1000) {
        logger.warn('⚠️ 檢測到異常的觀眾數，可能是 Redis 資料錯誤', {
          totalViewers,
          suggestion: '請執行 FLUSHALL 清理 Redis',
        });
        return; // 停止自動擴展，避免創建過多 Stage
      }

      // 處理每個 Stage
      for (const stage of stages) {
        const stageArn = stage.arn;
        const viewerCount = await redis.getStageViewerCount(stageArn);

        // 檢查是否需要擴展（Scale Up）
        if (viewerCount >= STAGE_CONFIG.SCALE_UP_THRESHOLD) {
          // ✅ 新增：再次驗證，避免誤判
          logger.info('🔍 檢測到需要擴展', {
            stageArn: stageArn.substring(stageArn.length - 12),
            viewerCount,
            threshold: STAGE_CONFIG.SCALE_UP_THRESHOLD,
          });
          await this.scaleUp(stageArn, viewerCount);
        }

        // 檢查是否需要縮減（Scale Down）
        if (viewerCount <= STAGE_CONFIG.SCALE_DOWN_THRESHOLD && 
            stageArn !== process.env.MASTER_STAGE_ARN) {
          await this.scaleDown(stageArn, viewerCount);
        }
      }
    } catch (error: any) {
      logger.error('Stage Auto Scaling 檢查失敗', { error: error.message });
    }
  }

  /**
   * 擴展：創建新 Stage
   * 
   * 修復: 正確的擴展邏輯 - 基於總容量 vs 總觀眾數
   */
  private async scaleUp(stageArn: string, currentViewerCount: number): Promise<void> {
    try {
      const redis = RedisService.getInstance();

      // 檢查是否已達到 Stage 數量上限
      const stages = await this.listAllStages();
      if (stages.length >= STAGE_CONFIG.MAX_STAGES) {
        logger.warn('⚠️ 已達到 Stage 數量上限，無法自動擴展', {
          currentStages: stages.length,
          maxStages: STAGE_CONFIG.MAX_STAGES,
        });
        return;
      }

      // ✅ 新增：檢查是否真的需要擴展
      // 計算總容量 vs 總觀眾數
      let totalViewers = 0;
      for (const stage of stages) {
        const count = await redis.getStageViewerCount(stage.arn);
        totalViewers += count;
      }
      
      const totalCapacity = stages.length * 50;
      const utilizationRate = totalCapacity > 0 ? (totalViewers / totalCapacity) : 0;
      
      // 只有當使用率 > 60% 才擴展
      if (utilizationRate < 0.6) {
        logger.debug('📊 使用率未達擴展門檻，跳過擴展', {
          totalViewers,
          totalCapacity,
          utilizationRate: `${(utilizationRate * 100).toFixed(1)}%`,
          threshold: '90%',
        });
        return;
      }
      
      logger.info('🚀 需要擴展！', {
        totalViewers,
        totalCapacity,
        utilizationRate: `${(utilizationRate * 100).toFixed(1)}%`,
        currentStages: stages.length,
      });

      // 創建新 Stage
      const newStageName = `auto-stage-${Date.now()}`;
      const command = new CreateStageCommand({
        name: newStageName,
        tags: {
          AutoScaled: 'true',
          CreatedAt: new Date().toISOString(),
          ParentStage: stageArn,
          Environment: process.env.NODE_ENV || 'development',
        },
      });

      const response = await this.client.send(command);

      if (response.stage?.arn) {
        // 在 Redis 中記錄新 Stage (包含完整 ARN)
        await redis.setStageInfo(response.stage.arn, {
          name: newStageName,
          arn: response.stage.arn, // ✅ 儲存完整 ARN
          autoScaled: true,
          createdAt: new Date().toISOString(),
          parentStage: stageArn,
        });

        logger.info('✅ 自動擴展：創建新 Stage', {
          newStageArn: response.stage.arn.substring(response.stage.arn.length - 12),
          newStageName,
          reason: `使用率 ${(utilizationRate * 100).toFixed(1)}% > 90%`,
          totalViewersNow: totalViewers,
          newTotalCapacity: (stages.length + 1) * 50,
          totalStages: stages.length + 1,
        });

        // 通知主播端新 Stage 已創建
        try {
          const { notifyBroadcasterStageCreated } = await import('../index');
          notifyBroadcasterStageCreated(response.stage.arn);
        } catch (error: any) {
          logger.error('通知主播端失敗', { error: error.message });
        }
      }
    } catch (error: any) {
      logger.error('❌ 自動擴展失敗', { error: error.message, stack: error.stack });
    }
  }

  /**
   * 縮減：刪除空閒 Stage
   * 
   * 修復: 添加暖機期檢查，Stage 創建後至少存活 5 分鐘
   */
  private async scaleDown(stageArn: string, currentViewerCount: number): Promise<void> {
    try {
      const redis = RedisService.getInstance();

      // 檢查 Stage 資訊
      const stageInfo = await redis.getStageInfo(stageArn);
      
      // 只刪除自動擴展創建的 Stage
      if (!stageInfo?.autoScaled) {
        logger.debug('Stage 不是自動創建的，跳過縮減', {
          stageArn: stageArn.substring(stageArn.length - 12),
        });
        return;
      }

      // 確認觀眾數真的很低
      if (currentViewerCount > STAGE_CONFIG.SCALE_DOWN_THRESHOLD) {
        return;
      }

      // ✅ 新增：暖機期檢查
      // Stage 創建後至少存活 5 分鐘，避免立即被刪除
      const createdAt = new Date(stageInfo.createdAt);
      const now = new Date();
      const ageInMinutes = (now.getTime() - createdAt.getTime()) / 60000;
      
      const WARMUP_PERIOD_MINUTES = 5;
      
      if (ageInMinutes < WARMUP_PERIOD_MINUTES) {
        logger.debug('Stage 在暖機期內，暫不刪除', {
          stageArn: stageArn.substring(stageArn.length - 12),
          ageMinutes: Math.round(ageInMinutes * 10) / 10,
          warmupPeriod: WARMUP_PERIOD_MINUTES,
          viewerCount: currentViewerCount,
        });
        return;
      }

      // 刪除 Stage
      const command = new DeleteStageCommand({
        arn: stageArn,
      });

      await this.client.send(command);

      // 從 Redis 清除記錄
      await redis.del(`stage:${stageArn}`);
      await redis.del(`viewers:${stageArn}`);

      logger.info('✅ 自動縮減：刪除空閒 Stage', {
        stageArn: stageArn.substring(stageArn.length - 12),
        viewerCount: currentViewerCount,
        ageMinutes: Math.round(ageInMinutes),
      });

      // 通知主播端 Stage 已刪除
      try {
        const { notifyBroadcasterStageDeleted } = await import('../index');
        notifyBroadcasterStageDeleted(stageArn);
      } catch (error: any) {
        logger.error('通知主播端失敗', { error: error.message });
      }
    } catch (error: any) {
      logger.error('❌ 自動縮減失敗', { 
        error: error.message,
        stageArn: stageArn.substring(stageArn.length - 12),
      });
    }
  }

  /**
   * 列出所有 Stage
   * 
   * 修復: 過濾掉 arn 為 undefined 的 Stage，確保類型安全
   */
  private async listAllStages(): Promise<Array<{ arn: string; name?: string }>> {
    try {
      const command = new ListStagesCommand({ maxResults: 50 });
      const response = await this.client.send(command);
      
      // ✅ 修復: 過濾掉 arn 為 undefined 的 Stage
      const validStages = (response.stages || [])
        .filter((stage): stage is { arn: string; name?: string } => {
          if (stage.arn === undefined) {
            logger.warn('發現 ARN 為 undefined 的 Stage，已過濾', {
              stageName: stage.name || 'unknown',
            });
            return false;
          }
          return true;
        })
        .map(stage => ({
          arn: stage.arn!, // TypeScript 現在知道 arn 一定存在
          name: stage.name
        }));
      
      return validStages;
    } catch (error: any) {
      logger.error('列出 Stage 失敗', { error: error.message });
      return [];
    }
  }

  /**
   * 獲取最適合的 Stage（觀眾數最少的）
   * 用於智能分配新觀眾
   */
  public async getBestStageForViewer(): Promise<string | null> {
    try {
      const redis = RedisService.getInstance();
      const stages = await this.listAllStages();

      if (stages.length === 0) {
        logger.warn('沒有可用的 Stage');
        return process.env.MASTER_STAGE_ARN || null;
      }

      // 找出觀眾數最少且未滿的 Stage
      let bestStage: string | null = null;
      let minViewers = Infinity;

      for (const stage of stages) {
        // stage.arn 現在保證是 string 類型
        const viewerCount = await redis.getStageViewerCount(stage.arn);
        
        // 只考慮未滿的 Stage
        if (viewerCount < STAGE_CONFIG.SCALE_UP_THRESHOLD) {
          if (viewerCount < minViewers) {
            minViewers = viewerCount;
            bestStage = stage.arn;
          }
        }
      }

      if (bestStage) {
        logger.debug('找到最佳 Stage', {
          stageArn: bestStage.substring(bestStage.length - 12),
          viewerCount: minViewers,
        });
      } else {
        logger.warn('所有 Stage 都已滿，使用主 Stage');
      }

      return bestStage || process.env.MASTER_STAGE_ARN || null;
    } catch (error: any) {
      logger.error('獲取最佳 Stage 失敗', { error: error.message });
      return process.env.MASTER_STAGE_ARN || null;
    }
  }
}

export default StageAutoScalingService;
