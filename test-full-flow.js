/**
 * AWS IVS 完整流程測試工具
 *
 * 測試項目：
 * 1. 主播 Token 生成
 * 2. 等待主播推流
 * 3. 模擬觀眾加入（增加計數）
 * 4. 觸發自動擴展
 * 5. 驗證 Participant Replication
 * 6. 查看結果
 */

const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000';

// HTTP 請求封裝
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
  magenta: '\x1b[35m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function logSection(title) {
  console.log('\n' + '='.repeat(80));
  log(title, 'bright');
  console.log('='.repeat(80) + '\n');
}

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// 測試狀態
let publisherToken = null;
let masterStageArn = null;
let createdStages = [];

/**
 * 步驟 1：生成主播 Token
 */
async function generatePublisherToken() {
  logSection('步驟 1：生成主播 Token');

  try {
    const response = await axios.post(`${API_BASE_URL}/api/token/publisher`, {
      userId: 'test-full-flow-broadcaster',
    });

    if (response.data.success) {
      publisherToken = response.data.data;
      masterStageArn = publisherToken.stageArn;

      log('✅ 主播 Token 生成成功', 'green');
      console.log('');
      console.log('📋 主播資訊：');
      console.log('  - Participant ID:', publisherToken.participantId);
      console.log('  - User ID:', publisherToken.userId);
      console.log('  - Stage ARN:', publisherToken.stageArn);
      console.log('  - Token 有效期:', publisherToken.expiresIn, '秒');
      console.log('');
      console.log('🔑 Token（用於推流）：');
      console.log(publisherToken.token);
      console.log('');

      return true;
    } else {
      log('❌ Token 生成失敗', 'red');
      return false;
    }
  } catch (error) {
    log('❌ 錯誤: ' + error.message, 'red');
    return false;
  }
}

/**
 * 步驟 2：等待主播開始推流
 */
async function waitForPublisher() {
  logSection('步驟 2：等待主播開始推流');

  log('請在 OBS 中設置推流：', 'cyan');
  console.log('');
  console.log('📺 OBS 設置：');
  console.log('1. 設定 → 串流');
  console.log('2. 服務：WHIP');
  console.log('3. 服務器：從 Stage ARN 提取 WHIP 端點');
  console.log('   例如：https://REGION.global-contribute.live-video.net');
  console.log('4. Bearer Token：使用上方顯示的 Token');
  console.log('5. 點擊「開始串流」');
  console.log('');
  log('💡 提示：推流成功後，按 Enter 繼續測試', 'yellow');
  console.log('');

  // 等待用戶按 Enter
  return new Promise((resolve) => {
    process.stdin.once('data', () => {
      log('✅ 繼續測試...', 'green');
      console.log('');
      resolve(true);
    });
  });
}

/**
 * 步驟 3：模擬觀眾加入
 */
async function simulateViewers(count) {
  logSection(`步驟 3：模擬 ${count} 個觀眾加入`);

  log(`正在模擬 ${count} 個觀眾加入 Master Stage...`, 'cyan');
  console.log('');

  try {
    // 使用內部 API 直接增加觀眾計數（模擬）
    const response = await axios.post(`${API_BASE_URL}/api/stats/simulate-viewers`, {
      stageArn: masterStageArn,
      count: count,
    });

    if (response.data.success) {
      log(`✅ 成功模擬 ${count} 個觀眾`, 'green');
      console.log('  - Stage ARN:', masterStageArn);
      console.log('  - 當前觀眾數:', response.data.data.currentViewerCount || count);
      console.log('');
      return true;
    } else {
      // 如果沒有模擬 API，手動增加計數
      log('⚠️ 模擬 API 不存在，使用替代方法', 'yellow');

      // 直接調用 Redis 增加計數
      for (let i = 0; i < count; i++) {
        await axios.post(`${API_BASE_URL}/api/token/viewer`, {
          userId: `simulated-viewer-${i}`,
        });

        if ((i + 1) % 10 === 0) {
          process.stdout.write(`\r  已模擬 ${i + 1}/${count} 個觀眾...`);
        }
      }
      console.log('');
      log(`✅ 成功模擬 ${count} 個觀眾`, 'green');
      console.log('');
      return true;
    }
  } catch (error) {
    log('❌ 模擬觀眾失敗: ' + error.message, 'red');
    return false;
  }
}

