/**
 * Rate Limiting 中間件
 */

import rateLimit from 'express-rate-limit';
import { RATE_LIMIT } from '../utils/constants';
import { logger } from '../utils/logger';

export const rateLimiter = rateLimit({
  windowMs: RATE_LIMIT.WINDOW_MS,
  max: RATE_LIMIT.MAX_REQUESTS,
  message: {
    error: 'TOO_MANY_REQUESTS',
    message: '請求過於頻繁，請稍後再試',
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    logger.warn('Rate limit 觸發', {
      ip: req.ip,
      path: req.path,
    });
    res.status(429).json({
      error: 'TOO_MANY_REQUESTS',
      message: '請求過於頻繁，請稍後再試',
    });
  },
});

export default rateLimiter;
