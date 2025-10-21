/**
 * 一鍵產生所有專案檔案
 * 執行: node generate-project.js
 */

const fs = require('fs');
const path = require('path');

const BASE_DIR = __dirname;

console.log('🚀 開始產生 AWS IVS Real-time 完整專案...\n');

// ==========================================
// 1. 建立目錄結構
// ==========================================
console.log('📁 建立目錄結構...');

const directories = [
  'api-server/src/routes',
  'api-server/src/services',
  'api-server/src/middleware',
  'api-server/src/utils',
  'api-server/tests',
  'api-server/logs',
  'media-server/src/core',
  'media-server/src/services',
  'media-server/src/handlers',
  'media-server/src/utils',
  'media-server/tests',
  'frontend/app/host',
  'frontend/app/watch',
  'frontend/app/api/token',
  'frontend/app/api/stats',
  'frontend/components/broadcaster',
  'frontend/components/viewer',
  'frontend/components/ui',
  'frontend/lib',
  'frontend/public',
  'infrastructure/terraform',
  'infrastructure/cloudformation',
  'infrastructure/scripts',
  'monitoring/cloudwatch',
  'monitoring/alerts',
  'docs'
];

directories.forEach(dir => {
  const fullPath = path.join(BASE_DIR, dir);
  if (!fs.existsSync(fullPath)) {
    fs.mkdirSync(fullPath, { recursive: true });
    console.log(`  ✅ ${dir}`);
  }
});

console.log('\n✨ 目錄結構建立完成！\n');

// ==========================================
// 2. 產生 .gitignore
// ==========================================
console.log('📝 產生專案配置檔案...');

fs.writeFileSync(path.join(BASE_DIR, '.gitignore'), `# 依賴
node_modules/
package-lock.json
yarn.lock
pnpm-lock.yaml

# 環境變數
.env
.env.local
.env.*.local

# 日誌
logs/
*.log
npm-debug.log*

# 建置輸出
dist/
build/
.next/
out/

# IDE
.vscode/
.idea/
*.swp
*.swo
*~

# OS
.DS_Store
Thumbs.db

# 測試
coverage/
.nyc_output/

# AWS
.aws/
*.pem

# Terraform
.terraform/
*.tfstate
*.tfstate.backup

# 其他
*.bak
*.tmp
.cache/
`);
console.log('  ✅ .gitignore');

// ==========================================
// 3. 產生 docker-compose.yml
// ==========================================
fs.writeFileSync(path.join(BASE_DIR, 'docker-compose.yml'), `version: '3.8'

services:
  api-server:
    build: ./api-server
    container_name: ivs-api-server
    ports:
      - "3000:3000"
    env_file:
      - .env.local
    environment:
      - NODE_ENV=production
      - REDIS_HOST=redis
    depends_on:
      - redis
    restart: unless-stopped
    networks:
      - ivs-network

  redis:
    image: redis:7-alpine
    container_name: ivs-redis
    ports:
      - "6379:6379"
    volumes:
      - redis-data:/data
    restart: unless-stopped
    networks:
      - ivs-network
    command: redis-server --appendonly yes

volumes:
  redis-data:
    driver: local

networks:
  ivs-network:
    driver: bridge
`);
console.log('  ✅ docker-compose.yml');

// ==========================================
// 4. 產生剩餘的 API Server 檔案
// ==========================================
console.log('\n📝 產生 API Server 剩餘檔案...');

// stats.ts 路由
const statsRoute = `/**
 * 統計資料路由
 */

import { Router, Request, Response } from 'express';
import { RedisService } from '../services/RedisService';
import { logger } from '../utils/logger';

const router = Router();

router.get('/', async (req: Request, res: Response) => {
  try {
    const redis = RedisService.getInstance();
    
    const totalViewers = await redis.getTotalViewerCount();
    const isPublisherLive = await redis.getPublisherStatus();
    const activeStages = await redis.getActiveStages();

    res.json({
      success: true,
      data: {
        totalViewers,
        isPublisherLive,
        activeStages: activeStages.length,
        stages: activeStages,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    logger.error('獲取統計資料失敗', { error });
    res.status(500).json({
      error: 'INTERNAL_ERROR',
      message: '獲取統計資料失敗',
    });
  }
});

router.get('/detailed', async (req: Request, res: Response) => {
  try {
    const redis = RedisService.getInstance();
    
    const totalViewers = await redis.getTotalViewerCount();
    const activeStages = await redis.getActiveStages();
    
    // 獲取每個 Stage 的詳細資訊
    const stageDetails = await Promise.all(
      activeStages.map(async (stageId) => {
        const viewerCount = await redis.getStageViewerCount(stageId);
        const stageInfo = await redis.getStageInfo(stageId);
        return {
          stageId,
          viewerCount,
          info: stageInfo,
        };
      })
    );

    res.json({
      success: true,
      data: {
        totalViewers,
        activeStages: activeStages.length,
        stageDetails,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    logger.error('獲取詳細統計失敗', { error });
    res.status(500).json({
      error: 'INTERNAL_ERROR',
      message: '獲取詳細統計失敗',
    });
  }
});

export default router;
`;

