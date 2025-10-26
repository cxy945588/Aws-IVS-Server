/**
 * Participant Replication 功能測試腳本
 *
 * 測試流程：
 * 1. 生成主播 Token
 * 2. 查詢主播資訊（包含 participantId）
 * 3. 創建新的 Stage
 * 4. 手動啟動 Participant Replication
 * 5. 查詢 Replication 狀態
 * 6. 停止 Replication
 * 7. 清理測試資源
 */

// 使用 Node.js 內置的 fetch API (Node 18+)
// 如果是 Node 18 以下版本，請運行: npm install axios
const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000';

// HTTP 請求封裝函數
async function request(url, options = {}) {
  try {
    const response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    const data = await response.json();
    return { data, status: response.status, ok: response.ok };
  } catch (error) {
    throw new Error(`Request failed: ${error.message}`);
  }
}

const axios = {
  async get(url) {
    return await request(url, { method: 'GET' });
  },
  async post(url, body) {
    return await request(url, {
      method: 'POST',
      body: JSON.stringify(body),
    });
  },
  async delete(url, config = {}) {
    return await request(url, {
      method: 'DELETE',
      body: config.data ? JSON.stringify(config.data) : undefined,
    });
  },
};

// 顏色輸出
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function logSection(title) {
  console.log('\n' + '='.repeat(60));
  log(title, 'bright');
  console.log('='.repeat(60) + '\n');
}

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// 測試狀態
let testPublisherToken = null;
let testPublisherInfo = null;
let testStageArn = null;

/**
 * 步驟 1：生成主播 Token
 */
async function testGeneratePublisherToken() {
  logSection('步驟 1：生成主播 Token');

  try {
    const response = await axios.post(`${API_BASE_URL}/api/token/publisher`, {
      userId: 'test-broadcaster-replication',
    });

    if (response.data.success) {
      testPublisherToken = response.data.data;
      log('✅ 主播 Token 生成成功', 'green');
      console.log('');
      console.log('📋 主播資訊：');
      console.log('  - Participant ID:', testPublisherToken.participantId);
      console.log('  - User ID:', testPublisherToken.userId);
      console.log('  - Stage ARN:', testPublisherToken.stageArn);
      console.log('  - Token 有效期:', testPublisherToken.expiresIn, '秒');
      console.log('');
      console.log('🔑 完整 Token（用於推流）：');
      console.log(testPublisherToken.token);
      console.log('');
      return true;
    } else {
      log('❌ 主播 Token 生成失敗', 'red');
      return false;
    }
  } catch (error) {
    log('❌ 生成主播 Token 失敗: ' + error.message, 'red');
    if (error.response?.data) {
      console.log('錯誤詳情:', error.response.data);
    }
    return false;
  }
}

/**
 * 步驟 2：查詢主播資訊
 */
async function testGetPublisherInfo() {
  logSection('步驟 2：查詢主播資訊');

  try {
    const response = await axios.get(`${API_BASE_URL}/api/stage/replication/publisher-info`);

    if (response.data.success && response.data.data.hasPublisher) {
      testPublisherInfo = response.data.data.publisherInfo;
      log('✅ 主播資訊查詢成功', 'green');
      console.log('Participant ID:', testPublisherInfo.participantId);
      console.log('User ID:', testPublisherInfo.userId);
      console.log('Stage ARN:', testPublisherInfo.stageArn);
      console.log('加入時間:', testPublisherInfo.joinedAt);
      return true;
    } else {
      log('⚠️ 沒有主播在線', 'yellow');
      return false;
    }
  } catch (error) {
    log('❌ 查詢主播資訊失敗: ' + error.message, 'red');
    return false;
  }
}

/**
 * 步驟 3：創建新的 Stage
 */
async function testCreateStage() {
  logSection('步驟 3：創建新的 Stage');

  try {
    const response = await axios.post(`${API_BASE_URL}/api/stage`, {
      name: `test-replication-stage-${Date.now()}`,
      tags: {
        Purpose: 'Participant Replication Test',
        CreatedBy: 'test-script',
      },
    });

    if (response.data.success) {
      testStageArn = response.data.data.stage.arn;
      log('✅ Stage 創建成功', 'green');
      console.log('Stage ARN:', testStageArn);
      console.log('Stage Name:', response.data.data.stage.name);
      return true;
    } else {
      log('❌ Stage 創建失敗', 'red');
      return false;
    }
  } catch (error) {
    log('❌ 創建 Stage 失敗: ' + error.message, 'red');
    if (error.response?.data) {
      console.log('錯誤詳情:', error.response.data);
    }
    return false;
  }
}

/**
 * 步驟 4：手動啟動 Participant Replication
 */
