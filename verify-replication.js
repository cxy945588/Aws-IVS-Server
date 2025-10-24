/**
 * Participant Replication 驗證腳本
 *
 * 用途：檢查主播是否真的在推流，以及 Replication 是否正常工作
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
  console.log('\n' + '='.repeat(70));
  log(title, 'bright');
  console.log('='.repeat(70) + '\n');
}

/**
 * 步驟 1：檢查主播狀態
 */
async function checkPublisherStatus() {
  logSection('步驟 1：檢查主播狀態');

  try {
    const response = await request(`${API_BASE_URL}/api/stage/replication/publisher-info`);

    if (response.data.success && response.data.data.hasPublisher) {
      const info = response.data.data.publisherInfo;
      log('✅ 找到主播資訊', 'green');
      console.log('');
      console.log('📋 主播資訊：');
      console.log('  - Participant ID:', info.participantId);
      console.log('  - User ID:', info.userId);
      console.log('  - Stage ARN:', info.stageArn);
      console.log('  - 加入時間:', info.joinedAt);
      console.log('');

      log('⚠️ 注意：這只表示主播獲得了 Token，不代表正在推流', 'yellow');
      console.log('');

      return info;
    } else {
      log('❌ 沒有找到主播資訊', 'red');
      console.log('請先生成主播 Token：');
      console.log('  curl -X POST ' + API_BASE_URL + '/api/token/publisher \\');
      console.log('    -H "Content-Type: application/json" \\');
      console.log('    -d \'{"userId": "test-broadcaster"}\'');
      return null;
    }
  } catch (error) {
    log('❌ 查詢失敗: ' + error.message, 'red');
    return null;
  }
}

/**
 * 步驟 2：列出所有 Stage
 */
async function listAllStages() {
  logSection('步驟 2：列出所有 Stage');

  try {
    const response = await request(`${API_BASE_URL}/api/stage/list`);

    if (response.data.success) {
      const stages = response.data.data.stages;
      log(`✅ 找到 ${stages.length} 個 Stage`, 'green');
      console.log('');

      stages.forEach((stage, index) => {
        console.log(`${index + 1}. ${stage.name || 'unnamed'}`);
        console.log(`   ARN: ${stage.stageArn}`);
        console.log(`   觀眾數: ${stage.viewerCount}`);
        console.log(`   自動擴展: ${stage.autoScaled ? '是' : '否'}`);
        console.log('');
      });

      return stages;
    } else {
      log('❌ 查詢 Stage 列表失敗', 'red');
      return [];
    }
  } catch (error) {
    log('❌ 查詢失敗: ' + error.message, 'red');
    return [];
  }
}

/**
 * 步驟 3：檢查每個 Stage 的 Replication 狀態
 */
async function checkReplicationStatus(stages) {
  logSection('步驟 3：檢查 Replication 狀態');

  const results = [];

  for (const stage of stages) {
    try {
      const response = await request(
        `${API_BASE_URL}/api/stage/replication/status/${encodeURIComponent(stage.stageArn)}`
      );

      if (response.data.success) {
        const hasReplication = response.data.data.hasReplication;

        console.log(`📋 ${stage.name || 'unnamed'}`);
        console.log(`   ARN: ${stage.stageArn.substring(stage.stageArn.length - 20)}`);

        if (hasReplication) {
          log('   ✅ 有 Replication', 'green');
          const info = response.data.data.replicationInfo;
          console.log(`   - 來源 Stage: ${info.sourceStageArn.substring(info.sourceStageArn.length - 20)}`);
          console.log(`   - Participant ID: ${info.participantId}`);
          console.log(`   - 啟動時間: ${info.startedAt}`);
        } else {
          log('   ❌ 沒有 Replication', 'red');
        }
        console.log('');

        results.push({
          stage: stage.name,
          stageArn: stage.stageArn,
          hasReplication,
          replicationInfo: hasReplication ? response.data.data.replicationInfo : null,
        });
      }
    } catch (error) {
      log(`   ❌ 查詢失敗: ${error.message}`, 'red');
    }
  }

  return results;
}

/**
 * 步驟 4：提供診斷建議
 */
