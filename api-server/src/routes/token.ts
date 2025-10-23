/**
 * Token 生成路由
 * 最關鍵的 API：生成主播和觀眾 Token
 * 
 * 修復日期: 2025-10-19
 * 修復內容:
 * 1. 添加智能觀眾分配機制，使用 getBestStageForViewer()
 * 2. 新觀眾自動分配到觀眾數最少的 Stage
 * 3. 改進日誌輸出，追蹤觀眾分配過程
 */

import { Router, Request, Response } from 'express';
import { IVSService } from '../services/IVSService';
import { RedisService } from '../services/RedisService';
import { StageAutoScalingService } from '../services/StageAutoScalingService';
import { ViewerHeartbeatService } from '../services/ViewerHeartbeatService';
import { logger } from '../utils/logger';
import { HTTP_STATUS, ERROR_CODES, API_ENDPOINTS } from '../utils/constants';

const router = Router();
let ivsService: IVSService;

// 延遲初始化 IVS Service
const getIVSService = () => {
  if (!ivsService) {
    ivsService = new IVSService();
  }
  return ivsService;
};

/**
 * POST /api/token/publisher
 * 生成主播 Token (PUBLISH 權限)
 */
router.post('/publisher', async (req: Request, res: Response) => {
  try {
    const { userId } = req.body;

    if (!userId) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        error: ERROR_CODES.VALIDATION_ERROR,
        message: '缺少 userId',
      });
    }

    logger.info('收到主播 Token 請求', { userId });

    // 生成 Token
    const token = await getIVSService().createPublisherToken(userId);

    // 更新 Redis 狀態
    const redis = RedisService.getInstance();
    await redis.setPublisherStatus(true);

    // 返回完整資訊
    res.status(HTTP_STATUS.OK).json({
      success: true,
      data: {
        token: token.token,
        participantId: token.participantId,
        userId: token.userId,
        stageArn: token.stageArn,
        capabilities: token.capabilities,
        expiresAt: token.expiresAt,
        whipEndpoint: API_ENDPOINTS.WHIP,
        expiresIn: Math.floor((token.expiresAt.getTime() - Date.now()) / 1000),
      },
      instructions: {
        obs: {
          service: 'WHIP',
          server: API_ENDPOINTS.WHIP,
          bearerToken: '<使用上方的 token>',
          settings: {
            resolution: '1280x720',
            bitrate: '2500 kbps',
            keyframeInterval: '1s',
            cpuPreset: 'ultrafast',
            tune: 'zerolatency',
          },
        },
        web: {
          sdk: 'amazon-ivs-web-broadcast',
          method: 'Stage.join(token)',
        },
      },
    });

    logger.info('✅ 主播 Token 生成成功', {
      userId,
      participantId: token.participantId,
    });
  } catch (error: any) {
    logger.error('❌ 主播 Token 生成失敗', { error: error.message });
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      error: ERROR_CODES.TOKEN_GENERATION_FAILED,
      message: 'Token 生成失敗',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
});

/**
 * POST /api/token/viewer
 * 觀眾首次加入直播（生成 Token + 記錄加入）
 * 
 * 修復: 添加智能 Stage 分配機制
 */
router.post('/viewer', async (req: Request, res: Response) => {
  try {
    const { userId, stageArn } = req.body;

    if (!userId) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        error: ERROR_CODES.VALIDATION_ERROR,
        message: '缺少 userId',
      });
    }

    logger.info('收到觀眾 Token 請求', { userId });

    // ✅ 修復: 智能 Stage 分配
    let targetStageArn: string;
    
    if (stageArn) {
      // 手動指定 Stage
      targetStageArn = stageArn;
      logger.debug('使用指定的 Stage', {
        userId,
        stageArn: stageArn.substring(stageArn.length - 12),
      });
    } else {
      // ✅ 自動分配到觀眾數最少的 Stage
      const autoScaling = StageAutoScalingService.getInstance();
      const bestStage = await autoScaling.getBestStageForViewer();
      
      if (!bestStage) {
        logger.warn('沒有可用的 Stage，使用主 Stage', { userId });
        targetStageArn = process.env.MASTER_STAGE_ARN!;
      } else {
        targetStageArn = bestStage;
        logger.debug('自動分配到最佳 Stage', {
          userId,
          stageArn: targetStageArn.substring(targetStageArn.length - 12),
        });
      }
    }

    if (!targetStageArn) {
      return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
        error: ERROR_CODES.INTERNAL_ERROR,
        message: '未配置 Stage ARN',
      });
    }

    // 檢查主播是否在線
    const redis = RedisService.getInstance();
    const isPublisherLive = await redis.getPublisherStatus();

    if (!isPublisherLive) {
      return res.status(HTTP_STATUS.NOT_FOUND).json({
        error: ERROR_CODES.NOT_FOUND,
        message: '主播未開播',
      });
    }

    // 檢查 Stage 是否已滿
    const viewerCount = await redis.getStageViewerCount(targetStageArn);
    if (viewerCount >= 50) {
      logger.warn('⚠️ Stage 已滿', {
        stageArn: targetStageArn.substring(targetStageArn.length - 12),
        viewerCount,
        userId,
      });
      return res.status(HTTP_STATUS.SERVICE_UNAVAILABLE).json({
        error: ERROR_CODES.STAGE_FULL,
        message: 'Stage 已滿，請稍後再試',
      });
    }

    // 生成 Token
    const token = await getIVSService().createViewerToken(userId, targetStageArn);

    // 增加觀眾計數
    await redis.incrementViewerCount(targetStageArn);

    // 自動記錄觀眾加入（用於心跳追蹤）
    const heartbeat = ViewerHeartbeatService.getInstance();
    await heartbeat.recordViewerJoin(userId, targetStageArn, token.participantId);

    // 返回資訊
    res.status(HTTP_STATUS.OK).json({
      success: true,
      data: {
        token: token.token,
        participantId: token.participantId,
        userId: token.userId,
        stageArn: token.stageArn,
        capabilities: token.capabilities,
        expiresAt: token.expiresAt,
        expiresIn: Math.floor((token.expiresAt.getTime() - Date.now()) / 1000),
        currentViewers: viewerCount + 1,
      },
    });

    logger.info('✅ 觀眾 Token 生成成功', {
      userId,
      participantId: token.participantId,
      stageArn: targetStageArn.substring(targetStageArn.length - 12),
      viewerCount: viewerCount + 1,
    });
  } catch (error: any) {
    logger.error('❌ 觀眾 Token 生成失敗', { error: error.message });
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      error: ERROR_CODES.TOKEN_GENERATION_FAILED,
      message: 'Token 生成失敗',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
});

