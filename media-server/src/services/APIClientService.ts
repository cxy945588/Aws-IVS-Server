/**
 * API Client Service
 * 負責與 API Server 通信
 *
 * 功能:
 * - 向 API Server 註冊 Media Server
 * - 獲取所有活躍 Stage 列表
 * - 獲取 Stage Token
 * - WebSocket 連接監聽 Stage 變化
 * - 定期發送心跳
 */

import axios, { AxiosInstance } from 'axios';
import WebSocket from 'ws';
import { logger } from '../utils/logger';
import { API_CONFIG, SERVER_CONFIG, MONITORING_CONFIG } from '../utils/constants';

export interface StageInfo {
  stageArn: string;
  viewerCount: number;
  stageId?: string;
}

export class APIClientService {
  private static instance: APIClientService;
  private client: AxiosInstance;
  private ws?: WebSocket;
  private heartbeatInterval?: NodeJS.Timeout;
  private reconnectTimeout?: NodeJS.Timeout;
  private messageHandlers: Map<string, (data: any) => void> = new Map();

  private constructor() {
    this.client = axios.create({
      baseURL: API_CONFIG.API_SERVER_URL,
      headers: {
        'x-api-key': API_CONFIG.API_SECRET_KEY,
        'x-media-auth': API_CONFIG.MEDIA_SERVER_SECRET,
      },
      timeout: 10000,
    });
  }

  public static getInstance(): APIClientService {
    if (!APIClientService.instance) {
      APIClientService.instance = new APIClientService();
    }
    return APIClientService.instance;
  }

  /**
   * 向 API Server 註冊 Media Server
   */
  async register(): Promise<void> {
    try {
      const response = await this.client.post('/api/media/register', {
        serverId: SERVER_CONFIG.SERVER_ID,
        ipAddress: SERVER_CONFIG.SERVER_IP,
        port: SERVER_CONFIG.PORT,
      });

      logger.info('📡 已向 API Server 註冊', {
        serverId: SERVER_CONFIG.SERVER_ID,
        data: response.data,
      });
    } catch (error: any) {
      logger.error('註冊失敗', {
        error: error.message,
        response: error.response?.data,
      });
      throw error;
    }
  }

  /**
   * 獲取所有活躍 Stage
   */
  async getActiveStages(): Promise<StageInfo[]> {
    try {
      const response = await this.client.get('/api/media/stages');
      const stages = response.data.data.stages || [];

      logger.debug('📋 獲取 Stage 列表', {
        count: stages.length,
        stages: stages.map((s: StageInfo) => s.stageId || s.stageArn.substring(s.stageArn.length - 12)),
      });

      return stages;
    } catch (error: any) {
      logger.error('獲取 Stage 列表失敗', {
        error: error.message,
        response: error.response?.data,
      });
      return [];
    }
  }

  /**
   * 為 Stage 獲取 Token
   */
  async getStageToken(stageArn: string): Promise<string | null> {
    try {
      const response = await this.client.post('/api/media/token', {
        serverId: SERVER_CONFIG.SERVER_ID,
        stageArn,
      });

      const token = response.data.data.token;

      logger.debug('🎟️ 獲取 Stage Token 成功', {
        stageId: stageArn.substring(stageArn.length - 12),
      });

      return token;
    } catch (error: any) {
      logger.error('獲取 Stage Token 失敗', {
        error: error.message,
        stageArn: stageArn.substring(stageArn.length - 12),
        response: error.response?.data,
      });
      return null;
    }
  }

  /**
   * 連接到 API Server WebSocket
   */
  connectWebSocket(): void {
    const wsUrl = `${API_CONFIG.API_SERVER_URL.replace('http', 'ws')}/ws?type=media-server`;

    logger.info('🔌 正在連接 WebSocket', { url: wsUrl });

    this.ws = new WebSocket(wsUrl);

    this.ws.on('open', () => {
      logger.info('✅ WebSocket 已連接到 API Server');
      this.startHeartbeat();

      // 清除重連定時器
      if (this.reconnectTimeout) {
        clearTimeout(this.reconnectTimeout);
        this.reconnectTimeout = undefined;
      }
    });

    this.ws.on('message', async (data) => {
      try {
        const message = JSON.parse(data.toString());
        await this.handleWebSocketMessage(message);
      } catch (error: any) {
        logger.error('WebSocket 消息處理失敗', { error: error.message });
      }
    });

    this.ws.on('close', () => {
      logger.warn('📡 WebSocket 已斷開，5秒後重連');
      this.stopHeartbeat();
      this.scheduleReconnect();
    });

    this.ws.on('error', (error) => {
      logger.error('WebSocket 錯誤', { error: error.message });
    });
  }

  /**
   * 處理 WebSocket 消息
   */
  private async handleWebSocketMessage(message: any): Promise<void> {
    const { type, data } = message;

    logger.debug('📥 收到 WebSocket 消息', { type });

    // 調用註冊的處理器
    const handler = this.messageHandlers.get(type);
    if (handler) {
      try {
        await handler(data);
      } catch (error: any) {
        logger.error('消息處理器執行失敗', {
          type,
          error: error.message,
        });
      }
    } else {
      logger.debug('未找到消息處理器', { type });
    }
  }

  /**
   * 註冊消息處理器
   */
  onMessage(type: string, handler: (data: any) => void): void {
    this.messageHandlers.set(type, handler);
    logger.debug('註冊消息處理器', { type });
  }

  /**
   * 發送心跳
   */
  private startHeartbeat(): void {
    this.heartbeatInterval = setInterval(async () => {
      try {
        // 動態導入 StageManager 避免循環依賴
        const { StageManager } = await import('./StageManager');
        const stageManager = StageManager.getInstance();
        const stats = stageManager.getStats();

        await this.client.post('/api/media/heartbeat', {
          serverId: SERVER_CONFIG.SERVER_ID,
          publisherActive: stats.publisherActive,
          connectedStages: stats.connectedStages,
        });

        logger.debug('💓 心跳已發送', stats);
      } catch (error: any) {
        logger.error('心跳失敗', { error: error.message });
      }
    }, MONITORING_CONFIG.HEARTBEAT_INTERVAL);
  }

  /**
   * 停止心跳
   */
  private stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = undefined;
    }
  }

  /**
   * 安排重連
   */
  private scheduleReconnect(): void {
    if (this.reconnectTimeout) {
      return; // 已經安排重連
    }

    this.reconnectTimeout = setTimeout(() => {
      this.reconnectTimeout = undefined;
      this.connectWebSocket();
    }, 5000);
  }

  /**
   * 斷開連接
   */
  disconnect(): void {
    logger.info('正在斷開 API Server 連接...');

    this.stopHeartbeat();

    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = undefined;
    }

    if (this.ws) {
      this.ws.close();
      this.ws = undefined;
    }

    logger.info('✅ API Server 連接已斷開');
  }
}

export default APIClientService;
