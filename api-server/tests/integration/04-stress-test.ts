/**
 * 压力测试
 * 模拟高并发场景，测试系统性能
 */

import { TEST_CONFIG, TestResult } from './test-config';

const BASE_URL = TEST_CONFIG.server.baseUrl;

export async function runStressTests(): Promise<TestResult[]> {
  const results: TestResult[] = [];

  if (TEST_CONFIG.options.skipStressTests) {
    console.log('\n=== 4. 压力测试 (已跳过) ===\n');
    return results;
  }

  console.log('\n=== 4. 压力测试 ===\n');

  // 测试 1: 并发观众加入
  results.push(await testConcurrentViewerJoin());

  // 测试 2: 高频心跳
  results.push(await testHighFrequencyHeartbeat());

  // 测试 3: 大量观众同时离开
  results.push(await testMassViewerLeave());

  return results;
}

async function testConcurrentViewerJoin(): Promise<TestResult> {
  const start = Date.now();
  const name = `并发观众加入测试 (${TEST_CONFIG.stress.concurrentViewers} 观众)`;
  const stageArn = TEST_CONFIG.testData.stageArn;

  try {
    const userIds: string[] = [];
    const responses: Response[] = [];

    // 分批发送以避免触发 Rate Limit (100 req/min)
    // 使用批次大小 20，每批延迟 200ms
    const BATCH_SIZE = 20;
    const BATCH_DELAY = 200; // ms

    const totalViewers = TEST_CONFIG.stress.concurrentViewers;
    const numBatches = Math.ceil(totalViewers / BATCH_SIZE);

    for (let batchIndex = 0; batchIndex < numBatches; batchIndex++) {
      const batchStart = batchIndex * BATCH_SIZE;
      const batchEnd = Math.min(batchStart + BATCH_SIZE, totalViewers);

      // 创建当前批次的并发请求
      const batchPromises = [];
      for (let i = batchStart; i < batchEnd; i++) {
        const userId = `stress-user-${Date.now()}-${i}`;
        const participantId = `stress-participant-${Date.now()}-${i}`;
        userIds.push(userId);

        batchPromises.push(
          fetch(`${BASE_URL}/api/viewer/rejoin`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId, stageArn, participantId }),
          })
        );
      }

      // 等待当前批次完成
      const batchResponses = await Promise.all(batchPromises);
      responses.push(...batchResponses);

      // 批次之间添加延迟（除了最后一批）
      if (batchIndex < numBatches - 1) {
        await new Promise((resolve) => setTimeout(resolve, BATCH_DELAY));
      }
    }

    // 检查成功率
    const successCount = responses.filter((r) => r.ok).length;
    const failCount = responses.length - successCount;
    const successRate = (successCount / responses.length) * 100;

    const duration = Date.now() - start;

    // 清理：让所有观众离开
    await cleanupViewers(userIds, stageArn);

    if (successRate < 95) {
      throw new Error(`成功率过低: ${successRate.toFixed(2)}% (${failCount} 失败)`);
    }

    console.log(
      '✓',
      name,
      `- 成功率: ${successRate.toFixed(2)}% (${duration}ms, ${(
        duration / responses.length
      ).toFixed(2)}ms/req)`
    );

    return {
      name,
      status: 'pass',
      duration,
      details: {
        totalRequests: responses.length,
        successCount,
        failCount,
        successRate: successRate.toFixed(2) + '%',
        avgResponseTime: (duration / responses.length).toFixed(2) + 'ms',
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

async function testHighFrequencyHeartbeat(): Promise<TestResult> {
  const start = Date.now();
  const name = `高频心跳测试 (${TEST_CONFIG.stress.requestsPerSecond} req/s, ${TEST_CONFIG.stress.durationSeconds}s)`;
  const stageArn = TEST_CONFIG.testData.stageArn;
  const userId = 'stress-heartbeat-user-' + Date.now();
  const participantId = 'stress-heartbeat-participant-' + Date.now();

  try {
    // 先加入
    await fetch(`${BASE_URL}/api/viewer/rejoin`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, stageArn, participantId }),
    });

    const totalRequests = TEST_CONFIG.stress.requestsPerSecond * TEST_CONFIG.stress.durationSeconds;
    const intervalMs = 1000 / TEST_CONFIG.stress.requestsPerSecond;
    let successCount = 0;
    let failCount = 0;

    // 发送心跳
    for (let i = 0; i < totalRequests; i++) {
      const reqStart = Date.now();

      const response = await fetch(`${BASE_URL}/api/viewer/heartbeat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, stageArn }),
      });

      if (response.ok) {
        successCount++;
      } else {
        failCount++;
      }

      // 控制请求频率
      const elapsed = Date.now() - reqStart;
      const delay = Math.max(0, intervalMs - elapsed);
      if (delay > 0) {
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }

    // 清理
    await fetch(`${BASE_URL}/api/viewer/leave`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, stageArn }),
    });

    const duration = Date.now() - start;
    const successRate = (successCount / totalRequests) * 100;

    if (successRate < 98) {
      throw new Error(`成功率过低: ${successRate.toFixed(2)}% (${failCount} 失败)`);
    }

    console.log(
      '✓',
      name,
      `- 成功率: ${successRate.toFixed(2)}% (总耗时: ${duration}ms, 平均: ${(
        duration / totalRequests
      ).toFixed(2)}ms/req)`
    );

    return {
      name,
      status: 'pass',
      duration,
      details: {
        totalRequests,
        successCount,
        failCount,
        successRate: successRate.toFixed(2) + '%',
        avgResponseTime: (duration / totalRequests).toFixed(2) + 'ms',
        requestsPerSecond: (totalRequests / (duration / 1000)).toFixed(2),
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

async function testMassViewerLeave(): Promise<TestResult> {
  const start = Date.now();
  const name = `大量观众同时离开测试 (${TEST_CONFIG.stress.concurrentViewers} 观众)`;
  const stageArn = TEST_CONFIG.testData.stageArn;

  try {
    const userIds: string[] = [];

    // 先让观众加入
    const joinPromises = Array.from({ length: TEST_CONFIG.stress.concurrentViewers }, (_, i) => {
      const userId = `mass-leave-user-${Date.now()}-${i}`;
      const participantId = `mass-leave-participant-${Date.now()}-${i}`;
      userIds.push(userId);

      return fetch(`${BASE_URL}/api/viewer/rejoin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, stageArn, participantId }),
      });
    });

    await Promise.all(joinPromises);

    // 等待一小段时间
    await new Promise((resolve) => setTimeout(resolve, 500));

    // 并发离开
    const leaveStart = Date.now();
    const leavePromises = userIds.map((userId) =>
      fetch(`${BASE_URL}/api/viewer/leave`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, stageArn }),
      })
    );

    const responses = await Promise.all(leavePromises);
    const leaveDuration = Date.now() - leaveStart;

    // 检查成功率
    const successCount = responses.filter((r) => r.ok).length;
    const failCount = responses.length - successCount;
    const successRate = (successCount / responses.length) * 100;

    if (successRate < 95) {
      throw new Error(`离开成功率过低: ${successRate.toFixed(2)}% (${failCount} 失败)`);
    }

    const duration = Date.now() - start;

    console.log(
      '✓',
      name,
      `- 成功率: ${successRate.toFixed(2)}% (离开耗时: ${leaveDuration}ms, 平均: ${(
        leaveDuration / responses.length
      ).toFixed(2)}ms/req)`
    );

    return {
      name,
      status: 'pass',
      duration,
      details: {
        totalViewers: userIds.length,
        successCount,
        failCount,
        successRate: successRate.toFixed(2) + '%',
        leaveDuration: leaveDuration + 'ms',
        avgLeaveTime: (leaveDuration / responses.length).toFixed(2) + 'ms',
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

async function cleanupViewers(userIds: string[], stageArn: string): Promise<void> {
  const leavePromises = userIds.map((userId) =>
    fetch(`${BASE_URL}/api/viewer/leave`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, stageArn }),
    }).catch(() => {}) // 忽略错误
  );

  await Promise.all(leavePromises);
}