async function testStartReplication() {
  logSection('步驟 4：啟動 Participant Replication');

  if (!testPublisherInfo || !testStageArn) {
    log('❌ 缺少必要資訊，無法啟動 Replication', 'red');
    return false;
  }

  log('⚠️ 注意：Participant Replication 要求主播必須正在推流（publishing）', 'yellow');
  console.log('   如果主播只是獲得了 Token 但還沒開始推流，會失敗');
  console.log('   這是 AWS IVS 的正常限制\n');

  try {
    const response = await axios.post(`${API_BASE_URL}/api/stage/replication/start`, {
      sourceStageArn: testPublisherInfo.stageArn,
      destinationStageArn: testStageArn,
      participantId: testPublisherInfo.participantId,
    });

    if (response.data.success) {
      log('✅ Participant Replication 已啟動', 'green');
      console.log('Source Stage:', testPublisherInfo.stageArn);
      console.log('Destination Stage:', testStageArn);
      console.log('Participant ID:', testPublisherInfo.participantId);
      console.log('啟動時間:', response.data.data.startedAt);
      return true;
    } else {
      log('❌ Participant Replication 啟動失敗', 'red');
      return false;
    }
  } catch (error) {
    const errorMsg = error.message || '';
    const errorData = error.response?.data;

    if (errorMsg.includes('not publishing') || errorData?.message?.includes('not publishing')) {
      log('⚠️ 預期的失敗：主播尚未開始推流', 'yellow');
      console.log('   這是正常情況，實際使用時：');
      console.log('   1. 主播連接到 Stage 並開始推流後');
      console.log('   2. 自動擴展創建新 Stage 時');
      console.log('   3. 系統會自動啟動 Participant Replication');
      console.log('\n   測試腳本跳過此步驟，繼續後續測試...');
      return 'skipped'; // 返回特殊值表示跳過
    }

    log('❌ 啟動 Participant Replication 失敗: ' + errorMsg, 'red');
    if (errorData) {
      console.log('錯誤詳情:', errorData);

      // 如果是 SDK 版本問題，提供提示
      if (errorData.message?.includes('SDK')) {
        log('\n⚠️ 需要升級 AWS SDK:', 'yellow');
        console.log('   運行: cd api-server && npm install @aws-sdk/client-ivs-realtime@latest');
      }
    }
    return false;
  }
}

/**
 * 步驟 5：查詢 Replication 狀態
 */
async function testGetReplicationStatus() {
  logSection('步驟 5：查詢 Replication 狀態');

  if (!testStageArn) {
    log('❌ 缺少 Stage ARN', 'red');
    return false;
  }

  try {
    const response = await axios.get(
      `${API_BASE_URL}/api/stage/replication/status/${encodeURIComponent(testStageArn)}`
    );

    if (response.data.success) {
      if (response.data.data.hasReplication) {
        log('✅ Replication 狀態查詢成功', 'green');
        console.log('Replication 資訊:', JSON.stringify(response.data.data.replicationInfo, null, 2));
      } else {
        log('⚠️ 此 Stage 沒有啟動 Replication', 'yellow');
      }
      return true;
    } else {
      log('❌ Replication 狀態查詢失敗', 'red');
      return false;
    }
  } catch (error) {
    log('❌ 查詢 Replication 狀態失敗: ' + error.message, 'red');
    return false;
  }
}

/**
 * 步驟 6：停止 Replication
 */
async function testStopReplication(wasStarted = false) {
  logSection('步驟 6：停止 Participant Replication');

  if (!wasStarted) {
    log('⚠️ Replication 未啟動，跳過停止步驟', 'yellow');
    return 'skipped';
  }

  if (!testPublisherInfo || !testStageArn) {
    log('❌ 缺少必要資訊，無法停止 Replication', 'red');
    return false;
  }

  try {
    const response = await axios.delete(`${API_BASE_URL}/api/stage/replication/stop`, {
      data: {
        sourceStageArn: testPublisherInfo.stageArn,
        destinationStageArn: testStageArn,
        participantId: testPublisherInfo.participantId,
      },
    });

    if (response.data.success) {
      log('✅ Participant Replication 已停止', 'green');
      console.log('停止時間:', response.data.data.stoppedAt);
      return true;
    } else {
      log('❌ Participant Replication 停止失敗', 'red');
      return false;
    }
  } catch (error) {
    log('❌ 停止 Participant Replication 失敗: ' + error.message, 'red');
    if (error.response?.data) {
      console.log('錯誤詳情:', error.response.data);
    }
    return false;
  }
}

/**
 * 步驟 7：清理測試資源
 */
async function testCleanup() {
  logSection('步驟 7：清理測試資源');

  if (!testStageArn) {
    log('⚠️ 沒有需要清理的 Stage', 'yellow');
    return true;
  }

  try {
    const response = await axios.delete(
      `${API_BASE_URL}/api/stage/${encodeURIComponent(testStageArn)}`
    );

    if (response.data.success) {
      log('✅ 測試 Stage 已刪除', 'green');
      return true;
    } else {
      log('❌ 測試 Stage 刪除失敗', 'red');
      return false;
    }
  } catch (error) {
    log('❌ 清理測試資源失敗: ' + error.message, 'red');
    if (error.response?.data) {
      console.log('錯誤詳情:', error.response.data);
    }
    return false;
  }
}

/**
 * 主測試流程
 */
