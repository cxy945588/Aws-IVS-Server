/**
 * API 端点测试
 * 测试所有观众相关的 API 端点
 */

import { TEST_CONFIG, TestResult } from './test-config';

const BASE_URL = TEST_CONFIG.server.baseUrl;

export async function runApiTests(): Promise<TestResult[]> {
  const results: TestResult[] = [];

  console.log('\n=== 3. API 端点测试 ===\n');

  const testUserId = TEST_CONFIG.testData.userId;
  const stageArn = TEST_CONFIG.testData.stageArn;
  const participantId = TEST_CONFIG.testData.participantId;

  // 测试 1: 观众重新加入 (rejoin)
  results.push(await testViewerRejoin(testUserId, stageArn, participantId));

  // 测试 2: 观众心跳 (heartbeat)
  results.push(await testViewerHeartbeat(testUserId, stageArn));

  // 测试 3: 获取观众列表 (list)
  results.push(await testGetViewerList(stageArn));

  // 测试 4: 观众离开 (leave)
  results.push(await testViewerLeave(testUserId, stageArn));

  // 测试 5: 验证参数校验
  results.push(await testParameterValidation());

  // 测试 6: 获取观看时长
  results.push(await testGetViewDuration(testUserId, stageArn));

  return results;
}

async function testViewerRejoin(
  userId: string,
  stageArn: string,
  participantId: string
): Promise<TestResult> {
  const start = Date.now();
  const name = 'POST /api/viewer/rejoin - 观众加入';

  try {
    const response = await fetch(`${BASE_URL}/api/viewer/rejoin`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, stageArn, participantId }),
    });

    const duration = Date.now() - start;

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`HTTP ${response.status}: ${JSON.stringify(error)}`);
    }

    const data = await response.json();

    // 验证响应格式
    if (data.success !== true) {
      throw new Error(`API 响应失败: ${JSON.stringify(data)}`);
    }

    if (!data.data || typeof data.data.currentViewers !== 'number') {
      throw new Error('响应数据格式错误，缺少 currentViewers');
    }

    if (duration > TEST_CONFIG.thresholds.maxResponseTime) {
      console.log(`⚠ ${name} - 响应时间过长: ${duration}ms`);
    }

    console.log('✓', name, `(${duration}ms)`);
    return {
      name,
      status: 'pass',
      duration,
      details: {
        currentViewers: data.data.currentViewers,
        userId,
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

async function testViewerHeartbeat(userId: string, stageArn: string): Promise<TestResult> {
  const start = Date.now();
  const name = 'POST /api/viewer/heartbeat - 观众心跳';

  try {
    const response = await fetch(`${BASE_URL}/api/viewer/heartbeat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, stageArn }),
    });

    const duration = Date.now() - start;

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`HTTP ${response.status}: ${JSON.stringify(error)}`);
    }

    const data = await response.json();

    if (data.success !== true) {
      throw new Error(`API 响应失败: ${JSON.stringify(data)}`);
    }

    if (duration > TEST_CONFIG.thresholds.maxResponseTime) {
      console.log(`⚠ ${name} - 响应时间过长: ${duration}ms`);
    }

    console.log('✓', name, `(${duration}ms)`);
    return {
      name,
      status: 'pass',
      duration,
      details: data.data,
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

async function testGetViewerList(stageArn: string): Promise<TestResult> {
  const start = Date.now();
  const name = 'GET /api/viewer/list/:stageArn - 获取观众列表';

  try {
    const encodedStageArn = encodeURIComponent(stageArn);
    const response = await fetch(`${BASE_URL}/api/viewer/list/${encodedStageArn}`);

    const duration = Date.now() - start;

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`HTTP ${response.status}: ${JSON.stringify(error)}`);
    }

    const data = await response.json();

    if (data.success !== true) {
      throw new Error(`API 响应失败: ${JSON.stringify(data)}`);
    }

    if (!Array.isArray(data.data.viewers)) {
      throw new Error('响应数据应该包含 viewers 数组');
    }

    if (typeof data.data.totalViewers !== 'number') {
      throw new Error('响应数据应该包含 totalViewers 数字');
    }

    console.log('✓', name, `(${duration}ms, ${data.data.totalViewers} viewers)`);
    return {
      name,
      status: 'pass',
      duration,
      details: {
        totalViewers: data.data.totalViewers,
        activeViewers: data.data.activeViewers,
        viewersReturned: data.data.viewers.length,
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

async function testViewerLeave(userId: string, stageArn: string): Promise<TestResult> {
  const start = Date.now();
  const name = 'POST /api/viewer/leave - 观众离开';

  try {
    const response = await fetch(`${BASE_URL}/api/viewer/leave`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, stageArn }),
    });

    const duration = Date.now() - start;

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`HTTP ${response.status}: ${JSON.stringify(error)}`);
    }

    const data = await response.json();

    if (data.success !== true) {
      throw new Error(`API 响应失败: ${JSON.stringify(data)}`);
    }

    console.log('✓', name, `(${duration}ms)`);
    return {
      name,
      status: 'pass',
      duration,
      details: data.data,
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

async function testParameterValidation(): Promise<TestResult> {
  const start = Date.now();
  const name = 'POST /api/viewer/rejoin - 参数校验';

  try {
    // 测试缺少参数的情况
    const response = await fetch(`${BASE_URL}/api/viewer/rejoin`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });

    if (response.ok) {
      throw new Error('缺少必要参数应该返回错误，但请求成功了');
    }

    if (response.status !== 400) {
      throw new Error(`应该返回 400 状态码，实际: ${response.status}`);
    }

    const data = await response.json();

    if (data.success !== false) {
      throw new Error(`响应应该是失败，实际: ${JSON.stringify(data)}`);
    }

    console.log('✓', name);
    return {
      name,
      status: 'pass',
      duration: Date.now() - start,
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

async function testGetViewDuration(userId: string, stageArn: string): Promise<TestResult> {
  const start = Date.now();
  const name = 'GET /api/viewer/duration - 获取观看时长';

  try {
    const url = new URL(`${BASE_URL}/api/viewer/duration`);
    url.searchParams.append('userId', userId);
    url.searchParams.append('stageArn', stageArn);

    const response = await fetch(url.toString());

    const duration = Date.now() - start;

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`HTTP ${response.status}: ${JSON.stringify(error)}`);
    }

    const data = await response.json();

    if (data.success !== true) {
      throw new Error(`API 响应失败: ${JSON.stringify(data)}`);
    }

    if (typeof data.data.watchDurationSeconds !== 'number') {
      throw new Error('响应数据应该包含 watchDurationSeconds 数字');
    }

    console.log('✓', name, `(${duration}ms, ${data.data.watchDurationSeconds}s)`);
    return {
      name,
      status: 'pass',
      duration,
      details: {
        watchDurationSeconds: data.data.watchDurationSeconds,
        watchDurationFormatted: data.data.watchDurationFormatted,
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
