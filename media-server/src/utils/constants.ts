/**
 * 常數定義
 */

export const SERVER_CONFIG = {
  PORT: parseInt(process.env.PORT || '3001'),
  SERVER_ID: process.env.SERVER_ID || 'media-server-01',
  SERVER_IP: process.env.SERVER_IP || 'localhost',
  NODE_ENV: process.env.NODE_ENV || 'development',
};

export const API_CONFIG = {
  API_SERVER_URL: process.env.API_SERVER_URL || 'http://localhost:3000',
  API_SECRET_KEY: process.env.API_SECRET_KEY || '',
  MEDIA_SERVER_SECRET: process.env.MEDIA_SERVER_SECRET || '',
};

export const WHIP_CONFIG = {
  ENDPOINT: process.env.WHIP_ENDPOINT || 'https://global.whip.live-video.net',
};

export const MONITORING_CONFIG = {
  HEARTBEAT_INTERVAL: parseInt(process.env.HEARTBEAT_INTERVAL || '30000'),
  STAGE_SYNC_INTERVAL: parseInt(process.env.STAGE_SYNC_INTERVAL || '60000'),
  ENABLE_AUTO_SYNC: process.env.ENABLE_AUTO_SYNC === 'true',
};

export const HTTP_STATUS = {
  OK: 200,
  CREATED: 201,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  INTERNAL_SERVER_ERROR: 500,
};

export default {
  SERVER_CONFIG,
  API_CONFIG,
  WHIP_CONFIG,
  MONITORING_CONFIG,
  HTTP_STATUS,
};
