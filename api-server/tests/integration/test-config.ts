/**
 * 集成测试配置
 * 测试范围：Redis + API 端点（不包含 PostgreSQL）
 */

export const TEST_CONFIG = {
  // 测试服务器配置
  server: {
    host: process.env.TEST_HOST || 'localhost',
    port: parseInt(process.env.TEST_PORT || '3000'),
    baseUrl: process.env.TEST_BASE_URL || 'http://localhost:3000',
  },

  // Redis 配置
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379'),
    password: process.env.REDIS_PASSWORD,
    db: parseInt(process.env.REDIS_DB || '0'),
  },

  // 测试数据配置
  testData: {
    userId: 'test-user-' + Date.now(),
    stageArn: process.env.TEST_STAGE_ARN || 'arn:aws:ivs:us-west-2:123456789012:stage/abcdEFGHijkl',
    participantId: 'test-participant-' + Date.now(),
  },

  // 测试阈值
  thresholds: {
    maxResponseTime: 1000, // ms
    maxRedisResponseTime: 100, // ms
    minViewerCount: 0,
    maxViewerCount: 1000000,
    heartbeatTTL: 120, // seconds
  },

  // 测试选项
  options: {
    cleanupAfterTests: true,
    verbose: process.env.TEST_VERBOSE === 'true',
    skipSlowTests: process.env.SKIP_SLOW_TESTS === 'true',
    skipStressTests: process.env.SKIP_STRESS_TESTS === 'true',
  },

  // 压力测试配置
  stress: {
    concurrentViewers: 100,
    requestsPerSecond: 50,
    durationSeconds: 30,
  },
};

export interface TestResult {
  name: string;
  status: 'pass' | 'fail' | 'skip';
  duration: number;
  error?: string;
  details?: any;
}

export interface TestSuite {
  name: string;
  results: TestResult[];
  totalTests: number;
  passedTests: number;
  failedTests: number;
  skippedTests: number;
  totalDuration: number;
}
