/**
 * Stage 管理路由
 * 提供 Stage 的創建、查詢和管理功能
 * 
 * 修復日期: 2025-10-19
 * 修復內容: 修正路由順序，避免 /list 被當作 :stageArn 處理
 */

import { Router, Request, Response } from 'express';
import {
  IVSRealTimeClient,
  CreateStageCommand,
  GetStageCommand,
  ListStagesCommand,
  DeleteStageCommand,
  UpdateStageCommand,
} from '@aws-sdk/client-ivs-realtime';
import { RedisService } from '../services/RedisService';
import { logger } from '../utils/logger';
import { HTTP_STATUS, ERROR_CODES, STAGE_CONFIG } from '../utils/constants';

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
 * GET /api/stage/list
 * 列出所有 Stage
 * 
 * 重要: 這個路由必須在 /:stageArn 之前，否則 "list" 會被當作 stageArn
 */
router.get('/list', async (req: Request, res: Response) => {
  try {
    const command = new ListStagesCommand({
      maxResults: 50,
    });

    const response = await getIVSClient().send(command);

    // 從 Redis 獲取每個 Stage 的觀眾數
    const redis = RedisService.getInstance();
    const stagesWithCounts = await Promise.all(
      (response.stages || []).map(async (stage) => {
        if (!stage.arn) return null;
        const viewerCount = await redis.getStageViewerCount(stage.arn);
        const stageInfo = await redis.getStageInfo(stage.arn);
        return {
          stageArn: stage.arn,  // 修復: 明確返回 stageArn 欄位
          name: stage.name,
          viewerCount,
          autoScaled: stageInfo?.autoScaled || false,
          createdAt: stageInfo?.createdAt || stage.activeSessionId,
          tags: stage.tags,
        };
      })
    );

    // 過濾掉 null 值
    const validStages = stagesWithCounts.filter(s => s !== null);

    res.status(HTTP_STATUS.OK).json({
      success: true,
      data: {
        stages: validStages,
        totalStages: validStages.length,  // 修復: 添加 totalStages 欄位
        nextToken: response.nextToken,
        timestamp: new Date().toISOString(),
      },
    });

    logger.info('✅ Stage 列表已返回', { count: validStages.length });
  } catch (error: any) {
    logger.error('❌ 獲取 Stage 列表失敗', { error: error.message });
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      error: ERROR_CODES.INTERNAL_ERROR,
      message: '獲取 Stage 列表失敗',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
});

/**
 * GET /api/stage/master/info
 * 獲取主 Stage 資訊
 * 
 * 重要: 這個路由也必須在 /:stageArn 之前
 */
router.get('/master/info', async (req: Request, res: Response) => {
  try {
    const masterStageArn = process.env.MASTER_STAGE_ARN;

    if (!masterStageArn) {
      return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
        error: ERROR_CODES.INTERNAL_ERROR,
        message: '未配置主 Stage ARN',
      });
    }

    const command = new GetStageCommand({
      arn: masterStageArn,
    });

    const response = await getIVSClient().send(command);

    // 從 Redis 獲取統計資料
    const redis = RedisService.getInstance();
    const viewerCount = await redis.getStageViewerCount(masterStageArn);

    res.status(HTTP_STATUS.OK).json({
      success: true,
      data: {
        stage: response.stage,
        viewerCount,
        isMaster: true,
        timestamp: new Date().toISOString(),
      },
    });

    logger.info('✅ 主 Stage 資訊已返回');
  } catch (error: any) {
    logger.error('❌ 獲取主 Stage 失敗', { error: error.message });
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      error: ERROR_CODES.INTERNAL_ERROR,
      message: '獲取主 Stage 失敗',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
});

/**
 * POST /api/stage
 * 創建新的 Stage
 */
router.post('/', async (req: Request, res: Response) => {
  try {
    const { name, tags } = req.body;

    if (!name) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        error: ERROR_CODES.VALIDATION_ERROR,
        message: '缺少 name 參數',
      });
    }

    // 檢查 Stage 數量限制
    const redis = RedisService.getInstance();
    const activeStages = await redis.getActiveStages();

    if (activeStages.length >= STAGE_CONFIG.MAX_STAGES) {
      return res.status(HTTP_STATUS.SERVICE_UNAVAILABLE).json({
        error: ERROR_CODES.STAGE_LIMIT_REACHED,
        message: `已達到 Stage 數量上限 (${STAGE_CONFIG.MAX_STAGES})`,
      });
    }

    const command = new CreateStageCommand({
      name,
      tags: {
        Environment: process.env.NODE_ENV || 'development',
        ManagedBy: 'api-server',
        ...tags,
      },
    });

    const response = await getIVSClient().send(command);

    if (!response.stage?.arn) {
      throw new Error('Stage 創建失敗：回應中沒有 ARN');
    }

    // 在 Redis 中記錄新 Stage
    await redis.setStageInfo(response.stage.arn, {
      name,
      createdAt: new Date().toISOString(),
      managedBy: 'api-server',
    });

    res.status(HTTP_STATUS.CREATED).json({
      success: true,
      data: {
        stage: response.stage,
        timestamp: new Date().toISOString(),
      },
    });

    logger.info('✅ Stage 創建成功', {
      name,
      arn: response.stage.arn,
    });
  } catch (error: any) {
    logger.error('❌ Stage 創建失敗', { error: error.message });
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      error: ERROR_CODES.INTERNAL_ERROR,
      message: 'Stage 創建失敗',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
});

