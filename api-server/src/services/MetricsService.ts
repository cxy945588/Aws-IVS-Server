/**
 * Metrics 服務
 * 使用 CloudWatch 收集和報告指標
 */

import {
  CloudWatchClient,
  PutMetricDataCommand,
  PutMetricDataCommandInput,
  MetricDatum,
  StandardUnit,
} from '@aws-sdk/client-cloudwatch';
import { logger } from '../utils/logger';
import { METRICS } from '../utils/constants';
import { RedisService } from './RedisService';

export class MetricsService {
  private static instance: MetricsService;
  private client: CloudWatchClient;
  private collectInterval?: NodeJS.Timeout;
  private isCollecting: boolean = false;

  private constructor() {
    this.client = new CloudWatchClient({
      region: process.env.AWS_REGION || 'us-east-1',
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
      },
    });

    logger.info('Metrics Service 初始化完成');
  }

  public static getInstance(): MetricsService {
    if (!MetricsService.instance) {
      MetricsService.instance = new MetricsService();
    }
    return MetricsService.instance;
  }

  /**
   * 開始收集指標
   */
  public startCollecting(intervalMs: number = 60000): void {
    if (this.isCollecting) {
      logger.warn('Metrics 收集已在運行中');
      return;
    }

    this.isCollecting = true;
    logger.info('開始收集 Metrics', { intervalMs });

    this.collectInterval = setInterval(async () => {
      try {
        await this.collectAndSendMetrics();
      } catch (error) {
        logger.error('收集 Metrics 失敗', { error });
      }
    }, intervalMs);

    // 立即執行一次
    this.collectAndSendMetrics().catch((error) => {
      logger.error('初始 Metrics 收集失敗', { error });
    });
  }

  /**
   * 停止收集指標
   */
  public stopCollecting(): void {
    if (this.collectInterval) {
      clearInterval(this.collectInterval);
      this.collectInterval = undefined;
      this.isCollecting = false;
      logger.info('Metrics 收集已停止');
    }
  }

  /**
   * 收集並發送指標
   */
  private async collectAndSendMetrics(): Promise<void> {
    try {
      const redis = RedisService.getInstance();

      // 收集指標資料
      const totalViewers = await redis.getTotalViewerCount();
      const activeStages = (await redis.getActiveStages()).length;

      const metrics: MetricDatum[] = [
        {
          MetricName: METRICS.NAMES.TOTAL_VIEWERS,
          Value: totalViewers,
          Unit: StandardUnit.Count,
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
        },
        {
          MetricName: METRICS.NAMES.ACTIVE_STAGES,
          Value: activeStages,
          Unit: StandardUnit.Count,
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
        },
      ];

      // 發送到 CloudWatch
      await this.sendMetrics(metrics);

      logger.debug('Metrics 已發送', {
        totalViewers,
        activeStages,
      });
    } catch (error) {
      logger.error('收集 Metrics 失敗', { error });
      throw error;
    }
  }

  /**
   * 發送自定義指標
   */
  public async sendCustomMetric(
    metricName: string,
    value: number,
    unit: StandardUnit = StandardUnit.None,
    additionalDimensions?: Array<{ Name: string; Value: string }>
  ): Promise<void> {
    try {
      const dimensions = [
        {
          Name: 'Environment',
          Value: METRICS.DIMENSIONS.ENVIRONMENT,
        },
        {
          Name: 'Service',
          Value: METRICS.DIMENSIONS.SERVICE,
        },
        ...(additionalDimensions || []),
      ];

      const metric: MetricDatum = {
        MetricName: metricName,
        Value: value,
        Unit: unit,
        Timestamp: new Date(),
        Dimensions: dimensions,
      };

      await this.sendMetrics([metric]);
      logger.debug('自定義 Metric 已發送', { metricName, value, unit });
    } catch (error) {
      logger.error('發送自定義 Metric 失敗', { error, metricName });
    }
  }

  /**
   * 發送指標到 CloudWatch
   */
  private async sendMetrics(metrics: MetricDatum[]): Promise<void> {
    // 開發環境不發送到 CloudWatch
    if (process.env.NODE_ENV !== 'production') {
      logger.debug('開發環境：跳過發送 CloudWatch Metrics', { metrics });
      return;
    }

    try {
      const input: PutMetricDataCommandInput = {
        Namespace: METRICS.NAMESPACE,
        MetricData: metrics,
      };

      const command = new PutMetricDataCommand(input);
      await this.client.send(command);
    } catch (error) {
      logger.error('發送 CloudWatch Metrics 失敗', { error });
      throw error;
    }
  }

  /**
   * 記錄 API 延遲
   */
  public async recordApiLatency(endpoint: string, durationMs: number): Promise<void> {
    await this.sendCustomMetric(
      METRICS.NAMES.API_LATENCY,
      durationMs,
      StandardUnit.Milliseconds,
      [{ Name: 'Endpoint', Value: endpoint }]
    );
  }

  /**
   * 記錄錯誤
   */
  public async recordError(errorType: string): Promise<void> {
    await this.sendCustomMetric(
      METRICS.NAMES.ERROR_COUNT,
      1,
      StandardUnit.Count,
      [{ Name: 'ErrorType', Value: errorType }]
    );
  }

  /**
   * 獲取客戶端實例
   */
  public getClient(): CloudWatchClient {
    return this.client;
  }
}

export default MetricsService;
