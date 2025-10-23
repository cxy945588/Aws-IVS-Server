/**
 * Media Server 管理路由
 * 供 Media Server 注册、同步 Stage 列表、上报状态
 *
 * 创建日期: 2025-10-23
 * 功能:
 * - Media Server 注册到 API Server
 * - 获取所有活跃 Stage 列表
 * - Media Server 心跳上报
 */

import { Router, Request, Response } from 'express';
import { RedisService } from '../services/RedisService';
import { logger } from '../utils/logger';
import { HTTP_STATUS, ERROR_CODES } from '../utils/constants';

const router = Router();

/**
 * POST /api/media/register
 * Media Server 注册
 *
 * Body:
 * - serverId: Media Server ID
 * - ipAddress: Media Server IP
 * - port: Media Server 端口（可选，默认 3001）
 */
router.post('/register', async (req: Request, res: Response) => {
  try {
    const { serverId, ipAddress, port } = req.body;

    // 验证必要参数
    if (!serverId || !ipAddress) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        error: ERROR_CODES.VALIDATION_ERROR,
        message: '缺少必要参数：serverId 或 ipAddress',
        required: ['serverId', 'ipAddress'],
      });
    }

    const redis = RedisService.getInstance();

    // 注册 Media Server 信息
    const serverInfo = {
      serverId,
      ipAddress,
      port: port || 3001,
      registeredAt: new Date().toISOString(),
      status: 'active',
    };

    await redis.set(
      `media:server:${serverId}`,
      JSON.stringify(serverInfo),
      3600 // 1 小时过期
    );

    res.status(HTTP_STATUS.OK).json({
      success: true,
      data: {
        serverId,
        registered: true,
        expiresIn: 3600,
      },
      message: 'Media Server 注册成功',
    });

    logger.info('📡 Media Server 已注册', { serverId, ipAddress, port: port || 3001 });
  } catch (error: any) {
    logger.error('Media Server 注册失败', { error: error.message });
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      error: ERROR_CODES.INTERNAL_ERROR,
      message: '注册失败',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
});

/**
 * GET /api/media/stages
 * 获取所有活跃 Stage 列表（供 Media Server 同步）
 *
 * 返回:
 * - stages: Stage 列表，包含 stageArn 和观众数
 * - totalStages: 总 Stage 数量
 */
router.get('/stages', async (req: Request, res: Response) => {
  try {
    const redis = RedisService.getInstance();

    // 获取所有活跃 Stage ARNs
    const stageArns = await redis.getActiveStages();

    // 获取每个 Stage 的观众数
    const stageList = await Promise.all(
      stageArns.map(async (stageArn) => {
        const viewerCount = await redis.getStageViewerCount(stageArn);
        return {
          stageArn,
          viewerCount,
          stageId: stageArn.substring(stageArn.length - 12), // 最后 12 位作为简短 ID
        };
      })
    );

    res.status(HTTP_STATUS.OK).json({
      success: true,
      data: {
        stages: stageList,
        totalStages: stageList.length,
        timestamp: new Date().toISOString(),
      },
    });

    logger.debug('📋 返回 Stage 列表给 Media Server', {
      count: stageList.length,
      stages: stageList.map(s => s.stageId),
    });
  } catch (error: any) {
    logger.error('获取 Stage 列表失败', { error: error.message });
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      error: ERROR_CODES.INTERNAL_ERROR,
      message: '获取 Stage 列表失败',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
});

/**
 * POST /api/media/heartbeat
 * Media Server 心跳上报
 *
 * Body:
 * - serverId: Media Server ID
 * - publisherActive: 主播是否在线（可选）
 * - connectedStages: 已连接的 Stage 数量（可选）
 */
router.post('/heartbeat', async (req: Request, res: Response) => {
  try {
    const { serverId, publisherActive, connectedStages } = req.body;

    // 验证必要参数
    if (!serverId) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        error: ERROR_CODES.VALIDATION_ERROR,
        message: '缺少 serverId',
        required: ['serverId'],
      });
    }

    const redis = RedisService.getInstance();

    // 更新心跳时间戳
    await redis.set(
      `media:server:${serverId}:heartbeat`,
      Date.now().toString(),
      60 // 60 秒过期
    );

    // 更新状态信息
    const statusInfo = {
      publisherActive: publisherActive || false,
      connectedStages: connectedStages || 0,
      lastHeartbeat: new Date().toISOString(),
    };

    await redis.set(
      `media:server:${serverId}:status`,
      JSON.stringify(statusInfo),
      60 // 60 秒过期
    );

    res.status(HTTP_STATUS.OK).json({
      success: true,
      data: {
        acknowledged: true,
        timestamp: new Date().toISOString(),
      },
    });

    logger.debug('💓 Media Server 心跳', {
      serverId,
      publisherActive,
      connectedStages,
    });
  } catch (error: any) {
    logger.error('Media Server 心跳失败', { error: error.message });
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      error: ERROR_CODES.INTERNAL_ERROR,
      message: '心跳失败',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
});

/**
 * POST /api/media/token
 * 为 Media Server 生成连接特定 Stage 的 Token
 *
 * Body:
 * - serverId: Media Server ID
 * - stageArn: Stage ARN
 *
 * Headers:
 * - x-media-auth: Media Server 认证密钥
 */
router.post('/token', async (req: Request, res: Response) => {
  try {
    const { serverId, stageArn } = req.body;

    // 验证必要参数
    if (!serverId || !stageArn) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        error: ERROR_CODES.VALIDATION_ERROR,
        message: '缺少必要参数：serverId 或 stageArn',
        required: ['serverId', 'stageArn'],
      });
    }

    // 验证 Media Server 认证
    const mediaAuth = req.headers['x-media-auth'];
    if (mediaAuth !== process.env.MEDIA_SERVER_SECRET) {
      logger.warn('❌ Media Server 认证失败', { serverId });
      return res.status(HTTP_STATUS.FORBIDDEN).json({
        error: ERROR_CODES.FORBIDDEN,
        message: 'Media Server 认证失败',
      });
    }

    // 动态导入 IVSService（避免循环依赖）
    const { IVSService } = await import('../services/IVSService');
    const ivsService = new IVSService();

    // 生成 Token
    const token = await ivsService.createMediaServerToken(serverId, stageArn);

    res.status(HTTP_STATUS.OK).json({
      success: true,
      data: {
        token: token.token,
        participantId: token.participantId,
        stageArn: token.stageArn,
        capabilities: token.capabilities,
        expiresAt: token.expiresAt,
        expiresIn: Math.floor((token.expiresAt.getTime() - Date.now()) / 1000),
        whipEndpoint: 'https://global.whip.live-video.net',
      },
    });

    logger.info('✅ Media Server Stage Token 生成成功', {
      serverId,
      stageId: stageArn.substring(stageArn.length - 12),
    });
  } catch (error: any) {
    logger.error('❌ Media Server Token 生成失败', { error: error.message });
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      error: ERROR_CODES.TOKEN_GENERATION_FAILED,
      message: 'Token 生成失败',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
});

export default router;
