/**
 * 測試自動擴展功能
 * 模擬多個觀眾加入，觀察 Stage 自動創建
 */

const API_URL = 'http://localhost:3000';
const API_KEY = 'your-api-key-here'; // 替換成你的 API Key

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

// 先設定主播為在線
async function setPublisherOnline() {
  try {
    log(colors.blue, '\n📡 設定主播為在線...');
    
    // 這裡需要手動設定 Redis，或者呼叫 publisher token API
    const response = await fetch(`${API_URL}/api/token/publisher`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': API_KEY,
      },
      body: JSON.stringify({
        userId: 'test-broadcaster-001'
      })
    });
    
    if (response.ok) {
      log(colors.green, '✅ 主播已設定為在線');
    } else {
      log(colors.red, '❌ 設定主播失敗');
      const error = await response.json();
      console.log(error);
    }
  } catch (error) {
    log(colors.red, '❌ 錯誤:', error.message);
  }
}

// 生成觀眾 Token
async function generateViewerToken(viewerNumber) {
  const userId = `test-viewer-${String(viewerNumber).padStart(3, '0')}`;
  
  try {
    const response = await fetch(`${API_URL}/api/token/viewer`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': API_KEY,
      },
      body: JSON.stringify({ userId })
    });

    const data = await response.json();
    
    if (response.ok && data.success && data.data && data.data.stageArn) {
      // 修復: 安全地解析 Stage ARN
      const stageArn = data.data.stageArn;
      const stageId = stageArn.substring(stageArn.lastIndexOf('/') + 1, stageArn.lastIndexOf('/') + 13);
      log(
        colors.green,
        `✅ 觀眾 ${viewerNumber}: ${userId} → Stage ${stageId} (總觀眾: ${data.data.currentViewers})`
      );
      return data.data;
    } else {
      log(colors.red, `❌ 觀眾 ${viewerNumber} 失敗:`, data.message);
      return null;
    }
  } catch (error) {
    log(colors.red, `❌ 觀眾 ${viewerNumber} 錯誤:`, error.message);
    return null;
  }
}

// 查詢所有 Stage
async function listStages() {
  try {
    const response = await fetch(`${API_URL}/api/stage/list`, {
      headers: {
        'x-api-key': API_KEY,
      }
    });

    const data = await response.json();
    
    if (response.ok && data.success && data.data && data.data.stages) {
      log(colors.cyan, '\n📊 目前 Stage 狀態:');
      console.log('='.repeat(60));
      data.data.stages.forEach((stage, index) => {
        // 修復: 檢查 stageArn 是否存在，並安全解析
        if (!stage.stageArn) {
          log(colors.red, `${index + 1}. Stage 資料錯誤: 缺少 ARN`);
          return;
        }
        const stageArn = stage.stageArn;
        const stageId = stageArn.substring(stageArn.lastIndexOf('/') + 1, stageArn.lastIndexOf('/') + 13);
        const autoScaled = stage.autoScaled ? '🤖 自動' : '👤 手動';
        log(
          colors.yellow,
          `${index + 1}. Stage ${stageId} ${autoScaled} - ${stage.viewerCount} 觀眾`
        );
      });
      console.log('='.repeat(60));
      log(colors.cyan, `總共 ${data.data.totalStages} 個 Stage\n`);
    } else {
      log(colors.red, '❌ 查詢 Stage 失敗: API 返回格式錯誤');
      console.log('收到的資料:', JSON.stringify(data, null, 2));
    }
  } catch (error) {
    log(colors.red, '❌ 查詢 Stage 失敗:', error.message);
    log(colors.yellow, '提示: 請檢查 API Server 是否正常運行');
  }
}

// 主測試流程
async function runTest() {
  log(colors.blue, '\n🚀 開始測試自動擴展功能\n');
  log(colors.yellow, '⚠️  請確保：');
  log(colors.yellow, '   1. API Server 正在運行 (npm run dev)');
  log(colors.yellow, '   2. Redis 正在運行');
  log(colors.yellow, '   3. 已設定正確的 API_KEY');
  log(colors.yellow, '   4. 已設定 MASTER_STAGE_ARN 環境變數\n');

  // 等待用戶確認
  await new Promise(resolve => {
    const readline = require('readline').createInterface({
      input: process.stdin,
      output: process.stdout
    });
    readline.question('按 Enter 繼續...', () => {
      readline.close();
      resolve();
    });
  });

  // 設定主播在線
  await setPublisherOnline();
  await new Promise(resolve => setTimeout(resolve, 1000));

  // 初始狀態
  log(colors.cyan, '\n📊 初始狀態:');
  await listStages();

  // 測試 1: 加入 45 個觀眾（觸發擴展）
  log(colors.blue, '\n🧪 測試 1: 加入 45 個觀眾（應該觸發擴展）');
  log(colors.yellow, '⏳ 正在生成 45 個觀眾 Token...\n');

  for (let i = 1; i <= 45; i++) {
    await generateViewerToken(i);
    
    // 每 5 個觀眾顯示一次進度
    if (i % 5 === 0) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }

  await listStages();

  // 等待自動擴展服務運行（30 秒）
  log(colors.yellow, '\n⏰ 等待 35 秒讓自動擴展服務運行...');
  for (let i = 35; i > 0; i--) {
    process.stdout.write(`\r⏳ 剩餘 ${i} 秒...`);
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  console.log('\n');

  await listStages();

  // 測試 2: 再加入 10 個觀眾（應該分配到新 Stage）
  log(colors.blue, '\n🧪 測試 2: 再加入 10 個觀眾（應該分配到新 Stage）');
  log(colors.yellow, '⏳ 正在生成 10 個觀眾 Token...\n');

  for (let i = 46; i <= 55; i++) {
    await generateViewerToken(i);
    await new Promise(resolve => setTimeout(resolve, 300));
  }

  await listStages();

  // 測試 3: 查看統計資訊
  log(colors.blue, '\n🧪 測試 3: 查看系統統計');
  try {
    const response = await fetch(`${API_URL}/api/stats`, {
      headers: {
        'x-api-key': API_KEY,
      }
    });

    const data = await response.json();
    
    if (response.ok && data.success && data.data) {
      log(colors.cyan, '\n📈 系統統計:');
      console.log('='.repeat(60));
      console.log(`總觀眾數: ${data.data.totalViewers || 0}`);
      console.log(`總 Stage 數: ${data.data.activeStages || data.data.totalStages || 0}`);
      console.log(`主播狀態: ${data.data.isPublisherLive ? '在線' : '離線'}`);
      console.log('='.repeat(60));
    } else {
      log(colors.red, '❌ 查詢統計失敗: API 返回格式錯誤');
      console.log('收到的資料:', JSON.stringify(data, null, 2));
    }
  } catch (error) {
    log(colors.red, '❌ 查詢統計失敗:', error.message);
  }

  log(colors.green, '\n✅ 測試完成！\n');
  log(colors.yellow, '💡 觀察重點:');
  log(colors.yellow, '   1. 第 45 個觀眾後，等待 30 秒應該會創建新 Stage');
  log(colors.yellow, '   2. 第 46-55 個觀眾應該被分配到新 Stage');
  log(colors.yellow, '   3. 最終應該有 2 個 Stage（1 個手動 + 1 個自動）\n');
}

// 執行測試
runTest().catch(error => {
  log(colors.red, '\n❌ 測試失敗:', error);
  process.exit(1);
});
