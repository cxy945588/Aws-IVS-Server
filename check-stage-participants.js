/**
 * AWS IVS Stage Participants 檢查工具
 *
 * 直接使用 AWS SDK 查詢 Stage 的所有參與者
 * 用於診斷主播是否真的在推流，以及 Replication 是否正常工作
 */

require('dotenv').config();

const {
  IVSRealTimeClient,
  ListParticipantsCommand,
} = require('@aws-sdk/client-ivs-realtime');

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
 * 初始化 AWS IVS 客戶端
 */
function createIVSClient() {
  const region = process.env.AWS_REGION || 'us-east-1';
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;

  if (!accessKeyId || !secretAccessKey) {
    throw new Error('缺少 AWS 憑證。請設置 AWS_ACCESS_KEY_ID 和 AWS_SECRET_ACCESS_KEY 環境變數');
  }

  return new IVSRealTimeClient({
    region,
    credentials: {
      accessKeyId,
      secretAccessKey,
    },
  });
}

/**
 * 列出 Stage 的所有參與者
 */
async function listStageParticipants(client, stageArn) {
  try {
    const command = new ListParticipantsCommand({
      stageArn,
      maxResults: 50,
    });

    const response = await client.send(command);

    return response.participants || [];
  } catch (error) {
    throw new Error(`查詢失敗: ${error.message}`);
  }
}

/**
 * 分析參與者資訊
 */
function analyzeParticipants(participants, stageName) {
  console.log(`📋 Stage: ${stageName}`);
  console.log(`   參與者數量: ${participants.length}`);
  console.log('');

  if (participants.length === 0) {
    log('   ❌ 沒有參與者', 'red');
    console.log('');
    console.log('   可能原因：');
    console.log('   1. 主播還沒有連接到這個 Stage');
    console.log('   2. 主播已斷線');
    console.log('   3. Participant Replication 沒有成功');
    console.log('');
    return {
      totalParticipants: 0,
      publishers: 0,
      subscribers: 0,
      replicated: 0,
    };
  }

  let publishers = 0;
  let subscribers = 0;
  let replicated = 0;

  participants.forEach((participant, index) => {
    console.log(`   ${index + 1}. Participant ID: ${participant.participantId}`);
    console.log(`      User ID: ${participant.userId || 'N/A'}`);
    console.log(`      狀態: ${participant.state}`);
    console.log(`      發布: ${participant.published ? '是' : '否'}`);

    if (participant.published) {
      publishers++;
    } else {
      subscribers++;
    }

    // 檢查是否為複製的參與者
    if (participant.userId?.includes('replica') || participant.attributes?.replicated === 'true') {
      log(`      ✅ 這是複製的參與者（Replicated）`, 'green');
      replicated++;
    }

    if (participant.attributes) {
      console.log(`      屬性:`, JSON.stringify(participant.attributes));
    }

    console.log('');
  });

  const stats = {
    totalParticipants: participants.length,
    publishers,
    subscribers,
    replicated,
  };

  // 總結
  console.log('   📊 統計：');
  console.log(`      總參與者: ${stats.totalParticipants}`);
  console.log(`      發布者（主播）: ${stats.publishers}`);
  console.log(`      訂閱者（觀眾）: ${stats.subscribers}`);
  console.log(`      複製的參與者: ${stats.replicated}`);
  console.log('');

  return stats;
}

/**
 * 主函數
 */