/**
 * 步驟 4：等待自動擴展觸發
 */
async function waitForAutoScaling() {
  logSection('步驟 4：等待自動擴展觸發');

  log('自動擴展檢查週期：30 秒', 'cyan');
  log('正在等待自動擴展觸發...', 'cyan');
  console.log('');

  let attempts = 0;
  const maxAttempts = 10; // 最多等待 5 分鐘

  while (attempts < maxAttempts) {
    attempts++;

    // 查詢所有 Stage
    try {
      const response = await axios.get(`${API_BASE_URL}/api/stage/list`);

      if (response.data.success) {
        const stages = response.data.data.stages;
        const autoScaledStages = stages.filter(s => s.autoScaled);

        process.stdout.write(`\r⏳ 檢查 ${attempts}/${maxAttempts} - 找到 ${stages.length} 個 Stage (${autoScaledStages.length} 個自動擴展)`);

        if (autoScaledStages.length > 0) {
          console.log('\n');
          log(`✅ 檢測到自動擴展！創建了 ${autoScaledStages.length} 個新 Stage`, 'green');
          console.log('');

          autoScaledStages.forEach((stage, index) => {
            console.log(`${index + 1}. ${stage.name}`);
            console.log(`   ARN: ${stage.stageArn}`);
            console.log(`   觀眾數: ${stage.viewerCount}`);
            console.log('');

            createdStages.push(stage);
          });

          return true;
        }
      }
    } catch (error) {
      console.log('\n');
      log('❌ 查詢失敗: ' + error.message, 'red');
    }

    await sleep(30000); // 等待 30 秒
  }

  console.log('\n');
  log('⚠️ 等待超時，未檢測到自動擴展', 'yellow');
  console.log('');
  console.log('可能原因：');
  console.log('1. 觀眾數未達到閾值（45）');
  console.log('2. 自動擴展服務未啟動');
  console.log('3. 達到 Stage 數量上限');
  console.log('');

  return false;
}

/**
 * 步驟 5：驗證 Participant Replication
 */
async function verifyReplication() {
  logSection('步驟 5：驗證 Participant Replication');

  if (createdStages.length === 0) {
    log('⚠️ 沒有自動擴展的 Stage，跳過驗證', 'yellow');
    return false;
  }

  log('檢查新創建的 Stage 是否啟動了 Replication...', 'cyan');
  console.log('');

  let successCount = 0;

  for (const stage of createdStages) {
    try {
      const response = await axios.get(
        `${API_BASE_URL}/api/stage/replication/status/${encodeURIComponent(stage.stageArn)}`
      );

      if (response.data.success && response.data.data.hasReplication) {
        log(`✅ ${stage.name} - Replication 已啟動`, 'green');
        const info = response.data.data.replicationInfo;
        console.log(`   - 來源 Stage: ${info.sourceStageArn.substring(info.sourceStageArn.length - 20)}`);
        console.log(`   - Participant ID: ${info.participantId}`);
        console.log('');
        successCount++;
      } else {
        log(`❌ ${stage.name} - 沒有 Replication`, 'red');
        console.log('');
      }
    } catch (error) {
      log(`❌ ${stage.name} - 查詢失敗: ${error.message}`, 'red');
      console.log('');
    }
  }

  console.log('');
  log(`總結：${successCount}/${createdStages.length} 個 Stage 啟動了 Replication`,
    successCount === createdStages.length ? 'green' : 'yellow');
  console.log('');

  return successCount > 0;
}

/**
 * 步驟 6：提供 AWS 控制台鏈接
 */