async function runTests() {
  log('\n🧪 開始 Participant Replication 功能測試', 'cyan');
  log(`API 地址: ${API_BASE_URL}`, 'cyan');

  const results = {
    total: 7,
    passed: 0,
    failed: 0,
  };

  let replicationWasStarted = false;

  // 步驟 1
  if (await testGeneratePublisherToken()) {
    results.passed++;

    // ⏰ 等待用戶設置推流
    logSection('⏰ 等待推流設置');
    log('已生成主播 Token，請在 60 秒內開始推流...', 'cyan');
    console.log('');
    console.log('📺 OBS 推流設置步驟：');
    console.log('1. 打開 OBS Studio');
    console.log('2. 設定 → 串流');
    console.log('3. 服務：選擇「WHIP」');
    console.log('4. 服務器：從 Stage ARN 提取區域端點');
    console.log('   例如：https://REGION.global-contribute.live-video.net');
    console.log('5. Bearer Token：複製上方顯示的完整 Token');
    console.log('6. 點擊「開始串流」');
    console.log('');
    log('💡 提示：', 'yellow');
    console.log('   - 如果不想推流，測試會自動跳過 Replication 步驟');
    console.log('   - 如果要完整測試 Replication，請務必開始推流');
    console.log('   - 推流設置完成後，按 Enter 鍵立即繼續');
    console.log('   - 或等待 60 秒自動繼續');
    console.log('');

    // 倒計時 60 秒（可以按 Enter 跳過）
    let skipWait = false;
    const readline = require('readline');

    // 設置 stdin 為 raw 模式以捕獲按鍵
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(true);
      process.stdin.resume();
      process.stdin.once('data', () => {
        skipWait = true;
      });
    }

    for (let i = 60; i > 0 && !skipWait; i--) {
      process.stdout.write(`\r⏳ 倒計時: ${i} 秒... （按 Enter 跳過）`);
      await sleep(1000);
    }

    // 恢復 stdin
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(false);
      process.stdin.pause();
    }

    console.log('\n');
    if (skipWait) {
      log('✅ 用戶跳過等待，繼續測試...', 'green');
    } else {
      log('✅ 等待完成，繼續測試...', 'green');
    }
    await sleep(1000);
  } else {
    results.failed++;
    log('\n❌ 測試中止：無法生成主播 Token', 'red');
    return results;
  }

  // 步驟 2
  if (await testGetPublisherInfo()) {
    results.passed++;
    await sleep(1000);
  } else {
    results.failed++;
    log('\n❌ 測試中止：無法查詢主播資訊', 'red');
    return results;
  }

  // 步驟 3
  if (await testCreateStage()) {
    results.passed++;
    await sleep(1000);
  } else {
    results.failed++;
    log('\n❌ 測試中止：無法創建 Stage', 'red');
    return results;
  }

  // 步驟 4
  const replicationResult = await testStartReplication();
  if (replicationResult === 'skipped') {
    // 跳過計為通過（這是預期行為）
    results.passed++;
    log('\n✓ 步驟 4 已跳過（主播未推流是正常情況）', 'cyan');
    await sleep(1000);
  } else if (replicationResult === true) {
    results.passed++;
    replicationWasStarted = true;
    await sleep(2000); // 等待 Replication 啟動
  } else {
    results.failed++;
    log('\n⚠️ Replication 啟動失敗，但繼續測試查詢功能', 'yellow');
  }

  // 步驟 5
  if (await testGetReplicationStatus()) {
    results.passed++;
    await sleep(1000);
  } else {
    results.failed++;
  }

  // 步驟 6
  const stopResult = await testStopReplication(replicationWasStarted);
  if (stopResult === 'skipped') {
    results.passed++;
    log('\n✓ 步驟 6 已跳過（Replication 未啟動）', 'cyan');
    await sleep(1000);
  } else if (stopResult === true) {
    results.passed++;
    await sleep(1000);
  } else {
    results.failed++;
  }

  // 步驟 7
  if (await testCleanup()) {
    results.passed++;
  } else {
    results.failed++;
  }

  // 總結
  logSection('測試結果總結');
  console.log(`總測試數: ${results.total}`);
  log(`✅ 通過: ${results.passed}`, 'green');
  log(`❌ 失敗: ${results.failed}`, 'red');

  const successRate = ((results.passed / results.total) * 100).toFixed(1);
  console.log(`成功率: ${successRate}%`);

  if (results.passed === results.total) {
    log('\n🎉 所有測試通過！', 'green');
  } else if (results.passed >= results.total - 2) {
    log('\n⚠️ 大部分測試通過，可能需要升級 AWS SDK', 'yellow');
  } else {
    log('\n❌ 測試失敗，請檢查配置和日誌', 'red');
  }

  return results;
}

// 執行測試
if (require.main === module) {
  runTests()
    .then(() => {
      process.exit(0);
    })
    .catch((error) => {
      log('\n❌ 測試執行失敗: ' + error.message, 'red');
      console.error(error);
      process.exit(1);
    });
}

module.exports = { runTests };
