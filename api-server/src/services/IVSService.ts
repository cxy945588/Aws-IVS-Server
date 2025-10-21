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
}

export default IVSService;
