/**
 * 健康檢查路由
 */

import { Router, Request, Response } from 'express';
import { StageManager } from '../services/StageManager';
import { SERVER_CONFIG } from '../utils/constants';

const router = Router();

/**
 * GET /health
 * 健康檢查端點
 */
router.get('/', (req: Request, res: Response) => {
  const stageManager = StageManager.getInstance();
  const stats = stageManager.getStats();

  res.json({
    status: 'healthy',
    service: 'Media Server',
    version: '1.0.0',
    serverId: SERVER_CONFIG.SERVER_ID,
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    stats: {
      publisherActive: stats.publisherActive,
      connectedStages: stats.connectedStages,
      activeConnections: stats.activeConnections,
    },
  });
});

/**
 * GET /health/ready
 * 就緒檢查端點
 */
router.get('/ready', (req: Request, res: Response) => {
  const stageManager = StageManager.getInstance();
  const stats = stageManager.getStats();

  const isReady = stats.connectedStages >= 0; // 至少初始化完成

  res.status(isReady ? 200 : 503).json({
    ready: isReady,
    stats,
  });
});

/**
 * GET /health/live
 * 存活檢查端點
 */
router.get('/live', (req: Request, res: Response) => {
  res.json({
    alive: true,
    timestamp: new Date().toISOString(),
  });
});

export default router;
