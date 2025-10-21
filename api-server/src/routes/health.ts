/**
 * 健康檢查路由
 */

import { Router, Request, Response } from 'express';
import { RedisService } from '../services/RedisService';
import { logger } from '../utils/logger';

const router = Router();

router.get('/', async (req: Request, res: Response) => {
  try {
    const redis = RedisService.getInstance();
    
    // 檢查 Redis 連接
    let redisStatus = 'disconnected';
    try {
      await redis.ping();
      redisStatus = 'connected';
    } catch (error) {
      logger.error('Redis 健康檢查失敗', { error });
    }

    // 獲取系統資訊
    const health = {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: process.env.NODE_ENV,
      version: '1.0.0',
      services: {
        redis: redisStatus,
        aws: {
          region: process.env.AWS_REGION,
          stageConfigured: !!process.env.MASTER_STAGE_ARN,
        },
      },
      memory: {
        used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
        total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
        unit: 'MB',
      },
    };

    res.json(health);
  } catch (error) {
    logger.error('健康檢查失敗', { error });
    res.status(503).json({
      status: 'error',
      message: '服務不可用',
    });
  }
});

export default router;