fs.writeFileSync(path.join(BASE_DIR, 'api-server/src/routes/stats.ts'), statsRoute);
console.log('  ✅ stats.ts');

// stage.ts 路由
const stageRoute = `/**
 * Stage 管理路由
 */

import { Router, Request, Response } from 'express';
import { RedisService } from '../services/RedisService';
import { logger } from '../utils/logger';

const router = Router();

// 獲取所有 Stage 列表
router.get('/', async (req: Request, res: Response) => {
  try {
    const redis = RedisService.getInstance();
    const activeStages = await redis.getActiveStages();

    res.json({
      success: true,
      data: {
        stages: activeStages,
        count: activeStages.length,
      },
    });
  } catch (error) {
    logger.error('獲取 Stage 列表失敗', { error });
    res.status(500).json({
      error: 'INTERNAL_ERROR',
      message: '獲取 Stage 列表失敗',
    });
  }
});

// 獲取特定 Stage 資訊
router.get('/:stageId', async (req: Request, res: Response) => {
  try {
    const { stageId } = req.params;
    const redis = RedisService.getInstance();
    
    const stageInfo = await redis.getStageInfo(stageId);
    const viewerCount = await redis.getStageViewerCount(stageId);

    if (!stageInfo) {
      return res.status(404).json({
        error: 'NOT_FOUND',
        message: 'Stage 不存在',
      });
    }

    res.json({
      success: true,
      data: {
        stageId,
        viewerCount,
        info: stageInfo,
      },
    });
  } catch (error) {
    logger.error('獲取 Stage 資訊失敗', { error });
    res.status(500).json({
      error: 'INTERNAL_ERROR',
      message: '獲取 Stage 資訊失敗',
    });
  }
});

export default router;
`;

fs.writeFileSync(path.join(BASE_DIR, 'api-server/src/routes/stage.ts'), stageRoute);
console.log('  ✅ stage.ts');

// MetricsService.ts
const metricsService = `/**
 * CloudWatch Metrics 服務
 */

import { CloudWatchClient, PutMetricDataCommand } from '@aws-sdk/client-cloudwatch';
import { logger } from '../utils/logger';
import { METRICS } from '../utils/constants';
import { RedisService } from './RedisService';

export class MetricsService {
  private static instance: MetricsService;
  private client: CloudWatchClient;
  private isCollecting: boolean = false;
  private interval: NodeJS.Timeout | null = null;

  private constructor() {
    this.client = new CloudWatchClient({
      region: process.env.AWS_REGION,
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
      },
    });
  }

  public static getInstance(): MetricsService {
    if (!MetricsService.instance) {
      MetricsService.instance = new MetricsService();
    }
    return MetricsService.instance;
  }

  async publishMetric(metricName: string, value: number, unit: string = 'Count') {
    if (process.env.ENABLE_MONITORING !== 'true') {
      return;
    }

    try {
      const command = new PutMetricDataCommand({
        Namespace: METRICS.NAMESPACE,
        MetricData: [{
          MetricName: metricName,
          Value: value,
          Unit: unit,
          Timestamp: new Date(),
          Dimensions: [
            {
              Name: 'Environment',
              Value: METRICS.DIMENSIONS.ENVIRONMENT,
            },
            {
              Name: 'Service',
              Value: METRICS.DIMENSIONS.SERVICE,
            },
          ],
        }],
      });

      await this.client.send(command);
      logger.debug('Metric 已發送', { metricName, value, unit });
    } catch (error) {
      logger.error('發送 Metrics 失敗', { error });
    }
  }

  startCollecting() {
    if (this.isCollecting) {
      return;
    }

    this.isCollecting = true;
    
    // 每分鐘收集一次指標
    this.interval = setInterval(async () => {
      await this.collectMetrics();
    }, 60000);

    logger.info('✅ Metrics 收集已啟動');
  }

  private async collectMetrics() {
    try {
      const redis = RedisService.getInstance();
      
      // 收集觀眾數
      const totalViewers = await redis.getTotalViewerCount();
      await this.publishMetric(METRICS.NAMES.TOTAL_VIEWERS, totalViewers);

      // 收集活躍 Stage 數
      const activeStages = await redis.getActiveStages();
      await this.publishMetric(METRICS.NAMES.ACTIVE_STAGES, activeStages.length);

      logger.debug('Metrics 收集完成', {
        totalViewers,
        activeStages: activeStages.length,
      });
    } catch (error) {
      logger.error('收集 Metrics 失敗', { error });
    }
  }

  stopCollecting() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
    this.isCollecting = false;
    logger.info('Metrics 收集已停止');
  }
}

export default MetricsService;
`;

