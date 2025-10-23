/**
 * Redis 服务功能测试
 * 测试观众计数、心跳、TTL 等 Redis 操作
 */

import Redis from 'ioredis';
import { TEST_CONFIG, TestResult } from './test-config';

export async function runRedisTests(): Promise<TestResult[]> {
  const results: TestResult[] = [];

  console.log('\n=== 2. Redis 服务功能测试 ===\n');

  const redis = new Redis({
    host: TEST_CONFIG.redis.host,
    port: TEST_CONFIG.redis.port,
    password: TEST_CONFIG.redis.password,
    db: TEST_CONFIG.redis.db,
  });

  try {
    // 测试 1: 观众计数增减
    results.push(await testViewerCounting(redis));

    // 测试 2: 观众心跳和 TTL
    results.push(await testViewerHeartbeat(redis));

    // 测试 3: Stage 统计
    results.push(await testStageStats(redis));

    // 测试 4: 并发操作
    results.push(await testConcurrentOperations(redis));

    // 清理测试数据
    await cleanupTestData(redis);
  } finally {
    await redis.quit();
  }

  return results;
}

async function testViewerCounting(redis: Redis): Promise<TestResult> {
  const start = Date.now();
  const name = '观众计数增减测试';
  const stageArn = TEST_CONFIG.testData.stageArn;
  const countKey = `stage:${stageArn}:viewer_count`;

  try {
    // 清理旧数据
    await redis.del(countKey);

    // 测试增加
    const count1 = await redis.incr(countKey);
    if (count1 !== 1) {
      throw new Error(`第一次 INCR 应该返回 1，实际返回: ${count1}`);
    }

    const count2 = await redis.incr(countKey);
    if (count2 !== 2) {
      throw new Error(`第二次 INCR 应该返回 2，实际返回: ${count2}`);
    }

    // 测试减少
    const count3 = await redis.decr(countKey);
    if (count3 !== 1) {
      throw new Error(`DECR 应该返回 1，实际返回: ${count3}`);
    }

    // 测试获取
    const currentCount = await redis.get(countKey);
    if (currentCount !== '1') {
      throw new Error(`GET 应该返回 "1"，实际返回: ${currentCount}`);
    }

    console.log('✓', name);
    return {
      name,
      status: 'pass',
      duration: Date.now() - start,
      details: { finalCount: currentCount },
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
    await redis.del(countKey);
  }
}

async function testViewerHeartbeat(redis: Redis): Promise<TestResult> {
  const start = Date.now();
  const name = '观众心跳和 TTL 测试';
  const stageArn = TEST_CONFIG.testData.stageArn;
  const userId = 'test-heartbeat-user-' + Date.now();
  const heartbeatKey = `stage:${stageArn}:viewers:${userId}`;

  try {
    // 设置心跳（2 分钟 TTL）
    await redis.set(heartbeatKey, Date.now().toString(), 'EX', 120);

    // 检查 TTL
    const ttl = await redis.ttl(heartbeatKey);
    if (ttl < 110 || ttl > 120) {
      throw new Error(`TTL 应该在 110-120 之间，实际值: ${ttl}`);
    }

    // 检查值存在
    const exists = await redis.exists(heartbeatKey);
    if (exists !== 1) {
      throw new Error('心跳键应该存在');
    }

    // 更新心跳
    await redis.set(heartbeatKey, Date.now().toString(), 'EX', 120);

    // 再次检查 TTL
    const ttl2 = await redis.ttl(heartbeatKey);
    if (ttl2 < 110 || ttl2 > 120) {
      throw new Error(`更新后 TTL 应该在 110-120 之间，实际值: ${ttl2}`);
    }

    console.log('✓', name);
    return {
      name,
      status: 'pass',
      duration: Date.now() - start,
      details: { ttl: ttl2 },
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
    await redis.del(heartbeatKey);
  }
}

async function testStageStats(redis: Redis): Promise<TestResult> {
  const start = Date.now();
  const name = 'Stage 统计测试';
  const stageArn = TEST_CONFIG.testData.stageArn;
  const countKey = `stage:${stageArn}:viewer_count`;
  const activeKey = `stage:${stageArn}:viewers:*`;

  try {
    // 设置观众计数
    await redis.set(countKey, '42');

    // 创建几个活跃观众
    const viewers = [
      `stage:${stageArn}:viewers:user1`,
      `stage:${stageArn}:viewers:user2`,
      `stage:${stageArn}:viewers:user3`,
    ];

    for (const viewerKey of viewers) {
      await redis.set(viewerKey, Date.now().toString(), 'EX', 120);
    }

    // 获取计数
    const count = await redis.get(countKey);
    if (count !== '42') {
      throw new Error(`观众计数应该是 42，实际: ${count}`);
    }

    // 获取活跃观众键（使用 SCAN 而不是 KEYS）
    const foundKeys: string[] = [];
    let cursor = '0';
    do {
      const [newCursor, keys] = await redis.scan(
        cursor,
        'MATCH',
        `stage:${stageArn}:viewers:*`,
        'COUNT',
        100
      );
      cursor = newCursor;
      foundKeys.push(...keys);
    } while (cursor !== '0');

    // 过滤掉 viewer_count 键
    const viewerKeys = foundKeys.filter((key: string) => !key.endsWith(':viewer_count'));

    if (viewerKeys.length < 3) {
      throw new Error(`应该找到至少 3 个观众键，实际找到: ${viewerKeys.length}`);
    }

    console.log('✓', name);
    return {
      name,
      status: 'pass',
      duration: Date.now() - start,
      details: {
        viewerCount: count,
        activeViewers: viewerKeys.length,
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
    await redis.del(countKey);
    // 清理观众键
    const keysToDelete: string[] = [];
    let cursor = '0';
    do {
      const [newCursor, keys] = await redis.scan(
        cursor,
        'MATCH',
        `stage:${stageArn}:viewers:*`,
        'COUNT',
        100
      );
      cursor = newCursor;
      keysToDelete.push(...keys);
    } while (cursor !== '0');

    if (keysToDelete.length > 0) {
      await redis.del(...keysToDelete);
    }
  }
}

async function testConcurrentOperations(redis: Redis): Promise<TestResult> {
  const start = Date.now();
  const name = '并发操作测试';
  const stageArn = TEST_CONFIG.testData.stageArn;
  const countKey = `stage:${stageArn}:viewer_count`;

  try {
    await redis.del(countKey);

    // 并发执行 50 次 INCR
    const promises = Array.from({ length: 50 }, () => redis.incr(countKey));
    await Promise.all(promises);

    // 检查最终计数
    const finalCount = await redis.get(countKey);
    if (finalCount !== '50') {
      throw new Error(`并发 INCR 后计数应该是 50，实际: ${finalCount}`);
    }

    console.log('✓', name);
    return {
      name,
      status: 'pass',
      duration: Date.now() - start,
      details: { finalCount },
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
    await redis.del(countKey);
  }
}

async function cleanupTestData(redis: Redis): Promise<void> {
  const stageArn = TEST_CONFIG.testData.stageArn;
  const patterns = [
    `stage:${stageArn}:*`,
    `test:*`,
  ];

  for (const pattern of patterns) {
    let cursor = '0';
    do {
      const [newCursor, keys] = await redis.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
      cursor = newCursor;
      if (keys.length > 0) {
        await redis.del(...keys);
      }
    } while (cursor !== '0');
  }
}