async function main() {
  logSection('🔍 AWS IVS Stage Participants 檢查工具');

  // 檢查環境變數
  if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
    log('❌ 錯誤：缺少 AWS 憑證', 'red');
    console.log('');
    console.log('請設置環境變數：');
    console.log('  export AWS_ACCESS_KEY_ID=your_access_key');
    console.log('  export AWS_SECRET_ACCESS_KEY=your_secret_key');
    console.log('  export AWS_REGION=us-east-1  # 可選');
    console.log('');
    console.log('或在 .env 文件中設置這些變數');
    process.exit(1);
  }

  // 從命令行獲取 Stage ARN
  const stageArns = process.argv.slice(2);

  if (stageArns.length === 0) {
    log('❌ 錯誤：缺少 Stage ARN', 'red');
    console.log('');
    console.log('使用方式：');
    console.log('  node check-stage-participants.js <stage-arn-1> [stage-arn-2] ...');
    console.log('');
    console.log('示例：');
    console.log('  node check-stage-participants.js arn:aws:ivs:us-east-1:123456789012:stage/abcd1234');
    console.log('');
    console.log('💡 提示：你可以同時檢查多個 Stage');
    console.log('');
    process.exit(1);
  }

  // 創建 AWS 客戶端
  log('正在初始化 AWS IVS 客戶端...', 'cyan');
  const client = createIVSClient();
  log('✅ 初始化完成', 'green');
  console.log('');

  // 檢查每個 Stage
  const allStats = [];

  for (let i = 0; i < stageArns.length; i++) {
    const stageArn = stageArns[i];

    logSection(`檢查 Stage ${i + 1}/${stageArns.length}`);
    console.log(`ARN: ${stageArn}`);
    console.log('');

    try {
      const participants = await listStageParticipants(client, stageArn);
      const stats = analyzeParticipants(participants, `Stage ${i + 1}`);
      allStats.push({ stageArn, stats });
    } catch (error) {
      log(`❌ 查詢失敗: ${error.message}`, 'red');
      console.log('');
    }
  }

  // 診斷建議
  logSection('診斷建議');

  // 檢查是否有主播推流
  const stagesWithPublishers = allStats.filter(s => s.stats.publishers > 0);

  if (stagesWithPublishers.length === 0) {
    log('❌ 問題：所有 Stage 都沒有主播在推流', 'red');
    console.log('');
    console.log('這是為什麼在 AWS 控制台看到 "no publishers" 的原因！');
    console.log('');
    console.log('解決方案：');
    console.log('1. 確認主播已獲得 Token（檢查 API）');
    console.log('2. 確認主播已連接到 Stage（使用 Token 連接）');
    console.log('3. 確認主播已開始推流（OBS 顯示「串流中」）');
    console.log('');
    console.log('驗證步驟：');
    console.log('1. 在 OBS 中點擊「開始串流」');
    console.log('2. 確認 OBS 顯示為「串流中」狀態');
    console.log('3. 再次運行此腳本檢查');
    console.log('');
  } else {
    log(`✅ 有 ${stagesWithPublishers.length} 個 Stage 有主播在推流`, 'green');
    console.log('');

    // 檢查複製狀態
    const stagesWithReplication = allStats.filter(s => s.stats.replicated > 0);

    if (stagesWithReplication.length === 0 && allStats.length > 1) {
      log('⚠️ 沒有檢測到複製的參與者', 'yellow');
      console.log('');
      console.log('可能原因：');
      console.log('1. Participant Replication 沒有啟動');
      console.log('2. AWS SDK 版本不支持（需要 >= 3.600.0）');
      console.log('3. 複製的參與者沒有特殊標記（難以區分）');
      console.log('');
    } else if (stagesWithReplication.length > 0) {
      log(`✅ 有 ${stagesWithReplication.length} 個 Stage 有複製的參與者`, 'green');
      console.log('');
      log('🎉 Participant Replication 正在正常工作！', 'green');
      console.log('');
    }
  }

  logSection('總結');
  console.log(`檢查了 ${stageArns.length} 個 Stage`);
  console.log('');

  allStats.forEach((item, index) => {
    console.log(`${index + 1}. ${item.stageArn.substring(item.stageArn.length - 20)}`);
    console.log(`   - 參與者: ${item.stats.totalParticipants}`);
    console.log(`   - 主播: ${item.stats.publishers}`);
    console.log(`   - 觀眾: ${item.stats.subscribers}`);
    console.log(`   - 複製: ${item.stats.replicated}`);
    console.log('');
  });
}

// 執行
if (require.main === module) {
  main()
    .then(() => {
      process.exit(0);
    })
    .catch((error) => {
      log('\n❌ 執行失敗: ' + error.message, 'red');
      console.error(error);
      process.exit(1);
    });
}

module.exports = { main };
