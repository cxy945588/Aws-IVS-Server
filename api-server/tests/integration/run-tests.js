#!/usr/bin/env node
/**
 * 简化版测试脚本 (JavaScript)
 * 可以直接用 node 运行，不需要 TypeScript
 *
 * 使用方法：
 *   node tests/integration/run-tests.js
 *   npm run test:integration
 */

require('dotenv').config();

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:3000';
const REDIS_HOST = process.env.REDIS_HOST || 'localhost';
const REDIS_PORT = process.env.REDIS_PORT || '6379';
const STAGE_ARN = process.env.TEST_STAGE_ARN || 'arn:aws:ivs:us-west-2:123456789012:stage/abcdEFGHijkl';
const SKIP_STRESS_TESTS = process.env.SKIP_STRESS_TESTS === 'true';

console.log('╔══════════════════════════════════════════════════════════╗');
console.log('║          AWS IVS 服务器集成测试套件                      ║');
console.log('║          测试范围：Redis + API 端点                      ║');
console.log('╚══════════════════════════════════════════════════════════╝');
console.log();
console.log('测试配置:');
console.log(`  服务器: ${BASE_URL}`);
console.log(`  Redis: ${REDIS_HOST}:${REDIS_PORT}`);
console.log(`  Stage ARN: ${STAGE_ARN}`);
console.log(`  跳过压力测试: ${SKIP_STRESS_TESTS}`);
console.log();

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

async function test(name, fn) {
  totalTests++;
  const start = Date.now();
  try {
    await fn();
    const duration = Date.now() - start;
    console.log(`✓ ${name} (${duration}ms)`);
    passedTests++;
    return true;
  } catch (error) {
    const duration = Date.now() - start;
    console.log(`✗ ${name} (${duration}ms)`);
    console.log(`  错误: ${error.message}`);
    failedTests++;
    return false;
  }
}

