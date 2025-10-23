/**
 * Media Server 主程式
 * 接收主播流並轉發到多個 IVS Stage
 *
 * 架構:
 * 1. 向 API Server 註冊
 * 2. 監聽 API Server WebSocket
 * 3. 自動連接所有 Stage
 * 4. 轉發主播流到多個 Stage
 */

import express from 'express';
import { createServer } from 'http';
import dotenv from 'dotenv';
import cors from 'cors';
import helmet from 'helmet';

import { APIClientService } from './services/APIClientService';
import { StageManager } from './services/StageManager';
import { logger } from './utils/logger';
import { SERVER_CONFIG, MONITORING_CONFIG } from './utils/constants';

import healthRoutes from './routes/health';

// 載入環境變數
dotenv.config();

const app = express();

// ==========================================
// 中間件配置
// ==========================================

// 安全性
app.use(helmet());

// CORS
app.use(cors({
  origin: '*',
  credentials: true,
}));

// 請求解析
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ==========================================
// 路由配置
// ==========================================

// 健康檢查
app.use('/health', healthRoutes);

// 根路徑
app.get('/', (req, res) => {
  const stageManager = StageManager.getInstance();
  const stats = stageManager.getStats();

  res.json({
    service: 'AWS IVS Media Server',
    version: '1.0.0',
    serverId: SERVER_CONFIG.SERVER_ID,
    status: 'running',
    timestamp: new Date().toISOString(),
    stats,
  });
});

// 404 處理
app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Not Found',
    message: `路由 ${req.originalUrl} 不存在`,
  });
});

// ==========================================
// HTTP Server
// ==========================================

const httpServer = createServer(app);

// ==========================================
// 初始化服務
// ==========================================

async function initialize() {
  try {
    logger.info('🚀 正在初始化 Media Server...');
    logger.info('='.repeat(50));

    // 1. 初始化 API Client
    const apiClient = APIClientService.getInstance();
    await apiClient.register();
    logger.info('✅ 已向 API Server 註冊');

    // 2. 初始化 Stage Manager
    const stageManager = StageManager.getInstance();
    await stageManager.initialize();
    logger.info('✅ Stage Manager 初始化完成');

    // 3. 連接到 API Server WebSocket
    apiClient.connectWebSocket();
    logger.info('✅ WebSocket 連接已建立');

    // 4. 同步所有 Stage
    await stageManager.syncAllStages();
    logger.info('✅ Stage 同步完成');

    // 5. 啟動定期同步（如果啟用）
    if (MONITORING_CONFIG.ENABLE_AUTO_SYNC) {
      stageManager.startPeriodicSync(MONITORING_CONFIG.STAGE_SYNC_INTERVAL);
      logger.info('✅ 定期 Stage 同步已啟動');
    }

    logger.info('='.repeat(50));
    logger.info('🎉 Media Server 初始化完成');
  } catch (error: any) {
    logger.error('❌ 初始化失敗', {
      error: error.message,
      stack: error.stack,
    });
    process.exit(1);
  }
}

// ==========================================
// 啟動服務器
// ==========================================

async function start() {
  await initialize();

  httpServer.listen(SERVER_CONFIG.PORT, () => {
    logger.info('='.repeat(60));
    logger.info(`🚀 Media Server 運行於 http://localhost:${SERVER_CONFIG.PORT}`);
    logger.info(`📡 Server ID: ${SERVER_CONFIG.SERVER_ID}`);
    logger.info(`🌍 Environment: ${SERVER_CONFIG.NODE_ENV}`);
    logger.info('='.repeat(60));
  });
}

// ==========================================
// 優雅關閉
// ==========================================

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

async function gracefulShutdown() {
  logger.info('正在關閉 Media Server...');

  try {
    // 1. 停止定期同步
    const stageManager = StageManager.getInstance();
    stageManager.stopPeriodicSync();

    // 2. 斷開所有 Stage 連接
    await stageManager.disconnectAll();

    // 3. 斷開 API Server 連接
    const apiClient = APIClientService.getInstance();
    apiClient.disconnect();

    // 4. 關閉 HTTP Server
    httpServer.close(() => {
      logger.info('✅ Media Server 已優雅關閉');
      process.exit(0);
    });

    // 30 秒後強制關閉
    setTimeout(() => {
      logger.error('強制關閉（超時）');
      process.exit(1);
    }, 30000);
  } catch (error: any) {
    logger.error('關閉服務時發生錯誤', { error: error.message });
    process.exit(1);
  }
}

// 啟動
start();

export { app, httpServer };
