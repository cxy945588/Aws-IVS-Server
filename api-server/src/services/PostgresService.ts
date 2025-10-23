/**
 * PostgreSQL 服務
 * 使用 Singleton 模式管理 PostgreSQL 連接池
 */

import { Pool, PoolClient, QueryResult } from 'pg';
import { logger } from '../utils/logger';

export class PostgresService {
  private static instance: PostgresService;
  private pool: Pool;
  private isConnected: boolean = false;

  private constructor() {
    // 連接池配置
    this.pool = new Pool({
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '5432'),
      database: process.env.DB_NAME || 'ivs_live',
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD,

      // 連接池設置
      max: parseInt(process.env.DB_POOL_MAX || '20'), // 最大連接數
      min: parseInt(process.env.DB_POOL_MIN || '2'),  // 最小連接數
      idleTimeoutMillis: 30000, // 空閒連接超時
      connectionTimeoutMillis: 2000, // 連接超時

      // SSL 設置（生產環境建議啟用）
      ssl: process.env.DB_SSL_ENABLED === 'true' ? {
        rejectUnauthorized: false
      } : false,
    });

    // 連接池事件監聽
    this.pool.on('connect', () => {
      this.isConnected = true;
      logger.debug('PostgreSQL 新連接已建立');
    });

    this.pool.on('error', (err: Error) => {
      this.isConnected = false;
      logger.error('PostgreSQL 連接池錯誤', { error: err.message });
    });

    this.pool.on('remove', () => {
      logger.debug('PostgreSQL 連接已移除');
    });

    logger.info('PostgreSQL 連接池已初始化', {
      host: process.env.DB_HOST || 'localhost',
      port: process.env.DB_PORT || '5432',
      database: process.env.DB_NAME || 'ivs_live',
      maxConnections: process.env.DB_POOL_MAX || '20',
    });
  }

  public static getInstance(): PostgresService {
    if (!PostgresService.instance) {
      PostgresService.instance = new PostgresService();
    }
    return PostgresService.instance;
  }

  /**
   * 獲取連接池實例
   */
  public getPool(): Pool {
    return this.pool;
  }

  /**
   * 執行 SQL 查詢
   */
  public async query(text: string, params?: any[]): Promise<QueryResult> {
    const start = Date.now();
    try {
      const result = await this.pool.query(text, params);
      const duration = Date.now() - start;

      logger.debug('SQL 查詢完成', {
        duration: `${duration}ms`,
        rows: result.rowCount,
        command: result.command,
      });

      return result;
    } catch (error: any) {
      const duration = Date.now() - start;
      logger.error('SQL 查詢失敗', {
        error: error.message,
        duration: `${duration}ms`,
        query: text.substring(0, 100), // 只記錄前 100 字元
      });
      throw error;
    }
  }

  /**
   * 執行事務
   */
  public async transaction<T>(
    callback: (client: PoolClient) => Promise<T>
  ): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await callback(client);
      await client.query('COMMIT');
      return result;
    } catch (error: any) {
      await client.query('ROLLBACK');
      logger.error('事務執行失敗', { error: error.message });
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * 測試連接
   */
  public async ping(): Promise<boolean> {
    try {
      const result = await this.query('SELECT NOW() as current_time');
      logger.info('PostgreSQL 連接測試成功', {
        serverTime: result.rows[0].current_time,
      });
      return true;
    } catch (error: any) {
      logger.error('PostgreSQL 連接測試失敗', { error: error.message });
      return false;
    }
  }

  /**
   * 獲取連接池狀態
   */
  public getPoolStats(): {
    total: number;
    idle: number;
    waiting: number;
  } {
    return {
      total: this.pool.totalCount,
      idle: this.pool.idleCount,
      waiting: this.pool.waitingCount,
    };
  }

  /**
   * 檢查是否已連接
   */
  public isReady(): boolean {
    return this.isConnected;
  }

  /**
   * 關閉連接池
   */
  public async disconnect(): Promise<void> {
    try {
      await this.pool.end();
      this.isConnected = false;
      logger.info('PostgreSQL 連接池已關閉');
    } catch (error: any) {
      logger.error('關閉 PostgreSQL 連接池失敗', { error: error.message });
      throw error;
    }
  }

  /**
   * 清空資料表（僅用於測試）
   */
  public async truncateAll(): Promise<void> {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('不能在生產環境執行此操作');
    }

    try {
      await this.query('TRUNCATE TABLE viewer_sessions RESTART IDENTITY CASCADE');
      await this.query('TRUNCATE TABLE viewer_stats_snapshots RESTART IDENTITY CASCADE');
      await this.query('TRUNCATE TABLE stages RESTART IDENTITY CASCADE');
      logger.warn('⚠️ 所有資料表已清空（僅測試環境）');
    } catch (error: any) {
      logger.error('清空資料表失敗', { error: error.message });
      throw error;
    }
  }

  /**
   * 執行清理舊數據
   */
  public async cleanupOldData(daysToKeep: number = 90): Promise<number> {
    try {
      const result = await this.query(
        'SELECT cleanup_old_snapshots($1) as deleted_count',
        [daysToKeep]
      );
      const deletedCount = result.rows[0].deleted_count;

      logger.info('🧹 舊數據清理完成', {
        daysToKeep,
        deletedSnapshots: deletedCount,
      });

      return deletedCount;
    } catch (error: any) {
      logger.error('清理舊數據失敗', { error: error.message });
      return 0;
    }
  }
}

export default PostgresService;