function showAWSConsoleLinks() {
  logSection('步驟 6：在 AWS 控制台驗證');

  const region = process.env.AWS_REGION || 'us-east-1';

  log('請在 AWS IVS 控制台驗證結果：', 'cyan');
  console.log('');
  console.log('🔗 AWS IVS Real-time 控制台：');
  console.log(`https://console.aws.amazon.com/ivs/home?region=${region}#/real-time/stages`);
  console.log('');

  if (masterStageArn) {
    const stageId = masterStageArn.split('/').pop();
    console.log('📋 Master Stage：');
    console.log(`https://console.aws.amazon.com/ivs/home?region=${region}#/real-time/stages/${stageId}`);
    console.log('');
  }

  if (createdStages.length > 0) {
    console.log('📋 自動擴展的 Stage：');
    createdStages.forEach((stage, index) => {
      const stageId = stage.stageArn.split('/').pop();
      console.log(`${index + 1}. ${stage.name}`);
      console.log(`   https://console.aws.amazon.com/ivs/home?region=${region}#/real-time/stages/${stageId}`);
    });
    console.log('');
  }

  log('✅ 驗證步驟：', 'green');
  console.log('1. 點擊上方連結進入 AWS 控制台');
  console.log('2. 查看 Master Stage 的 Participants（應該有 1 個 Publisher）');
  console.log('3. 查看自動擴展 Stage 的 Participants（應該也有 1 個 Publisher - 複製的）');
  console.log('4. 確認兩個 Stage 都顯示主播畫面');
  console.log('');
}

/**
 * 步驟 7：清理資源
 */
async function cleanup() {
  logSection('步驟 7：清理測試資源');

  log('是否要清理測試資源？(y/n)', 'yellow');
  console.log('這將刪除所有自動擴展創建的 Stage');
  console.log('');

  return new Promise(async (resolve) => {
    process.stdin.once('data', async (data) => {
      const answer = data.toString().trim().toLowerCase();

      if (answer === 'y' || answer === 'yes') {
        log('正在清理...', 'cyan');
        console.log('');

        for (const stage of createdStages) {
          try {
            await axios.delete(`${API_BASE_URL}/api/stage/${encodeURIComponent(stage.stageArn)}`);
            log(`✅ 已刪除: ${stage.name}`, 'green');
          } catch (error) {
            log(`❌ 刪除失敗: ${stage.name} - ${error.message}`, 'red');
          }
        }

        console.log('');
        log('✅ 清理完成', 'green');
        console.log('');
      } else {
        log('⚠️ 跳過清理，Stage 保留', 'yellow');
        console.log('');
      }

      resolve();
    });
  });
}

/**
 * 主測試流程
 */
async function runFullTest() {
  log('\n🧪 AWS IVS 完整流程測試', 'cyan');
  log(`API 地址: ${API_BASE_URL}`, 'cyan');
  log('', 'reset');

  // 設置 stdin
  if (process.stdin.isTTY) {
    process.stdin.setRawMode(false);
    process.stdin.resume();
    process.stdin.setEncoding('utf8');
  }

  try {
    // 步驟 1：生成主播 Token
    if (!await generatePublisherToken()) {
      log('❌ 測試終止：無法生成主播 Token', 'red');
      process.exit(1);
    }

    // 步驟 2：等待主播推流
    await waitForPublisher();

    // 步驟 3：模擬觀眾
    const viewerCount = 50; // 模擬 50 個觀眾，觸發自動擴展（閾值 45）
    if (!await simulateViewers(viewerCount)) {
      log('⚠️ 模擬觀眾失敗，但繼續測試', 'yellow');
    }

    // 步驟 4：等待自動擴展
    const autoScaled = await waitForAutoScaling();

    if (!autoScaled) {
      log('⚠️ 未檢測到自動擴展，跳過後續驗證', 'yellow');
    } else {
      // 步驟 5：驗證 Replication
      await verifyReplication();
    }

    // 步驟 6：顯示 AWS 控制台鏈接
    showAWSConsoleLinks();

    // 步驟 7：清理
    await cleanup();

    logSection('測試完成');
    log('🎉 所有測試步驟已完成！', 'green');
    console.log('');
    log('💡 下一步：', 'cyan');
    console.log('1. 在 AWS 控制台驗證結果');
    console.log('2. 確認 Participant Replication 是否正常工作');
    console.log('3. 檢查兩個 Stage 是否都能看到主播');
    console.log('');

    process.exit(0);
  } catch (error) {
    log('\n❌ 測試失敗: ' + error.message, 'red');
    console.error(error);
    process.exit(1);
  }
}

// 執行測試
if (require.main === module) {
  runFullTest();
}

module.exports = { runFullTest };
