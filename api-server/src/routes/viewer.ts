/**
 * 觀眾心跳和管理路由
 */

import { Router, Request, Response } from 'express';
import { ViewerHeartbeatService } from '../services/ViewerHeartbeatService';
import { RedisService } from '../services/RedisService';
import { ViewerRecordService } from '../services/ViewerRecordService';
import { logger } from '../utils/logger';
import { HTTP_STATUS, ERROR_CODES } from '../utils/constants';
import {
  sendSuccess,
  sendError,
  sendValidationError,
  sendNotFound,
  sendInternalError,
} from '../utils/responseHelper';

const router = Router();

/**
 * POST /api/viewer/rejoin
 * 觀眾重新加入直播（Token 還有效的情況）
 */
router.post('/rejoin', async (req: Request, res: Response) => {
  try {
    const { userId, stageArn, participantId } = req.body;

    if (!userId || !stageArn || !participantId) {
      const missingFields = [];
      if (!userId) missingFields.push('userId');
      if (!stageArn) missingFields.push('stageArn');
      if (!participantId) missingFields.push('participantId');
      return sendValidationError(res, '缺少必要參數', missingFields);
    }

    const heartbeat = ViewerHeartbeatService.getInstance();
    const redis = RedisService.getInstance();
    const viewerRecord = ViewerRecordService.getInstance();

    // 1. 更新 Redis（即時數據）
    await heartbeat.recordViewerJoin(userId, stageArn, participantId);
    await redis.incrementViewerCount(stageArn);

    const viewerCount = await redis.getStageViewerCount(stageArn);

    // 2. 寫入資料庫（持久化）- 異步執行，不阻塞響應
    viewerRecord.recordJoin({
      userId,
      stageArn,
      participantId,
      joinedAt: new Date(),
      userAgent: req.headers['user-agent'],
      ipAddress: req.ip,
    }).catch(err => {
      logger.error('寫入觀看記錄失敗', { error: err.message, userId });
    });

    logger.info('🔄 觀眾重新加入', {
      userId,
      participantId,
      stageArn: stageArn.substring(stageArn.length - 12),
      currentViewers: viewerCount,
    });

    // 3. 立即返回響應
    sendSuccess(res, {
      userId,
      stageArn,
      participantId,
      currentViewers: viewerCount,
    }, HTTP_STATUS.OK, '重新加入成功');
  } catch (error: any) {
    logger.error('觀眾重新加入失敗', { error: error.message });
    sendInternalError(res, error, '重新加入失敗');
  }
});

/**
 * POST /api/viewer/heartbeat
 * 觀眾心跳更新
 */
router.post('/heartbeat', async (req: Request, res: Response) => {
  try {
    const { userId, stageArn } = req.body;

    if (!userId || !stageArn) {
      const missingFields = [];
      if (!userId) missingFields.push('userId');
      if (!stageArn) missingFields.push('stageArn');
      return sendValidationError(res, '缺少必要參數', missingFields);
    }

    const heartbeat = ViewerHeartbeatService.getInstance();
    const success = await heartbeat.updateViewerHeartbeat(userId, stageArn);

    if (!success) {
      return sendNotFound(res, '觀眾 Session');
    }

    sendSuccess(res, {
      userId,
      stageArn,
      heartbeatUpdated: true,
    }, HTTP_STATUS.OK, '心跳更新成功');
  } catch (error: any) {
    logger.error('心跳更新失敗', { error: error.message });
    sendInternalError(res, error, '心跳更新失敗');
  }
});

/**
 * POST /api/viewer/leave
 * 觀眾主動離開
 */
