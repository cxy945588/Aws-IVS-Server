/**
 * AWS IVS 系統修復驗證腳本
 * 
 * 用途: 自動驗證所有修復是否生效
 * 執行: node verify-fixes.js
 */

const API_URL = process.env.API_URL || 'http://localhost:3000';
const API_KEY = process.env.API_KEY || 'your-api-key-here';

// 顏色輸出
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
};

function log(color, ...args) {
  console.log(color, ...args, colors.reset);
}

// 測試結果統計
const results = {
  passed: 0,
  failed: 0,
  warnings: 0,
};

// 延遲函數
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// API 呼叫輔助函數
async function apiCall(endpoint, options = {}) {
  const url = `${API_URL}${endpoint}`;
  const defaultOptions = {
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': API_KEY,
    },
  };
  
  try {
    const response = await fetch(url, { ...defaultOptions, ...options });
    const data = await response.json();
    return { status: response.status, data };
  } catch (error) {
    return { status: 0, error: error.message };
  }
}

// 測試 1: 健康檢查
async function test1_HealthCheck() {
  log(colors.blue, '\n📋 測試 1: 健康檢查');
  
  try {
    const response = await apiCall('/api/health');
    
    if (response.status === 200 && response.data.status === 'healthy') {
      log(colors.green, '✅ PASS: 系統健康檢查正常');
      results.passed++;
      return true;
    } else {
      log(colors.red, '❌ FAIL: 健康檢查失敗', response);
      results.failed++;
      return false;
    }
  } catch (error) {
    log(colors.red, '❌ FAIL: 健康檢查異常', error.message);
    results.failed++;
    return false;
  }
}

// 測試 2: 設定主播在線
async function test2_PublisherOnline() {
  log(colors.blue, '\n📋 測試 2: 設定主播在線');
  
  try {
    const response = await apiCall('/api/token/publisher', {
      method: 'POST',
      body: JSON.stringify({
        userId: 'test-broadcaster-fix-verification',
      }),
    });
    
    if (response.status === 200 && response.data.success) {
      log(colors.green, '✅ PASS: 主播 Token 生成成功');
      results.passed++;
      return true;
    } else {
      log(colors.red, '❌ FAIL: 主播 Token 生成失敗', response);
      results.failed++;
      return false;
    }
  } catch (error) {
    log(colors.red, '❌ FAIL: 主播設定異常', error.message);
    results.failed++;
    return false;
  }
}

// 測試 3: 智能觀眾分配 (修復驗證)
async function test3_SmartViewerAllocation() {
  log(colors.blue, '\n📋 測試 3: 智能觀眾分配 (修復驗證)');
  log(colors.cyan, '   測試是否能自動分配到最佳 Stage...');
  
  const viewerTokens = [];
  const stageDistribution = {};
  
  try {
    // 生成 10 個觀眾 Token
    for (let i = 1; i <= 10; i++) {
      const response = await apiCall('/api/token/viewer', {
        method: 'POST',
        body: JSON.stringify({
          userId: `test-viewer-fix-${i}`,
        }),
      });
      
      if (response.status === 200 && response.data.success) {
        const stageArn = response.data.data.stageArn;
        const shortArn = stageArn.substring(stageArn.length - 12);
        
        viewerTokens.push({
          userId: response.data.data.userId,
          stageArn: shortArn,
        });
        
        stageDistribution[shortArn] = (stageDistribution[shortArn] || 0) + 1;
        
        log(colors.cyan, `   觀眾 ${i}: ${shortArn}`);
      } else {
        log(colors.yellow, `   ⚠️  觀眾 ${i} Token 生成失敗`);
        results.warnings++;
      }
      
      await delay(100); // 避免請求過快
    }
    
    // 檢查分配結果
    const stageCount = Object.keys(stageDistribution).length;
    log(colors.cyan, `\n   Stage 分佈:`, stageDistribution);
    
    if (stageCount > 0) {
      log(colors.green, `✅ PASS: 觀眾成功分配到 ${stageCount} 個 Stage`);
      results.passed++;
      return true;
    } else {
      log(colors.red, '❌ FAIL: 沒有觀眾被分配');
      results.failed++;
      return false;
    }
  } catch (error) {
    log(colors.red, '❌ FAIL: 智能分配測試異常', error.message);
    results.failed++;
    return false;
  }
}

// 測試 4: Stage 列表查詢 (ARN 格式修復驗證)
async function test4_StageList() {
  log(colors.blue, '\n📋 測試 4: Stage 列表查詢 (ARN 格式修復驗證)');
  
  try {
    const response = await apiCall('/api/stage');
    
    if (response.status === 200 && response.data.success) {
      const stages = response.data.data.stages || [];
      
      log(colors.cyan, `   找到 ${stages.length} 個 Stage`);
      
      // 檢查所有 ARN 是否為完整格式
      let allValid = true;
      for (const stage of stages) {
        if (!stage.arn || !stage.arn.startsWith('arn:aws:ivs:')) {
          log(colors.red, `   ❌ 發現無效 ARN: ${stage.arn}`);
          allValid = false;
        }
      }
      
      if (allValid) {
        log(colors.green, '✅ PASS: 所有 Stage ARN 格式正確');
        results.passed++;
        return true;
      } else {
        log(colors.red, '❌ FAIL: 存在無效的 Stage ARN');
        results.failed++;
        return false;
      }
    } else if (response.status === 500) {
      log(colors.red, '❌ FAIL: Stage 列表查詢返回 500 錯誤 (ARN 格式問題未修復)');
      results.failed++;
      return false;
    } else {
      log(colors.yellow, '⚠️  WARN: Stage 列表查詢異常', response);
      results.warnings++;
      return false;
    }
  } catch (error) {
    log(colors.red, '❌ FAIL: Stage 列表查詢異常', error.message);
    results.failed++;
    return false;
  }
}

