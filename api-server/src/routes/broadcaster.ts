/**
 * Broadcaster API Routes
 * 為主播端提供 Stage 列表和 Token 生成
 */

import { Router, Request, Response } from 'express';
import { TokenService } from '../services/TokenService';
import { StageManager } from '../utils/StageManager';
import { logger } from '../utils/logger';

const router = Router();
const tokenService = new TokenService();

/**
 * 獲取所有活躍 Stage 及其 PUBLISH tokens
 * GET /api/broadcaster/stages
 */
router.get('/stages', async (req: Request, res: Response) => {
  try {
    const stages = await StageManager.getInstance().listStages();

    const stagesWithTokens = await Promise.all(
      stages.map(async (stage) => {
        const token = await tokenService.generateToken({
          stageArn: stage.arn,
          capability: 'PUBLISH',
          duration: 7200, // 2 小時
        });

        return {
          stageArn: stage.arn,
          stageId: stage.arn.split('/').pop(),
          token: token,
          viewerCount: stage.activeParticipants || 0,
        };
      })
    );

    logger.info('📋 主播端請求 Stage 列表', {
      count: stagesWithTokens.length,
    });

    res.json({
      stages: stagesWithTokens,
      total: stagesWithTokens.length,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    logger.error('獲取 Stage 列表失敗', { error: error.message });
    res.status(500).json({
      error: '獲取 Stage 列表失敗',
      message: error.message,
    });
  }
});

/**
 * 為單個 Stage 生成 PUBLISH token
 * POST /api/broadcaster/stage-token
 * Body: { stageArn: string }
 */
router.post('/stage-token', async (req: Request, res: Response) => {
  try {
    const { stageArn } = req.body;

    if (!stageArn) {
      return res.status(400).json({ error: '缺少 stageArn 參數' });
    }

    const token = await tokenService.generateToken({
      stageArn: stageArn,
      capability: 'PUBLISH',
      duration: 7200, // 2 小時
    });

    logger.info('🎫 為主播端生成 Stage Token', {
      stageId: stageArn.split('/').pop(),
    });

    res.json({
      token,
      stageArn,
      expiresIn: 7200,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    logger.error('生成 Stage Token 失敗', {
      error: error.message,
      stageArn: req.body.stageArn,
    });
    res.status(500).json({
      error: '生成 Token 失敗',
      message: error.message,
    });
  }
});

/**
 * 主播端健康檢查
 * GET /api/broadcaster/health
 */
router.get('/health', (req: Request, res: Response) => {
  res.json({
    status: 'ok',
    service: 'broadcaster-api',
    timestamp: new Date().toISOString(),
  });
});

export default router;
