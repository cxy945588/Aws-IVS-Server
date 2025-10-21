/**
 * 日誌工具
 * 使用 Winston 進行結構化日誌記錄
 */

import winston from 'winston';

const { combine, timestamp, printf, colorize, errors } = winston.format;

// 自定義日誌格式
const logFormat = printf(({ level, message, timestamp, ...metadata }) => {
  let msg = `${timestamp} [${level}]: ${message}`;
  
  if (Object.keys(metadata).length > 0) {
    msg += ` ${JSON.stringify(metadata)}`;
  }
  
  return msg;
});

// 創建 Logger 實例
export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: combine(
    errors({ stack: true }),
    timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    logFormat
  ),
  transports: [
    // 控制台輸出
    new winston.transports.Console({
      format: combine(
        colorize(),
        logFormat
      ),
    }),
    // 錯誤日誌檔案
    new winston.transports.File({
      filename: 'logs/error.log',
      level: 'error',
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    }),
    // 所有日誌檔案
    new winston.transports.File({
      filename: 'logs/combined.log',
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    }),
  ],
});

// 生產環境不輸出到控制台
if (process.env.NODE_ENV === 'production') {
  logger.remove(logger.transports[0]);
}

export default logger;