router.post('/leave', async (req: Request, res: Response) => {
  try {
    const { userId, stageArn } = req.body;

    if (!userId || !stageArn) {
      const missingFields = [];
      if (!userId) missingFields.push('userId');
      if (!stageArn) missingFields.push('stageArn');
      return sendValidationError(res, '缺少必要參數', missingFields);
    }

    const heartbeat = ViewerHeartbeatService.getInstance();
    const viewerRecord = ViewerRecordService.getInstance();

    // 1. 更新 Redis（即時數據）
    await heartbeat.recordViewerLeave(userId, stageArn);

    // 2. 更新資料庫（持久化）- 異步執行，不阻塞響應
    viewerRecord.recordLeave(userId, stageArn).catch(err => {
      logger.error('更新觀看記錄失敗', { error: err.message, userId });
    });

    // 3. 立即返回響應
    sendSuccess(res, {
      userId,
      stageArn,
      viewerLeft: true,
    }, HTTP_STATUS.OK, '觀眾離開記錄成功');
  } catch (error: any) {
    logger.error('記錄觀眾離開失敗', { error: error.message });
    sendInternalError(res, error, '記錄離開失敗');
  }
});

/**
 * GET /api/viewer/list/:stageArn
 * 獲取 Stage 的活躍觀眾列表
 */
router.get('/list/:stageArn', async (req: Request, res: Response) => {
  try {
    const { stageArn } = req.params;

    const heartbeat = ViewerHeartbeatService.getInstance();
    const viewers = await heartbeat.getActiveViewers(stageArn);
    const redis = RedisService.getInstance();
    const viewerCount = await redis.getStageViewerCount(stageArn);

    sendSuccess(res, {
      stageArn,
      totalViewers: viewerCount,
      activeViewers: viewers.length,
      viewers: viewers,
    });
  } catch (error: any) {
    logger.error('獲取觀眾列表失敗', { error: error.message });
    sendInternalError(res, error, '獲取觀眾列表失敗');
  }
});

/**
 * GET /api/viewer/duration
 * 獲取觀眾觀看時長（從 Redis）
 */
router.get('/duration', async (req: Request, res: Response) => {
  try {
    const { userId, stageArn } = req.query;

    if (!userId || !stageArn) {
      const missingFields = [];
      if (!userId) missingFields.push('userId');
      if (!stageArn) missingFields.push('stageArn');
      return sendValidationError(res, '缺少必要參數', missingFields);
    }

    const heartbeat = ViewerHeartbeatService.getInstance();
    const duration = await heartbeat.getViewerWatchDuration(
      userId as string,
      stageArn as string
    );

    sendSuccess(res, {
      userId,
      stageArn,
      watchDurationSeconds: duration,
      watchDurationFormatted: `${Math.floor(duration / 60)}分 ${duration % 60}秒`,
    });
  } catch (error: any) {
    logger.error('獲取觀看時長失敗', { error: error.message });
    sendInternalError(res, error, '獲取觀看時長失敗');
  }
});

/**
 * GET /api/viewer/history/:userId
 * 獲取觀眾的觀看歷史（從資料庫）
 */
router.get('/history/:userId', async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const limit = parseInt(req.query.limit as string) || 10;

    const viewerRecord = ViewerRecordService.getInstance();
    const history = await viewerRecord.getViewerHistory(userId, limit);

    sendSuccess(res, {
      userId,
      totalRecords: history.length,
      history,
    });
  } catch (error: any) {
    logger.error('獲取觀看歷史失敗', { error: error.message });
    sendInternalError(res, error, '獲取觀看歷史失敗');
  }
});

/**
 * GET /api/viewer/stats/:stageArn
 * 獲取 Stage 的統計數據（從資料庫）
 */
router.get('/stats/:stageArn', async (req: Request, res: Response) => {
  try {
    const { stageArn } = req.params;
    const days = parseInt(req.query.days as string) || 7;

    const viewerRecord = ViewerRecordService.getInstance();
    const stats = await viewerRecord.getStageStats(stageArn, days);

    if (!stats) {
      return sendSuccess(res, {
        stageArn,
        days,
        message: '暫無統計數據',
      });
    }

    sendSuccess(res, {
      stageArn,
      days,
      stats,
    });
  } catch (error: any) {
    logger.error('獲取統計數據失敗', { error: error.message });
    sendInternalError(res, error, '獲取統計數據失敗');
  }
});

export default router;
