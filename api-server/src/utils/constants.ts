/**
 * 常數定義
 * 所有系統常數集中管理
 */

// IVS Real-time 限制
export const IVS_LIMITS = {
  MAX_PARTICIPANTS_PER_STAGE: 50,
  MAX_RESOLUTION_HEIGHT: 720,
  MAX_BITRATE_KBPS: 8500,
  MAX_FRAMERATE: 30,
  RECOMMENDED_BITRATE_KBPS: 2500,
  RECOMMENDED_KEYFRAME_INTERVAL: 1,
};

// Token 配置
export const TOKEN_CONFIG = {
  PUBLISHER_DURATION: 14400, // 4 小時 (秒)
  VIEWER_DURATION: 3600,     // 1 小時 (秒)
  MAX_DURATION: 86400,       // 24 小時 (秒)
};

// Stage 管理
export const STAGE_CONFIG = {
  MASTER_STAGE_INDEX: 0,
  MAX_STAGES: 20,              // 最多 20 個 Stage (支援 1000 觀眾)
  SCALE_UP_THRESHOLD: 45,      // 當達到 45 人時創建新 Stage
  SCALE_DOWN_THRESHOLD: 5,     // 當少於 5 人時考慮刪除 Stage
  HEALTH_CHECK_INTERVAL: 30000, // 30 秒
};

// Redis 鍵名
export const REDIS_KEYS = {
  TOTAL_VIEWERS: 'total_viewers',
  ACTIVE_STAGES: 'active_stages',
  STAGE_INFO: (stageId: string) => `stage:${stageId}`,
  VIEWER_COUNT: (stageId: string) => `viewers:${stageId}`,
  PUBLISHER_STATUS: 'publisher:status',
  METRICS_PREFIX: 'metrics:',
};

// API 端點
export const API_ENDPOINTS = {
  WHIP: 'https://global.whip.live-video.net',
};

// 錯誤代碼
export const ERROR_CODES = {
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  STAGE_FULL: 'STAGE_FULL',
  STAGE_LIMIT_REACHED: 'STAGE_LIMIT_REACHED',
  TOKEN_GENERATION_FAILED: 'TOKEN_GENERATION_FAILED',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
};

// HTTP 狀態碼
export const HTTP_STATUS = {
  OK: 200,
  CREATED: 201,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  TOO_MANY_REQUESTS: 429,
  INTERNAL_SERVER_ERROR: 500,
  SERVICE_UNAVAILABLE: 503,
};

// 監控指標
export const METRICS = {
  NAMESPACE: process.env.CLOUDWATCH_NAMESPACE || 'IVS/Production',
  DIMENSIONS: {
    ENVIRONMENT: process.env.NODE_ENV || 'development',
    SERVICE: 'api-server',
  },
  NAMES: {
    TOTAL_VIEWERS: 'TotalViewers',
    CONCURRENT_VIEWERS: 'ConcurrentViewers',
    ACTIVE_STAGES: 'ActiveStages',
    API_LATENCY: 'APILatency',
    TOKEN_GENERATION_TIME: 'TokenGenerationTime',
    STAGE_CREATION_TIME: 'StageCreationTime',
    ERROR_COUNT: 'ErrorCount',
  },
};

// Rate Limiting
export const RATE_LIMIT = {
  WINDOW_MS: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000'), // 1 分鐘
  MAX_REQUESTS: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100'), // 100 請求
};

export default {
  IVS_LIMITS,
  TOKEN_CONFIG,
  STAGE_CONFIG,
  REDIS_KEYS,
  API_ENDPOINTS,
  ERROR_CODES,
  HTTP_STATUS,
  METRICS,
  RATE_LIMIT,
};
