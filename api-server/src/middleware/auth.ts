/**
 * 認證中間件
 * API Key 驗證
 */

import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';
import { HTTP_STATUS, ERROR_CODES } from '../utils/constants';

export const apiKeyAuth = (req: Request, res: Response, next: NextFunction) => {
  const apiKey = req.headers['x-api-key'] as string;
  const expectedApiKey = process.env.API_SECRET_KEY;

  // 開發環境跳過驗證
  if (process.env.NODE_ENV === 'development' && process.env.SKIP_AUTH === 'true') {
    logger.debug('開發環境：跳過 API Key 驗證');
    return next();
  }

  if (!apiKey) {
    logger.warn('API Key 缺失', { ip: req.ip, path: req.path });
    return res.status(HTTP_STATUS.UNAUTHORIZED).json({
      error: ERROR_CODES.UNAUTHORIZED,
      message: '缺少 API Key',
    });
  }

  if (apiKey !== expectedApiKey) {
    logger.warn('API Key 無效', { ip: req.ip, path: req.path });
    return res.status(HTTP_STATUS.UNAUTHORIZED).json({
      error: ERROR_CODES.UNAUTHORIZED,
      message: 'API Key 無效',
    });
  }

  next();
};

export default apiKeyAuth;