/**
 * POST /api/token/mediaserver
 * 生成 Media Server Token (PUBLISH + SUBSCRIBE 權限)
 * 僅供內部使用
 */
router.post('/mediaserver', async (req: Request, res: Response) => {
  try {
    const { serverId, stageArn } = req.body;

    if (!serverId || !stageArn) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        error: ERROR_CODES.VALIDATION_ERROR,
        message: '缺少 serverId 或 stageArn',
      });
    }

    // 驗證是否為內部請求
    const internalSecret = req.headers['x-internal-secret'];
    if (internalSecret !== process.env.INTERNAL_SECRET) {
      return res.status(HTTP_STATUS.FORBIDDEN).json({
        error: ERROR_CODES.FORBIDDEN,
        message: '無權訪問',
      });
    }

    // 生成 Token
    const token = await getIVSService().createMediaServerToken(serverId, stageArn);

    res.status(HTTP_STATUS.OK).json({
      success: true,
      data: {
        token: token.token,
        participantId: token.participantId,
        stageArn: token.stageArn,
        capabilities: token.capabilities,
        expiresAt: token.expiresAt,
      },
    });

    logger.info('✅ Media Server Token 生成成功', {
      serverId,
      stageArn,
    });
  } catch (error: any) {
    logger.error('❌ Media Server Token 生成失敗', { error: error.message });
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      error: ERROR_CODES.TOKEN_GENERATION_FAILED,
      message: 'Token 生成失敗',
    });
  }
});

/**
 * POST /api/token/publisher-all
 * 生成所有 Stage 的主播 Token（用于多 Stage 同时推流）
 *
 * 这是生产就绪方案的核心 API
 * 主播通过 Web 界面使用返回的所有 Token 同时加入所有 Stage
 */
router.post('/publisher-all', async (req: Request, res: Response) => {
  try {
    const { userId } = req.body;

    if (!userId) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        error: ERROR_CODES.VALIDATION_ERROR,
        message: '缺少 userId',
      });
    }

    logger.info('收到批量主播 Token 请求', { userId });

    const redis = RedisService.getInstance();

    // 获取所有活跃 Stage
    let stageArns = await redis.getActiveStages();

    // 如果没有 Stage，使用主 Stage
    if (stageArns.length === 0 && process.env.MASTER_STAGE_ARN) {
      stageArns = [process.env.MASTER_STAGE_ARN];
      logger.info('没有活跃 Stage，使用主 Stage', {
        masterStage: process.env.MASTER_STAGE_ARN.substring(process.env.MASTER_STAGE_ARN.length - 12),
      });
    }

    if (stageArns.length === 0) {
      return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
        error: ERROR_CODES.INTERNAL_ERROR,
        message: '没有可用的 Stage',
      });
    }

    // 为每个 Stage 生成 Token
    const tokens = await Promise.all(
      stageArns.map(async (stageArn) => {
        try {
          const token = await getIVSService().createPublisherToken(userId, stageArn);
          return {
            success: true,
            stageArn: token.stageArn,
            stageId: stageArn.substring(stageArn.length - 12),
            token: token.token,
            participantId: token.participantId,
            capabilities: token.capabilities,
            expiresAt: token.expiresAt,
            expiresIn: Math.floor((token.expiresAt.getTime() - Date.now()) / 1000),
          };
        } catch (error: any) {
          logger.error('为 Stage 生成 Token 失败', {
            stageArn: stageArn.substring(stageArn.length - 12),
            error: error.message,
          });
          return {
            success: false,
            stageArn,
            stageId: stageArn.substring(stageArn.length - 12),
            error: error.message,
          };
        }
      })
    );

    // 统计成功/失败
    const successful = tokens.filter(t => t.success);
    const failed = tokens.filter(t => !t.success);

    // 更新主播状态
    await redis.setPublisherStatus(true);

    res.status(HTTP_STATUS.OK).json({
      success: true,
      data: {
        userId,
        totalStages: stageArns.length,
        successfulTokens: successful.length,
        failedTokens: failed.length,
        tokens: successful,
        failures: failed.length > 0 ? failed : undefined,
        whipEndpoint: API_ENDPOINTS.WHIP,
      },
      instructions: {
        web: {
          sdk: 'amazon-ivs-web-broadcast',
          usage: 'Use IVSBroadcastClient.Stage.join() for each token',
          note: '为每个 token 创建 Stage 实例并加入，实现多 Stage 同时推流',
        },
      },
    });

    logger.info('✅ 批量主播 Token 生成完成', {
      userId,
      totalStages: stageArns.length,
      successful: successful.length,
      failed: failed.length,
    });
  } catch (error: any) {
    logger.error('❌ 批量主播 Token 生成失败', { error: error.message });
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      error: ERROR_CODES.TOKEN_GENERATION_FAILED,
      message: 'Token 批量生成失败',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
});

export default router;
