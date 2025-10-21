/**
 * 統計資料路由
 * 提供即時觀眾數、Stage 狀態等統計資訊
 * 
 * 修復日期: 2025-10-19
 * 修復內容:
 * 1. totalViewers 改為即時計算（各 Stage 總和）
 * 2. 移除不合理的手動增減觀眾數 API
 * 3. 整合 AWS IVS API 和 Redis 數據
 */

import { Router, Request, Response } from 'express';
import {
  IVSRealTimeClient,
  ListStagesCommand,
} from '@aws-sdk/client-ivs-realtime';
import { RedisService } from '../services/RedisService';
import { logger } from '../utils/logger';
import { HTTP_STATUS, ERROR_CODES } from '../utils/constants';

const router = Router();

// 延遲初始化 IVS 客戶端
let ivsClient: IVSRealTimeClient;

const getIVSClient = () => {
  if (!ivsClient) {
    ivsClient = new IVSRealTimeClient({
      region: process.env.AWS_REGION || 'us-east-1',
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
      },
    });
  }
  return ivsClient;
};

/**
 * GET /api/stats
 * 獲取總體統計資訊
 * 
 * 修復: totalViewers 改為即時計算，不依賴 Redis 的 total_viewers
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const redis = RedisService.getInstance();

    // 方法 1: 從 AWS IVS API 獲取所有 Stage（最準確但較慢）
    const command = new ListStagesCommand({ maxResults: 50 });
    const response = await getIVSClient().send(command);
    const allStages = response.stages || [];

    // 獲取主播狀態
    const isPublisherLive = await redis.getPublisherStatus();

    // 為每個 Stage 獲取觀眾數（從 Redis）
    const stageStats = await Promise.all(
      allStages.map(async (stage) => {
        if (!stage.arn) return null;
        
        try {
          const viewerCount = await redis.getStageViewerCount(stage.arn);
          const stageInfo = await redis.getStageInfo(stage.arn);
          
          return {
            stageArn: stage.arn,
            stageName: stage.name || 'unnamed',
            viewerCount,
            autoScaled: stageInfo?.autoScaled || false,
            createdAt: stageInfo?.createdAt || stage.activeSessionId,
          };
        } catch (error: any) {
          logger.warn('Stage 資訊獲取失敗', { stageArn: stage.arn, error: error.message });
          return {
            stageArn: stage.arn,
            stageName: stage.name || 'unnamed',
            viewerCount: 0,
            autoScaled: false,
            createdAt: null,
          };
        }
      })
    );

    // 過濾掉 null 值
    const validStages = stageStats.filter(s => s !== null);

    // 修復: 即時計算總觀眾數（各 Stage 總和）
    const totalViewers = validStages.reduce((sum, stage) => sum + stage.viewerCount, 0);

    const stats = {
      success: true,
      data: {
        totalViewers,        // ✅ 即時計算的總和
        activeStages: validStages.length,
        isPublisherLive,
        stages: validStages,
        timestamp: new Date().toISOString(),
      },
    };

    res.status(HTTP_STATUS.OK).json(stats);

    logger.debug('統計資料已返回', { 
      totalViewers, 
      activeStages: validStages.length,
      calculatedFrom: 'real-time sum',
    });
  } catch (error: any) {
    logger.error('獲取統計資料失敗', { 
      error: error.message,
      stack: error.stack,
    });
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      error: ERROR_CODES.INTERNAL_ERROR,
      message: '獲取統計資料失敗',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
});

/**
 * GET /api/stats/viewers
 * 獲取觀眾數統計
 * 
 * 修復: 改為即時計算
 */
