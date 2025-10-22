#!/usr/bin/env ts-node
/**
 * 集成测试主入口
 * 运行所有测试套件并生成报告
 */

import * as dotenv from 'dotenv';
import { runEnvironmentTests } from './01-environment-test';
import { runRedisTests } from './02-redis-test';
import { runApiTests } from './03-api-test';
import { runStressTests } from './04-stress-test';
import { runAutoScalingTests } from './05-autoscaling-test';
import { TEST_CONFIG, TestResult, TestSuite } from './test-config';

// 加载环境变量
dotenv.config();

async function main() {
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║          AWS IVS 服务器集成测试套件                      ║');
  console.log('║          测试范围：Redis + API 端点                      ║');
  console.log('╚══════════════════════════════════════════════════════════╝');
  console.log();
  console.log('测试配置:');
  console.log(`  服务器: ${TEST_CONFIG.server.baseUrl}`);
  console.log(`  Redis: ${TEST_CONFIG.redis.host}:${TEST_CONFIG.redis.port}`);
  console.log(`  Stage ARN: ${TEST_CONFIG.testData.stageArn}`);
  console.log(`  跳过压力测试: ${TEST_CONFIG.options.skipStressTests}`);
  console.log();

  const allSuites: TestSuite[] = [];
  const startTime = Date.now();

  try {
    // 1. 环境检查测试
    const envResults = await runEnvironmentTests();
    allSuites.push(createSuite('环境检查测试', envResults));

    // 如果环境测试失败，停止后续测试
    const envFailed = envResults.some((r) => r.status === 'fail');
    if (envFailed) {
      console.log('\n⚠️  环境检查失败，跳过后续测试');
      printSummary(allSuites, Date.now() - startTime);
      process.exit(1);
    }

    // 2. Redis 服务测试
    const redisResults = await runRedisTests();
    allSuites.push(createSuite('Redis 服务测试', redisResults));

    // 3. API 端点测试
    const apiResults = await runApiTests();
    allSuites.push(createSuite('API 端点测试', apiResults));

    // 4. 压力测试（可选）
    const stressResults = await runStressTests();
    if (stressResults.length > 0) {
      allSuites.push(createSuite('压力测试', stressResults));
    }

    // 5. 自动扩展测试（可选）
    const autoScalingResults = await runAutoScalingTests();
    if (autoScalingResults.length > 0) {
      allSuites.push(createSuite('Stage 自动扩展测试', autoScalingResults));
    }

    // 打印总结
    const totalDuration = Date.now() - startTime;
    printSummary(allSuites, totalDuration);

    // 检查是否有失败的测试
    const hasFailures = allSuites.some((suite) => suite.failedTests > 0);
    process.exit(hasFailures ? 1 : 0);
  } catch (error: any) {
    console.error('\n❌ 测试运行出错:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

function createSuite(name: string, results: TestResult[]): TestSuite {
  const passedTests = results.filter((r) => r.status === 'pass').length;
  const failedTests = results.filter((r) => r.status === 'fail').length;
  const skippedTests = results.filter((r) => r.status === 'skip').length;
  const totalDuration = results.reduce((sum, r) => sum + r.duration, 0);

  return {
    name,
    results,
    totalTests: results.length,
    passedTests,
    failedTests,
    skippedTests,
    totalDuration,
  };
}

function printSummary(suites: TestSuite[], totalDuration: number) {
  console.log('\n╔══════════════════════════════════════════════════════════╗');
  console.log('║                      测试总结                             ║');
  console.log('╚══════════════════════════════════════════════════════════╝\n');

  let totalTests = 0;
  let totalPassed = 0;
  let totalFailed = 0;
  let totalSkipped = 0;

  for (const suite of suites) {
    totalTests += suite.totalTests;
    totalPassed += suite.passedTests;
    totalFailed += suite.failedTests;
    totalSkipped += suite.skippedTests;

    const status = suite.failedTests === 0 ? '✓' : '✗';
    const color = suite.failedTests === 0 ? '' : '';

    console.log(`${status} ${suite.name}`);
    console.log(
      `  通过: ${suite.passedTests}/${suite.totalTests}, 失败: ${suite.failedTests}, 跳过: ${suite.skippedTests}, 耗时: ${suite.totalDuration}ms`
    );

    // 打印失败的测试详情
    if (suite.failedTests > 0) {
      const failedResults = suite.results.filter((r) => r.status === 'fail');
      for (const result of failedResults) {
        console.log(`    ✗ ${result.name}`);
        console.log(`      错误: ${result.error}`);
      }
    }

    console.log();
  }

  console.log('──────────────────────────────────────────────────────────');
  console.log(`总计: ${totalTests} 测试`);
  console.log(`✓ 通过: ${totalPassed}`);
  console.log(`✗ 失败: ${totalFailed}`);
  console.log(`⊙ 跳过: ${totalSkipped}`);
  console.log(`总耗时: ${totalDuration}ms (${(totalDuration / 1000).toFixed(2)}s)`);
  console.log('──────────────────────────────────────────────────────────');

  const successRate = totalTests > 0 ? (totalPassed / totalTests) * 100 : 0;
  console.log(`\n成功率: ${successRate.toFixed(2)}%`);

  if (totalFailed === 0) {
    console.log('\n🎉 所有测试通过！');
  } else {
    console.log(`\n⚠️  ${totalFailed} 个测试失败`);
  }
}

// 运行测试
main();