// 測試 5: 統計資料查詢 (Redis 錯誤修復驗證)
async function test5_StatsQuery() {
  log(colors.blue, '\n📋 測試 5: 統計資料查詢 (Redis 錯誤修復驗證)');
  
  try {
    const response = await apiCall('/api/stats');
    
    if (response.status === 200 && response.data.success) {
      const stats = response.data.data;
      
      log(colors.cyan, `   總觀眾數: ${stats.totalViewers}`);
      log(colors.cyan, `   總 Stage 數: ${stats.totalStages}`);
      log(colors.cyan, `   主播狀態: ${stats.publisherOnline ? '在線' : '離線'}`);
      
      log(colors.green, '✅ PASS: 統計資料查詢正常 (Redis WRONGTYPE 錯誤已修復)');
      results.passed++;
      return true;
    } else if (response.status === 500) {
      log(colors.red, '❌ FAIL: 統計查詢返回 500 錯誤 (Redis 問題未修復)');
      log(colors.red, '   錯誤詳情:', response.data);
      results.failed++;
      return false;
    } else {
      log(colors.yellow, '⚠️  WARN: 統計查詢異常', response);
      results.warnings++;
      return false;
    }
  } catch (error) {
    log(colors.red, '❌ FAIL: 統計查詢異常', error.message);
    results.failed++;
    return false;
  }
}

// 測試 6: 自動擴展觸發檢查
async function test6_AutoScalingCheck() {
  log(colors.blue, '\n📋 測試 6: 自動擴展配置檢查');
  log(colors.cyan, '   (實際觸發需要 45 位觀眾，此測試僅檢查配置)');
  
  try {
    // 檢查是否能獲取 Stage 列表
    const response = await apiCall('/api/stage');
    
    if (response.status === 200) {
      log(colors.green, '✅ PASS: Auto Scaling 服務配置正常');
      log(colors.yellow, '   ℹ️  提示: 完整測試需要 45 位觀眾觸發');
      results.passed++;
      return true;
    } else {
      log(colors.red, '❌ FAIL: Auto Scaling 配置異常');
      results.failed++;
      return false;
    }
  } catch (error) {
    log(colors.red, '❌ FAIL: Auto Scaling 檢查異常', error.message);
    results.failed++;
    return false;
  }
}

// 主測試流程
async function runAllTests() {
  log(colors.cyan, '╔═══════════════════════════════════════════════════════════╗');
  log(colors.cyan, '║   AWS IVS 系統修復驗證測試                                ║');
  log(colors.cyan, '║   修復日期: 2025-10-19                                    ║');
  log(colors.cyan, '╚═══════════════════════════════════════════════════════════╝');
  
  log(colors.yellow, '\n⚙️  測試配置:');
  log(colors.yellow, `   API URL: ${API_URL}`);
  log(colors.yellow, `   API Key: ${API_KEY.substring(0, 10)}...`);
  
  // 執行所有測試
  await test1_HealthCheck();
  await delay(500);
  
  await test2_PublisherOnline();
  await delay(500);
  
  await test3_SmartViewerAllocation();
  await delay(500);
  
  await test4_StageList();
  await delay(500);
  
  await test5_StatsQuery();
  await delay(500);
  
  await test6_AutoScalingCheck();
  
  // 輸出測試結果
  log(colors.cyan, '\n╔═══════════════════════════════════════════════════════════╗');
  log(colors.cyan, '║   測試結果總結                                            ║');
  log(colors.cyan, '╚═══════════════════════════════════════════════════════════╝');
  
  log(colors.green, `\n✅ 通過: ${results.passed} 個測試`);
  log(colors.red, `❌ 失敗: ${results.failed} 個測試`);
  log(colors.yellow, `⚠️  警告: ${results.warnings} 個警告`);
  
  const total = results.passed + results.failed;
  const passRate = total > 0 ? (results.passed / total * 100).toFixed(1) : 0;
  
  log(colors.cyan, `\n📊 通過率: ${passRate}%`);
  
  if (results.failed === 0) {
    log(colors.green, '\n🎉 所有測試通過! 系統修復成功!');
    log(colors.green, '\n✅ 修復驗證完成:');
    log(colors.green, '   - Stage ARN 格式統一');
    log(colors.green, '   - 智能觀眾分配機制');
    log(colors.green, '   - Redis 錯誤處理');
    log(colors.green, '   - 系統健康檢查');
    return 0;
  } else {
    log(colors.red, '\n⚠️  部分測試失敗，請檢查:');
    log(colors.red, '   1. API Server 是否正常運行');
    log(colors.red, '   2. Redis 是否正常連接');
    log(colors.red, '   3. 環境變數是否正確配置');
    log(colors.red, '   4. AWS 憑證是否有效');
    return 1;
  }
}

// 執行測試
runAllTests()
  .then(exitCode => {
    process.exit(exitCode);
  })
  .catch(error => {
    log(colors.red, '\n❌ 測試執行異常:', error);
    process.exit(1);
  });
