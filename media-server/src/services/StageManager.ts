/**
 * Stage Manager
 * 管理所有 Stage 的連接和流轉發
 *
 * 功能:
 * - 同步所有活躍 Stage
 * - 自動連接新創建的 Stage
 * - 自動斷開已刪除的 Stage
 * - 管理主播流的轉發
 */

import { APIClientService } from './APIClientService';
import { WHIPClient } from './WHIPClient';
import { logger } from '../utils/logger';

export interface StageConnection {
  stageArn: string;
  whipClient: WHIPClient;
  connected: boolean;
  lastError?: string;
  createdAt: Date;
}

export class StageManager {
  private static instance: StageManager;
  private connections: Map<string, StageConnection> = new Map();
  private publisherActive: boolean = false;
  private syncInterval?: NodeJS.Timeout;

  private constructor() {}

  public static getInstance(): StageManager {
    if (!StageManager.instance) {
      StageManager.instance = new StageManager();
    }
    return StageManager.instance;
  }

  /**
   * 初始化 Stage Manager
   */
  async initialize(): Promise<void> {
    logger.info('🎬 初始化 Stage Manager');

    // 註冊 WebSocket 消息處理器
    const apiClient = APIClientService.getInstance();

    apiClient.onMessage('stage_created', async (data: any) => {
      const { stageArn } = data;
      logger.info('📥 收到通知: Stage 已創建', {
        stageId: stageArn.substring(stageArn.length - 12),
      });
      await this.connectToStage(stageArn);
    });

    apiClient.onMessage('stage_deleted', async (data: any) => {
      const { stageArn } = data;
      logger.info('📥 收到通知: Stage 已刪除', {
        stageId: stageArn.substring(stageArn.length - 12),
      });
      await this.disconnectFromStage(stageArn);
    });

    logger.info('✅ Stage Manager 初始化完成');
  }

  /**
   * 同步所有 Stage
   */
  async syncAllStages(): Promise<void> {
    try {
      const apiClient = APIClientService.getInstance();
      const stages = await apiClient.getActiveStages();

      logger.info(`🔄 同步 ${stages.length} 個 Stage`);

      // 連接到所有 Stage
      for (const stage of stages) {
        await this.connectToStage(stage.stageArn);
      }

      // 清理已不存在的 Stage
      const activeStageArns = new Set(stages.map(s => s.stageArn));
      for (const [stageArn] of this.connections) {
        if (!activeStageArns.has(stageArn)) {
          logger.info('🧹 清理不存在的 Stage', {
            stageId: stageArn.substring(stageArn.length - 12),
          });
          await this.disconnectFromStage(stageArn);
        }
      }

      logger.info('✅ Stage 同步完成', {
        totalConnections: this.connections.size,
        activeConnections: this.getActiveConnectionCount(),
      });
    } catch (error: any) {
      logger.error('Stage 同步失敗', { error: error.message });
    }
  }

  /**
   * 連接到 Stage
   */
  async connectToStage(stageArn: string): Promise<void> {
    // 檢查是否已連接
    if (this.connections.has(stageArn)) {
      logger.debug('Stage 已連接，跳過', {
        stageId: stageArn.substring(stageArn.length - 12),
      });
      return;
    }

    try {
      logger.info('🔗 正在連接 Stage', {
        stageId: stageArn.substring(stageArn.length - 12),
      });

      // 1. 獲取 Token
      const apiClient = APIClientService.getInstance();
      const token = await apiClient.getStageToken(stageArn);

      if (!token) {
        throw new Error('無法獲取 Stage Token');
      }

      // 2. 創建 WHIP Client
      const whipClient = new WHIPClient({
        stageArn,
        token,
      });

      // 3. 連接到 Stage
      await whipClient.connect();

      // 4. 如果主播在線，開始推流
      if (this.publisherActive) {
        await whipClient.startPublishing();
      }

      // 5. 記錄連接
      this.connections.set(stageArn, {
        stageArn,
        whipClient,
        connected: true,
        createdAt: new Date(),
      });

      logger.info('✅ Stage 連接成功', {
        stageId: stageArn.substring(stageArn.length - 12),
        totalConnections: this.connections.size,
        publisherActive: this.publisherActive,
      });
    } catch (error: any) {
      logger.error('❌ Stage 連接失敗', {
        stageId: stageArn.substring(stageArn.length - 12),
        error: error.message,
      });

      // 記錄失敗的連接
      this.connections.set(stageArn, {
        stageArn,
        whipClient: null as any,
        connected: false,
        lastError: error.message,
        createdAt: new Date(),
      });
    }
  }