function provideDiagnostics(publisherInfo, stages, replicationResults) {
  logSection('步驟 4：診斷建議');

  // 檢查 1：主播是否存在
  if (!publisherInfo) {
    log('❌ 問題：沒有主播資訊', 'red');
    console.log('');
    console.log('解決方案：');
    console.log('1. 生成主播 Token：');
    console.log('   POST /api/token/publisher');
    console.log('');
    return;
  }

  log('✅ 主播資訊存在', 'green');
  console.log('');

  // 檢查 2：是否有多個 Stage
  if (stages.length <= 1) {
    log('⚠️ 只有一個 Stage，無法測試 Replication', 'yellow');
    console.log('');
    console.log('解決方案：');
    console.log('1. 手動創建新 Stage：');
    console.log('   POST /api/stage');
    console.log('   {"name": "test-stage-2"}');
    console.log('');
    console.log('2. 或等待自動擴展創建新 Stage（需要 45+ 觀眾）');
    console.log('');
    return;
  }

  log(`✅ 有 ${stages.length} 個 Stage`, 'green');
  console.log('');

  // 檢查 3：Replication 狀態
  const stagesWithReplication = replicationResults.filter(r => r.hasReplication);

  if (stagesWithReplication.length === 0) {
    log('❌ 問題：所有 Stage 都沒有啟動 Replication', 'red');
    console.log('');
    console.log('可能原因：');
    console.log('1. 主播還沒有開始推流（最常見）');
    console.log('   - Token 生成 ≠ 推流開始');
    console.log('   - 必須在 OBS 中點擊「開始串流」');
    console.log('');
    console.log('2. AWS SDK 版本太舊');
    console.log('   - 需要 @aws-sdk/client-ivs-realtime >= 3.600.0');
    console.log('   - 運行: cd api-server && npm install @aws-sdk/client-ivs-realtime@latest');
    console.log('');
    console.log('3. Replication API 調用失敗');
    console.log('   - 檢查 API 日誌：查找 "Participant Replication" 相關錯誤');
    console.log('');
    console.log('解決步驟：');
    console.log('1. 確認主播正在推流（檢查 OBS 串流狀態）');
    console.log('2. 如果推流正常，手動啟動 Replication：');
    console.log('   POST /api/stage/replication/start');
    console.log('   {');
    console.log(`     "sourceStageArn": "${publisherInfo.stageArn}",`);
    console.log(`     "destinationStageArn": "<新 Stage ARN>",`);
    console.log(`     "participantId": "${publisherInfo.participantId}"`);
    console.log('   }');
    console.log('');
  } else {
    log(`✅ 有 ${stagesWithReplication.length} 個 Stage 啟動了 Replication`, 'green');
    console.log('');
    console.log('下一步驗證：');
    console.log('1. 進入 AWS IVS 控制台');
    console.log('2. 查看目標 Stage 的參與者列表');
    console.log('3. 應該能看到主播的 Participant（replicated）');
    console.log('');
    console.log('如果控制台顯示 "no publishers"：');
    console.log('- 可能是 Replication 剛啟動，需要幾秒鐘');
    console.log('- 或者主播停止推流了');
    console.log('- 檢查主播在來源 Stage 是否還在 publishing 狀態');
    console.log('');
  }
}

/**
 * 主函數
 */
async function main() {
  log('\n🔍 Participant Replication 驗證工具', 'cyan');
  log(`API 地址: ${API_BASE_URL}`, 'cyan');

  // 步驟 1：檢查主播
  const publisherInfo = await checkPublisherStatus();

  // 步驟 2：列出 Stage
  const stages = await listAllStages();

  // 步驟 3：檢查 Replication
  const replicationResults = await checkReplicationStatus(stages);

  // 步驟 4：診斷
  provideDiagnostics(publisherInfo, stages, replicationResults);

  logSection('總結');
  console.log('✅ 驗證完成');
  console.log('');
  console.log('💡 關鍵點：');
  console.log('1. Participant Replication 要求主播「正在推流」（publishing）');
  console.log('2. 獲得 Token ≠ 推流開始');
  console.log('3. 必須在 OBS 中點擊「開始串流」才算推流');
  console.log('4. 推流狀態可以在 AWS IVS 控制台的來源 Stage 中確認');
  console.log('');
}

// 執行
if (require.main === module) {
  main()
    .then(() => {
      process.exit(0);
    })
    .catch((error) => {
      log('\n❌ 驗證失敗: ' + error.message, 'red');
      console.error(error);
      process.exit(1);
    });
}

module.exports = { main };