fs.writeFileSync(path.join(BASE_DIR, 'api-server/src/services/MetricsService.ts'), metricsService);
console.log('  ✅ MetricsService.ts');

// Dockerfile
fs.writeFileSync(path.join(BASE_DIR, 'api-server/Dockerfile'), `FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY --from=builder /app/dist ./dist

RUN mkdir -p logs

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \\
  CMD node -e "require('http').get('http://localhost:3000/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

CMD ["npm", "start"]
`);
console.log('  ✅ Dockerfile');

// .dockerignore
fs.writeFileSync(path.join(BASE_DIR, 'api-server/.dockerignore'), `node_modules
dist
logs
*.log
.env*
!.env.example
.git
README.md
tests
*.test.ts
.vscode
.idea
`);
console.log('  ✅ .dockerignore');

console.log('\n✨ API Server 檔案產生完成！\n');

// ==========================================
// 5. 產生啟動腳本
// ==========================================
console.log('📝 產生啟動腳本...');

// Windows 啟動腳本
fs.writeFileSync(path.join(BASE_DIR, 'start-dev.bat'), `@echo off
echo ========================================
echo 啟動 AWS IVS Development Environment
echo ========================================

echo.
echo [1/3] 檢查 Docker...
docker --version >nul 2>&1
if errorlevel 1 (
    echo ❌ Docker 未安裝或未啟動
    echo 請先安裝並啟動 Docker Desktop
    pause
    exit /b 1
)

echo ✅ Docker 已就緒
echo.

echo [2/3] 啟動 Redis...
docker-compose up -d redis
timeout /t 3 >nul

echo ✅ Redis 已啟動
echo.

echo [3/3] 啟動 API Server...
cd api-server
start cmd /k "npm run dev"

echo.
echo ========================================
echo ✨ 開發環境啟動完成！
echo ========================================
echo.
echo API Server: http://localhost:3000
echo Health Check: http://localhost:3000/health
echo.
echo 按任意鍵關閉此視窗...
pause >nul
`);
console.log('  ✅ start-dev.bat');

// macOS/Linux 啟動腳本
fs.writeFileSync(path.join(BASE_DIR, 'start-dev.sh'), `#!/bin/bash

echo "========================================"
echo "啟動 AWS IVS Development Environment"
echo "========================================"
echo ""

# 檢查 Docker
echo "[1/3] 檢查 Docker..."
if ! command -v docker &> /dev/null; then
    echo "❌ Docker 未安裝"
    echo "請先安裝 Docker"
    exit 1
fi

echo "✅ Docker 已就緒"
echo ""

# 啟動 Redis
echo "[2/3] 啟動 Redis..."
docker-compose up -d redis
sleep 3

echo "✅ Redis 已啟動"
echo ""

# 啟動 API Server
echo "[3/3] 啟動 API Server..."
cd api-server
npm run dev &

echo ""
echo "========================================"
echo "✨ 開發環境啟動完成！"
echo "========================================"
echo ""
echo "API Server: http://localhost:3000"
echo "Health Check: http://localhost:3000/health"
echo ""
`);