/**
 * GET /api/stage/:stageArn
 * 獲取特定 Stage 的詳細資訊
 * 
 * 重要: 這個路由必須在所有固定路徑之後
 */
router.get('/:stageArn', async (req: Request, res: Response) => {
  try {
    const { stageArn } = req.params;

    const command = new GetStageCommand({
      arn: stageArn,
    });

    const response = await getIVSClient().send(command);

    // 從 Redis 獲取統計資料
    const redis = RedisService.getInstance();
    const viewerCount = await redis.getStageViewerCount(stageArn);

    res.status(HTTP_STATUS.OK).json({
      success: true,
      data: {
        stage: response.stage,
        viewerCount,
        timestamp: new Date().toISOString(),
      },
    });

    logger.info('Stage 資訊已返回', { stageArn });
  } catch (error: any) {
    logger.error('獲取 Stage 失敗', { error: error.message });

    if (error.name === 'ResourceNotFoundException') {
      return res.status(HTTP_STATUS.NOT_FOUND).json({
        error: ERROR_CODES.NOT_FOUND,
        message: 'Stage 不存在',
      });
    }

    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      error: ERROR_CODES.INTERNAL_ERROR,
      message: '獲取 Stage 失敗',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
});

/**
 * PUT /api/stage/:stageArn
 * 更新 Stage 配置
 */
router.put('/:stageArn', async (req: Request, res: Response) => {
  try {
    const { stageArn } = req.params;
    const { name } = req.body;

    const command = new UpdateStageCommand({
      arn: stageArn,
      name,
    });

    const response = await getIVSClient().send(command);

    res.status(HTTP_STATUS.OK).json({
      success: true,
      data: {
        stage: response.stage,
        timestamp: new Date().toISOString(),
      },
    });

    logger.info('Stage 更新成功', { stageArn });
  } catch (error: any) {
    logger.error('Stage 更新失敗', { error: error.message });

    if (error.name === 'ResourceNotFoundException') {
      return res.status(HTTP_STATUS.NOT_FOUND).json({
        error: ERROR_CODES.NOT_FOUND,
        message: 'Stage 不存在',
      });
    }

    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      error: ERROR_CODES.INTERNAL_ERROR,
      message: 'Stage 更新失敗',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
});

/**
 * DELETE /api/stage/:stageArn
 * 刪除 Stage
 */
router.delete('/:stageArn', async (req: Request, res: Response) => {
  try {
    const { stageArn } = req.params;

    // 不允許刪除主 Stage
    if (stageArn === process.env.MASTER_STAGE_ARN) {
      return res.status(HTTP_STATUS.FORBIDDEN).json({
        error: ERROR_CODES.FORBIDDEN,
        message: '無法刪除主 Stage',
      });
    }

    // 檢查是否有觀眾
    const redis = RedisService.getInstance();
    const viewerCount = await redis.getStageViewerCount(stageArn);

    if (viewerCount > 0) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        error: ERROR_CODES.VALIDATION_ERROR,
        message: 'Stage 中仍有觀眾，無法刪除',
        data: { viewerCount },
      });
    }

    const command = new DeleteStageCommand({
      arn: stageArn,
    });

    await getIVSClient().send(command);

    // 從 Redis 中移除記錄
    await redis.del(`stage:${stageArn}`);
    await redis.del(`viewers:${stageArn}`);

    res.status(HTTP_STATUS.OK).json({
      success: true,
      message: 'Stage 已刪除',
      timestamp: new Date().toISOString(),
    });

    logger.info('✅ Stage 刪除成功', { stageArn });
  } catch (error: any) {
    logger.error('❌ Stage 刪除失敗', { error: error.message });

    if (error.name === 'ResourceNotFoundException') {
      return res.status(HTTP_STATUS.NOT_FOUND).json({
        error: ERROR_CODES.NOT_FOUND,
        message: 'Stage 不存在',
      });
    }

    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      error: ERROR_CODES.INTERNAL_ERROR,
      message: 'Stage 刪除失敗',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
});

export default router;
