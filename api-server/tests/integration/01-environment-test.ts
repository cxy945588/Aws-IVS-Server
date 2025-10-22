/**
 * 环境检查测试
 * 测试 Redis 和服务器连接
 */

import Redis from 'ioredis';
import { TEST_CONFIG, TestResult } from './test-config';

export async function runEnvironmentTests(): Promise<TestResult[]> {
  const results: TestResult[] = [];

  console.log('\n=== 1. 环境检查测试 ===\n');

  // 测试 1: 检查环境变量
  results.push(await testEnvironmentVariables());

  // 测试 2: Redis 连接测试
  results.push(await testRedisConnection());

  // 测试 3: 服务器健康检查
  results.push(await testServerHealth());

  return results;
}

async function testEnvironmentVariables(): Promise<TestResult> {
  const start = Date.now();
  const name = '检查环境变量配置';

  try {
    const required = ['REDIS_HOST', 'REDIS_PORT'];
    const missing: string[] = [];

    for (const key of required) {
      if (!process.env[key]) {
        missing.push(key);
      }
    }

    if (missing.length > 0) {
      return {
        name,
        status: 'fail',
        duration: Date.now() - start,
        error: `缺少必要的环境变量: ${missing.join(', ')}`,
      };
    }

    console.log('✓', name);
    return {
      name,
      status: 'pass',
      duration: Date.now() - start,
      details: {
        redis: {
          host: process.env.REDIS_HOST,
          port: process.env.REDIS_PORT,
          db: process.env.REDIS_DB || '0',
        },
      },
    };
  } catch (error: any) {
    console.log('✗', name, '-', error.message);
    return {
      name,
      status: 'fail',
      duration: Date.now() - start,
      error: error.message,
    };
  }
}

async function testRedisConnection(): Promise<TestResult> {
  const start = Date.now();
  const name = 'Redis 连接测试';
  let redis: Redis | null = null;

  try {
    redis = new Redis({
      host: TEST_CONFIG.redis.host,
      port: TEST_CONFIG.redis.port,
      password: TEST_CONFIG.redis.password,
      db: TEST_CONFIG.redis.db,
      retryStrategy: () => null, // 不重试
    });

    // 测试 PING
    const pong = await redis.ping();
    if (pong !== 'PONG') {
      throw new Error(`Redis PING 失败，返回: ${pong}`);
    }

    // 测试读写
    const testKey = 'test:connection:' + Date.now();
    await redis.set(testKey, 'test-value', 'EX', 10);
    const value = await redis.get(testKey);
    await redis.del(testKey);

    if (value !== 'test-value') {
      throw new Error('Redis 读写测试失败');
    }

    console.log('✓', name);
    return {
      name,
      status: 'pass',
      duration: Date.now() - start,
      details: {
        host: TEST_CONFIG.redis.host,
        port: TEST_CONFIG.redis.port,
        db: TEST_CONFIG.redis.db,
      },
    };
  } catch (error: any) {
    console.log('✗', name, '-', error.message);
    return {
      name,
      status: 'fail',
      duration: Date.now() - start,
      error: error.message,
    };
  } finally {
    if (redis) {
      await redis.quit();
    }
  }
}

async function testServerHealth(): Promise<TestResult> {
  const start = Date.now();
  const name = '服务器健康检查';

  try {
    const response = await fetch(`${TEST_CONFIG.server.baseUrl}/health`);

    if (!response.ok) {
      throw new Error(`服务器返回错误状态: ${response.status}`);
    }

    const data = await response.json();

    if (data.status !== 'success') {
      throw new Error(`API 响应状态异常: ${data.status}`);
    }

    if (!data.data || data.data.status !== 'healthy') {
      throw new Error(`服务器健康状态异常: ${data.data?.status || 'unknown'}`);
    }

    console.log('✓', name);
    return {
      name,
      status: 'pass',
      duration: Date.now() - start,
      details: {
        serverUrl: TEST_CONFIG.server.baseUrl,
        response: data,
      },
    };
  } catch (error: any) {
    console.log('✗', name, '-', error.message);
    return {
      name,
      status: 'fail',
      duration: Date.now() - start,
      error: error.message,
    };
  }
}