// 設定執行權限 (Linux/macOS)
try {
  fs.chmodSync(path.join(BASE_DIR, 'start-dev.sh'), '755');
} catch (e) {
  // Windows 會失敗，忽略
}

console.log('  ✅ start-dev.sh');

// ==========================================
// 6. 產生測試腳本
// ==========================================
const testScript = `#!/usr/bin/env node

/**
 * API 測試腳本
 */

const http = require('http');

const API_URL = 'http://localhost:3000';

async function testAPI() {
  console.log('🧪 開始測試 API...\\n');

  // 測試 1: 健康檢查
  console.log('[1/3] 測試健康檢查...');
  try {
    const response = await fetch(\`\${API_URL}/health\`);
    const data = await response.json();
    
    if (data.status === 'ok') {
      console.log('✅ 健康檢查通過');
      console.log('   Redis:', data.services.redis);
      console.log('   Uptime:', Math.floor(data.uptime), 'seconds');
    } else {
      console.log('❌ 健康檢查失敗');
    }
  } catch (error) {
    console.log('❌ 健康檢查錯誤:', error.message);
  }

  console.log('');

  // 測試 2: 生成主播 Token
  console.log('[2/3] 測試生成主播 Token...');
  try {
    const response = await fetch(\`\${API_URL}/api/token/publisher\`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': process.env.API_SECRET_KEY || 'test-key',
      },
      body: JSON.stringify({ userId: 'test-broadcaster' }),
    });
    
    const data = await response.json();
    
    if (data.success) {
      console.log('✅ 主播 Token 生成成功');
      console.log('   Token:', data.data.token.substring(0, 50) + '...');
      console.log('   Expires in:', data.data.expiresIn, 'seconds');
    } else {
      console.log('❌ 主播 Token 生成失敗:', data.message);
    }
  } catch (error) {
    console.log('❌ 主播 Token 錯誤:', error.message);
  }

  console.log('');

  // 測試 3: 獲取統計資料
  console.log('[3/3] 測試統計資料...');
  try {
    const response = await fetch(\`\${API_URL}/api/stats\`, {
      headers: {
        'X-API-Key': process.env.API_SECRET_KEY || 'test-key',
      },
    });
    
    const data = await response.json();
    
    if (data.success) {
      console.log('✅ 統計資料獲取成功');
      console.log('   總觀眾:', data.data.totalViewers);
      console.log('   主播狀態:', data.data.isPublisherLive ? '在線' : '離線');
      console.log('   活躍 Stages:', data.data.activeStages);
    } else {
      console.log('❌ 統計資料獲取失敗');
    }
  } catch (error) {
    console.log('❌ 統計資料錯誤:', error.message);
  }

  console.log('\\n✨ 測試完成！\\n');
}

testAPI();
`;

fs.writeFileSync(path.join(BASE_DIR, 'test-api.js'), testScript);
fs.chmodSync(path.join(BASE_DIR, 'test-api.js'), '755');
console.log('  ✅ test-api.js');

console.log('\n✨ 腳本產生完成！\n');

// ==========================================
// 7. 完成訊息
// ==========================================
console.log('========================================');
console.log('🎉 專案產生完成！');
console.log('========================================\n');

console.log('📦 已產生檔案：');
console.log('  ✅ 15+ 個核心程式檔案');
console.log('  ✅ Docker 配置檔案');
console.log('  ✅ 啟動腳本');
console.log('  ✅ 測試腳本');
console.log('');

console.log('🚀 下一步：');
console.log('');
console.log('  1. 安裝依賴：');
console.log('     cd api-server && npm install');
console.log('');
console.log('  2. 配置環境變數：');
console.log('     cp .env.example .env.local');
console.log('     # 然後編輯 .env.local');
console.log('');
console.log('  3. 啟動開發環境：');
console.log('     Windows: start-dev.bat');
console.log('     Mac/Linux: ./start-dev.sh');
console.log('');
console.log('  4. 測試 API：');
console.log('     node test-api.js');
console.log('');

console.log('📚 完整文檔：');
console.log('  README.md - 專案說明');
console.log('  QUICKSTART.md - 快速開始');
console.log('');

console.log('========================================');
`;

fs.writeFileSync(path.join(BASE_DIR, 'generate-project.js'), testScript);
console.log('  ✅ generate-project.js');

console.log('\n✨所有檔案已產生！');
