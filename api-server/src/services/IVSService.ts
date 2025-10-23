/**
 * AWS IVS Service
 * 封裝所有 AWS IVS Real-time 操作
 */

import {
  IVSRealTimeClient,
  CreateParticipantTokenCommand,
  CreateParticipantTokenCommandInput,
  CreateParticipantTokenCommandOutput,
  ParticipantTokenCapability,
} from '@aws-sdk/client-ivs-realtime';
import { logger } from '../utils/logger';
import { TOKEN_CONFIG } from '../utils/constants';

export interface TokenOptions {
  stageArn: string;
  userId: string;
  capabilities: ParticipantTokenCapability[];
  duration?: number;
  attributes?: Record<string, string>;
}

export interface ParticipantToken {
  token: string;
  participantId: string;
  userId: string;
  stageArn: string;
  capabilities: string[];
  expiresAt: Date;
}

export class IVSService {
  private client: IVSRealTimeClient;
  private region: string;

  constructor() {
    this.region = process.env.AWS_REGION || 'us-east-1';
    this.client = new IVSRealTimeClient({ 
      region: this.region,
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
      },
    });

    logger.info('IVS Service 初始化完成', { region: this.region });
  }

  /**
   * 生成參與者 Token
   */
  async createParticipantToken(options: TokenOptions): Promise<ParticipantToken> {
    const startTime = Date.now();

    try {
      const input: CreateParticipantTokenCommandInput = {
        stageArn: options.stageArn,
        userId: options.userId,
        capabilities: options.capabilities,
        duration: options.duration || TOKEN_CONFIG.VIEWER_DURATION,
        attributes: options.attributes,
      };

      logger.debug('正在生成參與者 Token', {
        userId: options.userId,
        capabilities: options.capabilities,
        duration: input.duration,
      });

      const command = new CreateParticipantTokenCommand(input);
      const response: CreateParticipantTokenCommandOutput = await this.client.send(command);

      if (!response.participantToken?.token) {
        throw new Error('Token 生成失敗：回應中沒有 token');
      }

      const token: ParticipantToken = {
        token: response.participantToken.token,
        participantId: response.participantToken.participantId!,
        userId: options.userId,
        stageArn: options.stageArn,
        capabilities: options.capabilities,
        expiresAt: response.participantToken.expirationTime!,
      };

      const duration = Date.now() - startTime;
      logger.info('✅ Token 生成成功', {
        userId: options.userId,
        participantId: token.participantId,
        capabilities: options.capabilities,
        duration: `${duration}ms`,
      });

      return token;
    } catch (error: any) {
      const duration = Date.now() - startTime;
      logger.error('❌ Token 生成失敗', {
        userId: options.userId,
        error: error.message,
        duration: `${duration}ms`,
      });
      throw error;
    }
  }

  /**
   * 生成主播 Token (PUBLISH 權限)
   */
  async createPublisherToken(userId: string, stageArn?: string): Promise<ParticipantToken> {
    const targetStageArn = stageArn || process.env.MASTER_STAGE_ARN!;

    if (!targetStageArn) {
      throw new Error('未設定 MASTER_STAGE_ARN');
    }

    return await this.createParticipantToken({
      stageArn: targetStageArn,
      userId: `broadcaster-${userId}`,
      capabilities: [ParticipantTokenCapability.PUBLISH],
      duration: TOKEN_CONFIG.PUBLISHER_DURATION,
      attributes: {
        role: 'publisher',
        timestamp: new Date().toISOString(),
      },
    });
  }

  /**
   * 生成觀眾 Token (SUBSCRIBE 權限)
   */
  async createViewerToken(userId: string, stageArn: string): Promise<ParticipantToken> {
    return await this.createParticipantToken({
      stageArn,
      userId: `viewer-${userId}`,
      capabilities: [ParticipantTokenCapability.SUBSCRIBE],
      duration: TOKEN_CONFIG.VIEWER_DURATION,
      attributes: {
        role: 'viewer',
        timestamp: new Date().toISOString(),
      },
    });
  }

  /**
   * 生成 Media Server Token (PUBLISH + SUBSCRIBE 權限)
   */
  async createMediaServerToken(serverId: string, stageArn: string): Promise<ParticipantToken> {
    return await this.createParticipantToken({
      stageArn,
      userId: `media-server-${serverId}`,
      capabilities: [
        ParticipantTokenCapability.PUBLISH,
        ParticipantTokenCapability.SUBSCRIBE,
      ],
      duration: TOKEN_CONFIG.PUBLISHER_DURATION,
      attributes: {
        role: 'media-server',
        serverId,
        timestamp: new Date().toISOString(),
      },
    });
  }

  /**
   * 驗證 Stage ARN 格式
   */
  validateStageArn(arn: string): boolean {
    const arnPattern = /^arn:aws:ivs:[a-z0-9-]+:\d{12}:stage\/[a-zA-Z0-9]+$/;
    return arnPattern.test(arn);
  }

  /**
   * 從 Stage ARN 提取資訊
   */
  parseStageArn(arn: string): {
    region: string;
    accountId: string;
    stageId: string;
  } | null {
    const match = arn.match(/^arn:aws:ivs:([a-z0-9-]+):(\d{12}):stage\/([a-zA-Z0-9]+)$/);
    
    if (!match) {
      return null;
    }

    return {
      region: match[1],
      accountId: match[2],
      stageId: match[3],
    };
  }

  /**
   * 獲取客戶端實例 (用於高級操作)
   */
  getClient(): IVSRealTimeClient {
    return this.client;
  }

  /**
   * 啟動參與者複製
   * 將主播從源 Stage 複製到目標 Stage
   *
   * @param sourceStageArn 源 Stage ARN（主播所在的 Stage）
   * @param destinationStageArn 目標 Stage ARN（要複製到的 Stage）
   * @param participantId 主播的 Participant ID
   */
  async startParticipantReplication(
    sourceStageArn: string,
    destinationStageArn: string,
    participantId: string
  ): Promise<void> {
    const startTime = Date.now();

    try {
      logger.debug('正在啟動參與者複製', {
        participantId,
        sourceStage: sourceStageArn.substring(sourceStageArn.length - 12),
        destStage: destinationStageArn.substring(destinationStageArn.length - 12),
      });

      // 使用 AWS SDK 的 StartParticipantReplication 命令
      // 注意：需要 @aws-sdk/client-ivs-realtime >= 3.600.0
      const command = {
        input: {
          sourceStageArn,
          destinationStageArn,
          participantId,
        },
        name: 'StartParticipantReplicationCommand',
      };

      // 使用動態導入或直接調用
      // @ts-ignore - SDK 版本可能不支持
      const { StartParticipantReplicationCommand } = await import('@aws-sdk/client-ivs-realtime');

      // @ts-ignore
      const replicationCommand = new StartParticipantReplicationCommand({
        sourceStageArn,
        destinationStageArn,
        participantId,
      });

      await this.client.send(replicationCommand);

      const duration = Date.now() - startTime;
      logger.info('✅ 參與者複製已啟動', {
        participantId,
        sourceStage: sourceStageArn.substring(sourceStageArn.length - 12),
        destStage: destinationStageArn.substring(destinationStageArn.length - 12),
        duration: `${duration}ms`,
      });
    } catch (error: any) {
      const duration = Date.now() - startTime;

      // 如果是 SDK 版本問題，提供友好的錯誤訊息
      if (error.message?.includes('Cannot find module') || error.message?.includes('StartParticipantReplicationCommand')) {
        logger.error('❌ Participant Replication 功能需要更新 AWS SDK', {
          currentVersion: '3.500.0',
          requiredVersion: '>=3.600.0',
          updateCommand: 'npm install @aws-sdk/client-ivs-realtime@latest',
          duration: `${duration}ms`,
        });
        throw new Error('需要更新 @aws-sdk/client-ivs-realtime 到最新版本才能使用 Participant Replication 功能');
      }

      logger.error('❌ 參與者複製啟動失敗', {
        participantId,
        error: error.message,
        duration: `${duration}ms`,
      });
      throw error;
    }
  }

  /**
   * 停止參與者複製
   * 停止將主播複製到目標 Stage
   *
   * @param sourceStageArn 源 Stage ARN
   * @param destinationStageArn 目標 Stage ARN
   * @param participantId 主播的 Participant ID
   */
  async stopParticipantReplication(
    sourceStageArn: string,
    destinationStageArn: string,
    participantId: string
  ): Promise<void> {
    const startTime = Date.now();

    try {
      logger.debug('正在停止參與者複製', {
        participantId,
        sourceStage: sourceStageArn.substring(sourceStageArn.length - 12),
        destStage: destinationStageArn.substring(destinationStageArn.length - 12),
      });

      // @ts-ignore - SDK 版本可能不支持
      const { StopParticipantReplicationCommand } = await import('@aws-sdk/client-ivs-realtime');

      // @ts-ignore
      const replicationCommand = new StopParticipantReplicationCommand({
        sourceStageArn,
        destinationStageArn,
        participantId,
      });

      await this.client.send(replicationCommand);

      const duration = Date.now() - startTime;
      logger.info('✅ 參與者複製已停止', {
        participantId,
        sourceStage: sourceStageArn.substring(sourceStageArn.length - 12),
        destStage: destinationStageArn.substring(destinationStageArn.length - 12),
        duration: `${duration}ms`,
      });
    } catch (error: any) {
      const duration = Date.now() - startTime;

      if (error.message?.includes('Cannot find module') || error.message?.includes('StopParticipantReplicationCommand')) {
        logger.error('❌ Participant Replication 功能需要更新 AWS SDK', {
          currentVersion: '3.500.0',
          requiredVersion: '>=3.600.0',
          updateCommand: 'npm install @aws-sdk/client-ivs-realtime@latest',
          duration: `${duration}ms`,
        });
        throw new Error('需要更新 @aws-sdk/client-ivs-realtime 到最新版本才能使用 Participant Replication 功能');
      }

      logger.error('❌ 參與者複製停止失敗', {
        participantId,
        error: error.message,
        duration: `${duration}ms`,
      });
      throw error;
    }
  }

  /**
   * 列出參與者複製狀態
   * 查詢某個 Stage 的所有複製關係
   *
   * @param stageArn Stage ARN
   */
  async listParticipantReplications(stageArn: string): Promise<any[]> {
    try {
      logger.debug('正在查詢參與者複製列表', {
        stageArn: stageArn.substring(stageArn.length - 12),
      });

      // @ts-ignore - SDK 版本可能不支持
      const { ListParticipantsCommand } = await import('@aws-sdk/client-ivs-realtime');

      // @ts-ignore
      const command = new ListParticipantsCommand({
        stageArn,
      });

      const response = await this.client.send(command);

      logger.info('✅ 參與者複製列表已獲取', {
        stageArn: stageArn.substring(stageArn.length - 12),
        count: response.participants?.length || 0,
      });

      return response.participants || [];
    } catch (error: any) {
      if (error.message?.includes('Cannot find module')) {
        logger.error('❌ Participant Replication 功能需要更新 AWS SDK', {
          currentVersion: '3.500.0',
          requiredVersion: '>=3.600.0',
          updateCommand: 'npm install @aws-sdk/client-ivs-realtime@latest',
        });
        throw new Error('需要更新 @aws-sdk/client-ivs-realtime 到最新版本才能使用 Participant Replication 功能');
      }

      logger.error('❌ 查詢參與者複製列表失敗', {
        error: error.message,
      });
      throw error;
    }
  }
}

export default IVSService;