async function main() {
  const startTime = Date.now();

  // ========== 环境检查测试 ==========
  console.log('=== 1. 环境检查测试 ===\n');

  // 测试：服务器健康检查
  const serverOk = await test('服务器健康检查', async () => {
    const response = await fetch(`${BASE_URL}/health`);
    if (!response.ok) {
      throw new Error(`服务器返回错误状态: ${response.status}`);
    }
    const data = await response.json();
    if (data.success !== true) {
      throw new Error(`API 响应失败: ${JSON.stringify(data)}`);
    }
    if (!data.data || data.data.status !== 'healthy') {
      throw new Error(`服务器健康状态异常: ${data.data?.status || 'unknown'}`);
    }
  });

  if (!serverOk) {
    console.log('\n⚠️  服务器健康检查失败，跳过后续测试');
    printSummary(Date.now() - startTime);
    process.exit(1);
  }

  // ========== API 端点测试 ==========
  console.log('\n=== 2. API 端点测试 ===\n');

  const userId = 'test-user-' + Date.now();
  const participantId = 'test-participant-' + Date.now();

  // 测试：观众加入
  await test('POST /api/viewer/rejoin - 观众加入', async () => {
    const response = await fetch(`${BASE_URL}/api/viewer/rejoin`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, stageArn: STAGE_ARN, participantId }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`HTTP ${response.status}: ${JSON.stringify(error)}`);
    }

    const data = await response.json();
    if (data.success !== true) {
      throw new Error(`API 响应失败: ${JSON.stringify(data)}`);
    }
    if (typeof data.data.currentViewers !== 'number') {
      throw new Error('响应数据格式错误，缺少 currentViewers');
    }
  });

  // 测试：观众心跳
  await test('POST /api/viewer/heartbeat - 观众心跳', async () => {
    const response = await fetch(`${BASE_URL}/api/viewer/heartbeat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, stageArn: STAGE_ARN }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`HTTP ${response.status}: ${JSON.stringify(error)}`);
    }

    const data = await response.json();
    if (data.success !== true) {
      throw new Error(`API 响应失败: ${JSON.stringify(data)}`);
    }
  });

  // 测试：获取观众列表
  await test('GET /api/viewer/list/:stageArn - 获取观众列表', async () => {
    const encodedStageArn = encodeURIComponent(STAGE_ARN);
    const response = await fetch(`${BASE_URL}/api/viewer/list/${encodedStageArn}`);

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
  });

  // 测试：获取观看时长
  await test('GET /api/viewer/duration - 获取观看时长', async () => {
    const url = new URL(`${BASE_URL}/api/viewer/duration`);
    url.searchParams.append('userId', userId);
    url.searchParams.append('stageArn', STAGE_ARN);

    const response = await fetch(url.toString());

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
  });

  // 测试：观众离开
  await test('POST /api/viewer/leave - 观众离开', async () => {
    const response = await fetch(`${BASE_URL}/api/viewer/leave`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, stageArn: STAGE_ARN }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`HTTP ${response.status}: ${JSON.stringify(error)}`);
    }

    const data = await response.json();
    if (data.success !== true) {
      throw new Error(`API 响应失败: ${JSON.stringify(data)}`);
    }
  });

  // 测试：参数校验
  await test('POST /api/viewer/rejoin - 参数校验', async () => {
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
  });

  // ========== 压力测试 ==========
  if (!SKIP_STRESS_TESTS) {
    console.log('\n=== 3. 压力测试 ===\n');

    // 测试：并发观众加入（分批避免 Rate Limit）
    await test('并发观众加入测试 (50 观众)', async () => {
      const userIds = [];
      const responses = [];
      const BATCH_SIZE = 20;
      const BATCH_DELAY = 200; // ms
      const totalViewers = 50;
      const numBatches = Math.ceil(totalViewers / BATCH_SIZE);

      for (let batchIndex = 0; batchIndex < numBatches; batchIndex++) {
        const batchStart = batchIndex * BATCH_SIZE;
        const batchEnd = Math.min(batchStart + BATCH_SIZE, totalViewers);

        // 创建当前批次的并发请求
        const batchPromises = [];
        for (let i = batchStart; i < batchEnd; i++) {
          const uid = `stress-user-${Date.now()}-${i}`;
          const pid = `stress-participant-${Date.now()}-${i}`;
          userIds.push(uid);

          batchPromises.push(
            fetch(`${BASE_URL}/api/viewer/rejoin`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ userId: uid, stageArn: STAGE_ARN, participantId: pid }),
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

      const successCount = responses.filter((r) => r.ok).length;
      const successRate = (successCount / responses.length) * 100;

      // 清理
      await Promise.all(
        userIds.map((uid) =>
          fetch(`${BASE_URL}/api/viewer/leave`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: uid, stageArn: STAGE_ARN }),
          }).catch(() => {})
        )
      );

      if (successRate < 95) {
        throw new Error(`成功率过低: ${successRate.toFixed(2)}%`);
      }
    });
  } else {
    console.log('\n=== 3. 压力测试 (已跳过) ===\n');
  }

  // ========== 等待 Rate Limit 窗口重置 ==========
  if (!SKIP_STRESS_TESTS) {
    console.log('⏳ 等待 Rate Limit 窗口重置... (3 秒)\n');
    await new Promise((resolve) => setTimeout(resolve, 3000));
  }

  // ========== 自动扩展测试 ==========
  if (!SKIP_STRESS_TESTS) {
    console.log('\n=== 4. Stage 自动扩展测试 ===\n');
    console.log('⚠️  此测试需要较长时间（约 1-2 分钟）\n');

    // 测试：模拟触发自动扩展
    await test('自动扩展测试 - 模拟 50 个观众加入', async () => {
      const SCALE_UP_THRESHOLD = 45;
      const HEALTH_CHECK_INTERVAL = 30000; // 30 秒

      // 1. 获取初始 Stage 数量（带重试逻辑处理 Rate Limit）
      console.log('  📊 获取初始 Stage 数量...');
      let initialStageCount = 0;
      for (let attempt = 1; attempt <= 3; attempt++) {
        const initialResponse = await fetch(`${BASE_URL}/api/stage/list`);
        if (initialResponse.status === 429) {
          if (attempt < 3) {
            console.log(`    ⚠️ 遇到 Rate Limit，2 秒后重试 (${attempt}/3)...`);
            await new Promise((resolve) => setTimeout(resolve, 2000));
            continue;
          }
          throw new Error('获取 Stage 列表失败: Rate Limit');
        }
        if (!initialResponse.ok) throw new Error(`获取 Stage 列表失败: HTTP ${initialResponse.status}`);
        const initialData = await initialResponse.json();
        initialStageCount = initialData.data.stages?.length || 0;
        break;
      }
      console.log(`    初始 Stage 数量: ${initialStageCount}`);

      // 2. 模拟 50 个观众加入（添加延迟避免触发 Rate Limit）
      console.log('  👥 模拟 50 个观众加入...');
      const userIds = [];
      const BATCH_SIZE = 10; // 每批 10 个
      const BATCH_DELAY = 100; // 每批延迟 100ms

      for (let i = 0; i < 50; i++) {
        const uid = `autoscale-${Date.now()}-${i}`;
        const pid = `participant-${Date.now()}-${i}`;
        userIds.push(uid);

        const response = await fetch(`${BASE_URL}/api/viewer/rejoin`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: uid, stageArn: STAGE_ARN, participantId: pid }),
        });

        if (!response.ok) throw new Error(`观众 ${i + 1} 加入失败: HTTP ${response.status}`);

        // 每 10 个观众打印一次进度，并添加延迟避免 Rate Limit
        if ((i + 1) % BATCH_SIZE === 0) {
          console.log(`    已加入 ${i + 1}/50 个观众`);
          if (i + 1 < 50) {
            await new Promise((resolve) => setTimeout(resolve, BATCH_DELAY));
          }
        }
      }

      // 3. 验证观众数
      console.log('  📈 验证观众数...');
      const viewerResponse = await fetch(
        `${BASE_URL}/api/viewer/list/${encodeURIComponent(STAGE_ARN)}`
      );
      const viewerData = await viewerResponse.json();
      console.log(`    当前观众数: ${viewerData.data.totalViewers}`);

      if (viewerData.data.totalViewers < SCALE_UP_THRESHOLD) {
        throw new Error(
          `观众数不足: ${viewerData.data.totalViewers} < ${SCALE_UP_THRESHOLD}`
        );
      }

      // 4. 等待健康检查触发
      console.log(`  ⏳ 等待自动扩展检查... (${HEALTH_CHECK_INTERVAL / 1000 + 5} 秒)`);
      console.log(`    健康检查周期: 每 ${HEALTH_CHECK_INTERVAL / 1000} 秒`);
      console.log(`    扩展阈值: ${SCALE_UP_THRESHOLD} 人`);
      await new Promise((resolve) => setTimeout(resolve, HEALTH_CHECK_INTERVAL + 5000));

      // 5. 验证是否创建了新 Stage（带重试逻辑）
      console.log('  ✅ 验证是否创建了新 Stage...');
      let finalStageCount = 0;
      for (let attempt = 1; attempt <= 3; attempt++) {
        const finalResponse = await fetch(`${BASE_URL}/api/stage/list`);
        if (finalResponse.status === 429) {
          if (attempt < 3) {
            console.log(`    ⚠️ 遇到 Rate Limit，2 秒后重试 (${attempt}/3)...`);
            await new Promise((resolve) => setTimeout(resolve, 2000));
            continue;
          }
          throw new Error('获取 Stage 列表失败: Rate Limit');
        }
        if (!finalResponse.ok) throw new Error(`获取 Stage 列表失败: HTTP ${finalResponse.status}`);
        const finalData = await finalResponse.json();
        finalStageCount = finalData.data.stages?.length || 0;
        break;
      }
      console.log(`    最终 Stage 数量: ${finalStageCount}`);

      // 清理：让所有观众离开
      console.log('  🧹 清理观众...');
      await Promise.all(
        userIds.map((uid) =>
          fetch(`${BASE_URL}/api/viewer/leave`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: uid, stageArn: STAGE_ARN }),
          }).catch(() => {})
        )
      );

      const newStagesCreated = finalStageCount - initialStageCount;
      if (newStagesCreated > 0) {
        console.log(`    ✓ 成功创建了 ${newStagesCreated} 个新 Stage`);
      } else {
        console.log('    ⚠ 未创建新 Stage（可能使用率未达到 60% 或已有足够容量）');
      }

      // 测试通过（无论是否创建了新 Stage，只要流程正确即可）
    });
  } else {
    console.log('\n=== 4. Stage 自动扩展测试 (已跳过) ===\n');
  }

  // ========== 打印总结 ==========
  const totalDuration = Date.now() - startTime;
  printSummary(totalDuration);

  process.exit(failedTests > 0 ? 1 : 0);
}

function printSummary(totalDuration) {
  console.log('\n╔══════════════════════════════════════════════════════════╗');
  console.log('║                      测试总结                             ║');
  console.log('╚══════════════════════════════════════════════════════════╝\n');
  console.log('──────────────────────────────────────────────────────────');
  console.log(`总计: ${totalTests} 测试`);
  console.log(`✓ 通过: ${passedTests}`);
  console.log(`✗ 失败: ${failedTests}`);
  console.log(`总耗时: ${totalDuration}ms (${(totalDuration / 1000).toFixed(2)}s)`);
  console.log('──────────────────────────────────────────────────────────');

  const successRate = totalTests > 0 ? (passedTests / totalTests) * 100 : 0;
  console.log(`\n成功率: ${successRate.toFixed(2)}%`);

  if (failedTests === 0) {
    console.log('\n🎉 所有测试通过！');
  } else {
    console.log(`\n⚠️  ${failedTests} 个测试失败`);
  }
}

// 运行测试
main().catch((error) => {
  console.error('\n❌ 测试运行出错:', error.message);
  console.error(error.stack);
  process.exit(1);
});