  /**
   * 斷開 Stage 連接
   */
  async disconnectFromStage(stageArn: string): Promise<void> {
    const connection = this.connections.get(stageArn);

    if (!connection) {
      logger.debug('Stage 不存在，跳過斷開', {
        stageId: stageArn.substring(stageArn.length - 12),
      });
      return;
    }

    try {
      logger.info('🔌 正在斷開 Stage', {
        stageId: stageArn.substring(stageArn.length - 12),
      });

      if (connection.whipClient && connection.connected) {
        await connection.whipClient.disconnect();
      }

      this.connections.delete(stageArn);

      logger.info('✅ Stage 已斷開', {
        stageId: stageArn.substring(stageArn.length - 12),
        remainingConnections: this.connections.size,
      });
    } catch (error: any) {
      logger.error('斷開 Stage 失敗', {
        stageId: stageArn.substring(stageArn.length - 12),
        error: error.message,
      });
    }
  }

  /**
   * 主播開始推流
   */
  async onPublisherConnected(): Promise<void> {
    this.publisherActive = true;

    logger.info('📹 主播已連接，開始向所有 Stage 轉發', {
      totalStages: this.connections.size,
    });

    // 向所有已連接的 Stage 開始推流
    for (const [stageArn, connection] of this.connections.entries()) {
      if (connection.connected && connection.whipClient) {
        try {
          await connection.whipClient.startPublishing();
          logger.info('📤 開始向 Stage 推流', {
            stageId: stageArn.substring(stageArn.length - 12),
          });
        } catch (error: any) {
          logger.error('向 Stage 推流失敗', {
            stageId: stageArn.substring(stageArn.length - 12),
            error: error.message,
          });
        }
      }
    }
  }

  /**
   * 主播斷開
   */
  async onPublisherDisconnected(): Promise<void> {
    this.publisherActive = false;

    logger.info('👋 主播已斷開，停止所有轉發');

    // 停止所有 Stage 的推流
    for (const [stageArn, connection] of this.connections.entries()) {
      if (connection.whipClient && connection.connected) {
        try {
          await connection.whipClient.stopPublishing();
          logger.debug('⏹️ 停止向 Stage 推流', {
            stageId: stageArn.substring(stageArn.length - 12),
          });
        } catch (error: any) {
          logger.error('停止推流失敗', {
            stageId: stageArn.substring(stageArn.length - 12),
            error: error.message,
          });
        }
      }
    }
  }

  /**
   * 斷開所有連接
   */
  async disconnectAll(): Promise<void> {
    logger.info('正在斷開所有 Stage 連接...', {
      count: this.connections.size,
    });

    const stageArns = Array.from(this.connections.keys());

    for (const stageArn of stageArns) {
      await this.disconnectFromStage(stageArn);
    }

    this.connections.clear();
    logger.info('✅ 所有 Stage 已斷開');
  }

  /**
   * 啟動定期同步
   */
  startPeriodicSync(intervalMs: number = 60000): void {
    logger.info('⏰ 啟動定期 Stage 同步', {
      interval: `${intervalMs / 1000}秒`,
    });

    this.syncInterval = setInterval(() => {
      this.syncAllStages();
    }, intervalMs);
  }

  /**
   * 停止定期同步
   */
  stopPeriodicSync(): void {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = undefined;
      logger.info('定期 Stage 同步已停止');
    }
  }

  /**
   * 獲取統計資訊
   */
  getStats() {
    return {
      publisherActive: this.publisherActive,
      connectedStages: this.connections.size,
      activeConnections: this.getActiveConnectionCount(),
    };
  }

  /**
   * 獲取活躍連接數
   */
  private getActiveConnectionCount(): number {
    return Array.from(this.connections.values()).filter(c => c.connected).length;
  }

  /**
   * 獲取所有連接
   */
  getConnections(): Map<string, StageConnection> {
    return this.connections;
  }
}

export default StageManager;