router.get('/viewers', async (req: Request, res: Response) => {
  try {
    const redis = RedisService.getInstance();
    
    // 從 AWS IVS 獲取所有 Stage
    const command = new ListStagesCommand({ maxResults: 50 });
    const response = await getIVSClient().send(command);
    const allStages = response.stages || [];

    // 計算總觀眾數
    let totalViewers = 0;
    for (const stage of allStages) {
      if (stage.arn) {
        const count = await redis.getStageViewerCount(stage.arn);
        totalViewers += count;
      }
    }

    res.status(HTTP_STATUS.OK).json({
      success: true,
      data: {
        totalViewers,
        calculatedFrom: 'real-time sum',
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error: any) {
    logger.error('獲取觀眾數失敗', { error: error.message });
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      error: ERROR_CODES.INTERNAL_ERROR,
      message: '獲取觀眾數失敗',
    });
  }
});

/**
 * GET /api/stats/stages
 * 獲取所有 Stage 的詳細資訊
 * 
 * 如果帶有 arn 參數，則返回特定 Stage 的資訊
 */
router.get('/stages', async (req: Request, res: Response) => {
  try {
    const redis = RedisService.getInstance();
    const { arn } = req.query;

    // 如果有 arn 參數，返回特定 Stage 資訊
    if (arn && typeof arn === 'string') {
      logger.debug('獲取特定 Stage 資訊', { arn });

      const viewerCount = await redis.getStageViewerCount(arn);
      const stageInfo = await redis.getStageInfo(arn);

      return res.status(HTTP_STATUS.OK).json({
        success: true,
        data: {
          stageArn: arn,
          viewerCount,
          info: stageInfo,
          timestamp: new Date().toISOString(),
        },
      });
    }
    
    // 沒有 arn 參數，返回所有 Stage 列表
    const command = new ListStagesCommand({ maxResults: 50 });
    const response = await getIVSClient().send(command);
    const allStages = response.stages || [];

    const stagesDetails = await Promise.all(
      allStages.map(async (stage) => {
        if (!stage.arn) return null;
        
        const viewerCount = await redis.getStageViewerCount(stage.arn);
        const stageInfo = await redis.getStageInfo(stage.arn);
        
        return {
          stageArn: stage.arn,
          stageName: stage.name,
          viewerCount,
          autoScaled: stageInfo?.autoScaled || false,
          createdAt: stageInfo?.createdAt,
          tags: stage.tags,
        };
      })
    );

    const validStages = stagesDetails.filter(s => s !== null);

    res.status(HTTP_STATUS.OK).json({
      success: true,
      data: {
        totalStages: validStages.length,
        stages: validStages,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error: any) {
    logger.error('獲取 Stage 資訊失敗', { error: error.message });
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      error: ERROR_CODES.INTERNAL_ERROR,
      message: '獲取 Stage 資訊失敗',
    });
  }
});

/**
 * GET /api/stats/stages/:stageId
 * 獲取特定 Stage 的詳細資訊（使用短 ID）
 * 
 * ⚠️ 此 API 只接受短 Stage ID，不接受完整 ARN
 * 範例: /api/stats/stages/sWyAydfRqqF8
 * 
 * 如果需要使用完整 ARN，請使用 GET /api/stats/stages?arn=...
 */
router.get('/stages/:stageId', async (req: Request, res: Response) => {
  try {
    const { stageId } = req.params;
    const redis = RedisService.getInstance();

    // 檢查是否為短 ID（不包含 ':'）
    if (stageId.includes(':')) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        error: ERROR_CODES.VALIDATION_ERROR,
        message: '此 API 只接受短 Stage ID。如需使用完整 ARN，請使用 GET /api/stats/stages?arn=...',
        hint: `使用: GET /api/stats/stages?arn=${stageId}`,
      });
    }

    // 構建完整的 ARN（假設使用環境變數中的 region 和 account）
    const region = process.env.AWS_REGION || 'ap-northeast-1';
    const accountId = process.env.AWS_ACCOUNT_ID || '125371974421';
    const fullArn = `arn:aws:ivs:${region}:${accountId}:stage/${stageId}`;

    logger.debug('獲取 Stage 資訊（短 ID）', {
      stageId,
      fullArn,
    });

    const viewerCount = await redis.getStageViewerCount(fullArn);
    const stageInfo = await redis.getStageInfo(fullArn);

    res.status(HTTP_STATUS.OK).json({
      success: true,
      data: {
        stageId,
        stageArn: fullArn,
        viewerCount,
        info: stageInfo,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error: any) {
    logger.error('獲取 Stage 資訊失敗', { error: error.message });
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      error: ERROR_CODES.INTERNAL_ERROR,
      message: '獲取 Stage 資訊失敗',
    });
  }
});

/**
 * GET /api/stats/publisher
 * 獲取主播狀態
 */
router.get('/publisher', async (req: Request, res: Response) => {
  try {
    const redis = RedisService.getInstance();
    const isLive = await redis.getPublisherStatus();

    res.status(HTTP_STATUS.OK).json({
      success: true,
      data: {
        isLive,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error: any) {
    logger.error('獲取主播狀態失敗', { error: error.message });
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      error: ERROR_CODES.INTERNAL_ERROR,
      message: '獲取主播狀態失敗',
    });
  }
});

// ==========================================
// 已移除不合理的 API
// ==========================================
// ❌ POST /api/stats/viewer/increment - 已移除
// ❌ POST /api/stats/viewer/decrement - 已移除
// 
// 原因: 前端不應該手動增減觀眾數
// 觀眾數應該只在以下情況自動更新:
// 1. POST /api/token/viewer - 觀眾加入
// 2. POST /api/viewer/leave - 觀眾離開
// 3. ViewerHeartbeatService - 心跳超時自動移除

export default router;
