/**
 * 錯誤處理中間件
 */

import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';
import { HTTP_STATUS, ERROR_CODES } from '../utils/constants';

export const errorHandler = (
  err: any,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  logger.error('未捕獲的錯誤', {
    error: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method,
    ip: req.ip,
  });

  // AWS SDK 錯誤
  if (err.name && err.name.includes('AWS')) {
    return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      error: ERROR_CODES.INTERNAL_ERROR,
      message: 'AWS 服務錯誤',
      details: process.env.NODE_ENV === 'development' ? err.message : undefined,
    });
  }

  // 驗證錯誤
  if (err.name === 'ValidationError') {
    return res.status(HTTP_STATUS.BAD_REQUEST).json({
      error: ERROR_CODES.VALIDATION_ERROR,
      message: '資料驗證失敗',
      details: err.details,
    });
  }

  // 預設錯誤回應
  return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
    error: ERROR_CODES.INTERNAL_ERROR,
    message: '伺服器內部錯誤',
    details: process.env.NODE_ENV === 'development' ? err.message : undefined,
  });
};

export default errorHandler;
