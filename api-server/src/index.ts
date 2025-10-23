/**
 * AWS IVS Real-time API Server
 * 主程式入口
 * 
 * 功能：
 * - Token 生成與管理
 * - Stage 管理與自動擴展
 * - 觀眾計數與統計
 * - 監控與告警
 */

import express, { Express } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import dotenv from 'dotenv';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';

// 路由
import tokenRoutes from './routes/token';
import statsRoutes from './routes/stats';
import stageRoutes from './routes/stage';
import healthRoutes from './routes/health';
import viewerRoutes from './routes/viewer';
import broadcasterRoutes from './routes/broadcaster';

// 中間件
import { errorHandler } from './middleware/errorHandler';
import { requestLogger } from './middleware/requestLogger';
import { rateLimiter } from './middleware/rateLimiter';
import { apiKeyAuth } from './middleware/auth';

// 服務
import { RedisService } from './services/RedisService';
import { MetricsService } from './services/MetricsService';
import { StageAutoScalingService } from './services/StageAutoScalingService';
import { ViewerHeartbeatService } from './services/ViewerHeartbeatService';
import { logger } from './utils/logger';

// 載入環境變數
dotenv.config();

// 初始化 Express
const app: Express = express();
const PORT = process.env.API_PORT || 3000;

// ==========================================
// 中間件配置
// ==========================================

// 安全性
app.use(helmet());

// CORS
const corsOptions = {
  origin: process.env.CORS_ORIGINS?.split(',') || [
    'http://localhost:3000',
    'http://localhost:8080',
    'http://localhost:8081',
    'http://127.0.0.1:3000',
    'http://127.0.0.1:8080',
    'http://127.0.0.1:8081'
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key'],
};
app.use(cors(corsOptions));

// 請求解析
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// 日誌
if (process.env.NODE_ENV !== 'production') {
  app.use(morgan('dev'));
}
app.use(requestLogger);

// API Rate Limiting
app.use('/api/', rateLimiter);

// ==========================================
// 路由配置
// ==========================================

// 健康檢查 (無需認證)
app.use('/health', healthRoutes);
app.use('/api/health', healthRoutes);

// API 路由 (需要 API Key 認證)
app.use('/api/token', apiKeyAuth, tokenRoutes);
app.use('/api/stats', apiKeyAuth, statsRoutes);
app.use('/api/stage', apiKeyAuth, stageRoutes);
app.use('/api/viewer', apiKeyAuth, viewerRoutes);
app.use('/api/broadcaster', apiKeyAuth, broadcasterRoutes);

// 根路徑
app.get('/', (req, res) => {
  res.json({
    service: 'AWS IVS Real-time API Server',
    version: '1.0.0',
    status: 'running',
    timestamp: new Date().toISOString(),
    endpoints: {
      health: '/health',
      publisherToken: '/api/token/publisher',
      viewerToken: '/api/token/viewer',
      stats: '/api/stats',
      stages: '/api/stage',
      broadcaster: '/api/broadcaster',
    },
  });
});

// 404 處理
app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Not Found',
    message: `路由 ${req.originalUrl} 不存在`,
    timestamp: new Date().toISOString(),
  });
});

// 錯誤處理
app.use(errorHandler);

// ==========================================
// WebSocket 伺服器 (用於即時統計)
// ==========================================

const httpServer = createServer(app);
const wss = new WebSocketServer({ 
  server: httpServer,
  path: '/ws',
});

wss.on('connection', (ws, req) => {
  // 識別客戶端類型
  const url = new URL(req.url || '', `http://${req.headers.host}`);
  const clientType = url.searchParams.get('type');

  if (clientType === 'broadcaster') {
    (ws as any).isBroadcaster = true;
    logger.info('📡 主播端 WebSocket 已連接', { ip: req.socket.remoteAddress });
  } else {
    logger.info('WebSocket 客戶端已連接', { ip: req.socket.remoteAddress });
  }

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message.toString());
      logger.debug('收到 WebSocket 訊息', { data });

      // 處理訂閱請求
      if (data.type === 'subscribe') {
        ws.send(JSON.stringify({
          type: 'subscribed',
          channel: data.channel,
          timestamp: new Date().toISOString(),
        }));
      }
    } catch (error) {
      logger.error('WebSocket 訊息解析錯誤', { error });
    }
  });

  ws.on('close', () => {
    if ((ws as any).isBroadcaster) {
      logger.info('📡 主播端 WebSocket 已斷開連接');
    } else {
      logger.info('WebSocket 客戶端已斷開連接');
    }
  });

  ws.on('error', (error) => {
    logger.error('WebSocket 錯誤', { error });
  });
});

// 定期廣播統計資料
setInterval(async () => {
  try {
    const redis = RedisService.getInstance();
    const viewerCount = await redis.get('total_viewers');
    const activeStages = await redis.get('active_stages');

    const stats = {
      type: 'stats_update',
      data: {
        viewerCount: parseInt(viewerCount || '0'),
        activeStages: parseInt(activeStages || '0'),
        timestamp: new Date().toISOString(),
      },
    };

    wss.clients.forEach((client) => {
      if (client.readyState === 1) { // WebSocket.OPEN
        client.send(JSON.stringify(stats));
      }
    });
  } catch (error) {
    logger.error('廣播統計資料失敗', { error });
  }
}, 5000); // 每 5 秒更新一次

// ==========================================
// 服務初始化
// ==========================================

async function initializeServices() {
  try {
    logger.info('正在初始化服務...');

    // 初始化 Redis
    const redis = RedisService.getInstance();
    await redis.ping();
    logger.info('✅ Redis 連接成功');

    // 修復: 清理無效的 Redis key，防止 WRONGTYPE 錯誤
    await redis.cleanupInvalidKeys();
    logger.info('✅ Redis 資料清理完成');

    // 初始化 Metrics 服務
    const metrics = MetricsService.getInstance();
    metrics.startCollecting();
    logger.info('✅ Metrics 收集已啟動');

    // 初始化 Stage 自動擴展服務
    const autoScaling = StageAutoScalingService.getInstance();
    autoScaling.startMonitoring();
    logger.info('✅ Stage Auto Scaling 已啟動');

    // 初始化觀眾心跳檢測服務
    const heartbeat = ViewerHeartbeatService.getInstance();
    heartbeat.startMonitoring();
    logger.info('✅ Viewer Heartbeat 已啟動');

    logger.info('✅ 所有服務初始化完成');
  } catch (error: any) {
    logger.error('服務初始化失敗', { 
      error: error.message,
      stack: error.stack,
      name: error.name
    });
    console.error('完整錯誤:', error);
    process.exit(1);
  }
}

// ==========================================
// 啟動伺服器
// ==========================================

async function startServer() {
  try {
    // 初始化服務
    await initializeServices();

    // 啟動 HTTP/WebSocket 伺服器
    httpServer.listen(PORT, () => {
      logger.info('='.repeat(50));
      logger.info(`🚀 API Server 運行於 http://localhost:${PORT}`);
      logger.info(`🔌 WebSocket 運行於 ws://localhost:${PORT}/ws`);
      logger.info(`📍 Region: ${process.env.AWS_REGION}`);
      logger.info(`🎬 Stage ARN: ${process.env.MASTER_STAGE_ARN?.substring(0, 50)}...`);
      logger.info(`🌍 Environment: ${process.env.NODE_ENV}`);
      logger.info('='.repeat(50));
    });

    // 優雅關閉
    process.on('SIGTERM', gracefulShutdown);
    process.on('SIGINT', gracefulShutdown);
  } catch (error) {
    logger.error('伺服器啟動失敗', { error });
    process.exit(1);
  }
}

async function gracefulShutdown() {
  logger.info('正在關閉伺服器...');

  // 關閉 WebSocket 連接
  wss.clients.forEach((client) => {
    client.close();
  });

  // 關閉 HTTP 伺服器
  httpServer.close(async () => {
    logger.info('HTTP 伺服器已關閉');

    try {
      // 清理資源
      const redis = RedisService.getInstance();
      await redis.disconnect();
      logger.info('Redis 連接已關閉');

      const metrics = MetricsService.getInstance();
      metrics.stopCollecting();
      logger.info('Metrics 收集已停止');

      const autoScaling = StageAutoScalingService.getInstance();
      autoScaling.stopMonitoring();
      logger.info('Stage Auto Scaling 已停止');

      const heartbeat = ViewerHeartbeatService.getInstance();
      heartbeat.stopMonitoring();
      logger.info('Viewer Heartbeat 已停止');

      logger.info('✅ 伺服器已優雅關閉');
      process.exit(0);
    } catch (error) {
      logger.error('關閉服務時發生錯誤', { error });
      process.exit(1);
    }
  });

  // 30 秒後強制關閉
  setTimeout(() => {
    logger.error('強制關閉伺服器（超時）');
    process.exit(1);
  }, 30000);
}

// 啟動
startServer();

// ==========================================
// WebSocket 通知函數 (供其他模組使用)
// ==========================================

/**
 * 通知主播端 Stage 已創建
 */
export function notifyBroadcasterStageCreated(stageArn: string): void {
  wss.clients.forEach((client) => {
    if ((client as any).isBroadcaster && client.readyState === 1) {
      client.send(JSON.stringify({
        type: 'stage_created',
        data: {
          stageArn,
          timestamp: new Date().toISOString(),
        },
      }));
      logger.info('📤 已通知主播端: Stage 已創建', {
        stageId: stageArn.split('/').pop(),
      });
    }
  });
}

/**
 * 通知主播端 Stage 已刪除
 */
export function notifyBroadcasterStageDeleted(stageArn: string): void {
  wss.clients.forEach((client) => {
    if ((client as any).isBroadcaster && client.readyState === 1) {
      client.send(JSON.stringify({
        type: 'stage_deleted',
        data: {
          stageArn,
          timestamp: new Date().toISOString(),
        },
      }));
      logger.info('📤 已通知主播端: Stage 已刪除', {
        stageId: stageArn.split('/').pop(),
      });
    }
  });
}

export { app, httpServer, wss };
