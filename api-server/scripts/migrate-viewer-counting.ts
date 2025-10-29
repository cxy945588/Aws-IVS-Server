/**
 * 觀眾計數系統遷移腳本
 *
 * 目的：
 * 1. 清理舊的獨立計數器 keys (viewers:arn:..., total_viewers)
 * 2. 驗證新的 Set-based 計數系統
 * 3. 檢查數據一致性
 *
 * 使用方式：
 * ts-node scripts/migrate-viewer-counting.ts
 */

import { RedisService } from '../src/services/RedisService';
import { logger } from '../src/utils/logger';
import * as dotenv from 'dotenv';

dotenv.config();

async function migrate() {
  console.log('\n=== 觀眾計數系統遷移 ===\n');

  const redis = RedisService.getInstance();

  try {
    // 等待 Redis 連接
    await redis.ping();
    console.log('✓ Redis 連接成功\n');

    // 步驟 1: 掃描現有數據
    console.log('📊 步驟 1: 掃描現有 Redis 數據...\n');
    const client = redis.getClient();
    const prefix = process.env.REDIS_KEY_PREFIX || 'ivs:prod:';
    const allKeys = await client.keys(`${prefix}*`);

    console.log(`   找到 ${allKeys.length} 個 key\n`);

    // 分類統計
    const stats = {
      oldCounters: [] as string[],
      viewerSets: [] as string[],
      viewerSessions: [] as string[],
      others: [] as string[],
    };

    for (const key of allKeys) {
      const shortKey = key.replace(prefix, '');
      const type = await client.type(key);

      if (shortKey === 'total_viewers' && type === 'string') {
        stats.oldCounters.push(key);
      } else if (shortKey.startsWith('viewers:') && type === 'string') {
        stats.oldCounters.push(key);
      } else if (shortKey.includes(':viewers') && type === 'set') {
        stats.viewerSets.push(key);
      } else if (shortKey.startsWith('viewer:') && type === 'string') {
        stats.viewerSessions.push(key);
      } else {
        stats.others.push(key);
      }
    }

    console.log('   數據分類：');
    console.log(`   - 舊計數器: ${stats.oldCounters.length}`);
    console.log(`   - 觀眾集合 (Set): ${stats.viewerSets.length}`);
    console.log(`   - 觀眾 Session: ${stats.viewerSessions.length}`);
    console.log(`   - 其他: ${stats.others.length}\n`);

    // 顯示舊計數器詳情
    if (stats.oldCounters.length > 0) {
      console.log('   🔍 舊計數器詳情：');
      for (const key of stats.oldCounters) {
        const value = await client.get(key);
        console.log(`      ${key.replace(prefix, '')} = ${value}`);
      }
      console.log();
    }

    // 顯示觀眾集合詳情
    if (stats.viewerSets.length > 0) {
      console.log('   🔍 觀眾集合詳情：');
      for (const key of stats.viewerSets) {
        const count = await client.scard(key);
        const members = await client.smembers(key);
        console.log(`      ${key.replace(prefix, '')} (${count} 位觀眾)`);
        if (members.length > 0) {
          console.log(`         成員: ${members.slice(0, 5).join(', ')}${members.length > 5 ? '...' : ''}`);
        }
      }
      console.log();
    }

    // 步驟 2: 檢查數據一致性
    console.log('📊 步驟 2: 檢查數據一致性...\n');

    if (stats.oldCounters.length > 0) {
      console.log('   ⚠️  發現舊計數器！這些將被刪除，因為新系統直接使用 Set 的 SCARD\n');
    }

    // 檢查 Session 和 Set 的一致性
    for (const setKey of stats.viewerSets) {
      const members = await client.smembers(setKey);
      const stageArn = extractStageArnFromKey(setKey.replace(prefix, ''));

      let sessionCount = 0;
      for (const userId of members) {
        const sessionKey = `${prefix}viewer:${userId}:${stageArn}`;
        const exists = await client.exists(sessionKey);
        if (exists) {
          sessionCount++;
        }
      }

      const setCount = members.length;
      if (setCount !== sessionCount) {
        console.log(`   ⚠️  數據不一致: ${setKey.replace(prefix, '')}`);
        console.log(`      Set 中有 ${setCount} 位觀眾，但只有 ${sessionCount} 個有效 Session`);
      } else if (setCount > 0) {
        console.log(`   ✓ 數據一致: ${setKey.replace(prefix, '')} (${setCount} 位觀眾)`);
      }
    }
    console.log();

    // 步驟 3: 執行遷移
    console.log('📊 步驟 3: 執行遷移...\n');

    if (stats.oldCounters.length === 0) {
      console.log('   ✓ 沒有需要清理的舊計數器\n');
    } else {
      console.log(`   準備刪除 ${stats.oldCounters.length} 個舊計數器...\n`);

      for (const key of stats.oldCounters) {
        console.log(`   刪除: ${key.replace(prefix, '')}`);
        await client.del(key);
      }
      console.log(`\n   ✓ 已刪除 ${stats.oldCounters.length} 個舊計數器\n`);
    }

    // 步驟 4: 驗證新系統
    console.log('📊 步驟 4: 驗證新系統...\n');

    // 獲取所有活躍 Stage
    const activeStages = await redis.getActiveStages();
    console.log(`   活躍 Stage 數量: ${activeStages.length}\n`);

    let totalViewers = 0;
    for (const stageArn of activeStages) {
      const count = await redis.getStageViewerCount(stageArn);
      totalViewers += count;

      if (count > 0) {
        const stageId = stageArn.split('/').pop() || stageArn.substring(stageArn.length - 12);
        console.log(`   - Stage ${stageId}: ${count} 位觀眾`);
      }
    }

    console.log(`\n   總觀眾數: ${totalViewers}\n`);

    // 步驟 5: 最終報告
    console.log('📊 遷移完成報告\n');
    console.log('   新架構特點：');
    console.log('   ✓ 使用 Redis Set 作為唯一真相來源');
    console.log('   ✓ 觀眾計數 = SCARD(stage:{arn}:viewers)');
    console.log('   ✓ 原子性操作，避免 Race Condition');
    console.log('   ✓ 自動去重，同一用戶不會被重複計數\n');

    console.log('   數據結構：');
    console.log(`   - stage:{stageArn}:viewers (Set): 觀眾列表`);
    console.log(`   - viewer:{userId}:{stageArn} (String): Session 資訊（用於心跳）\n`);

    console.log('✅ 遷移成功完成\n');

  } catch (error: any) {
    console.error('\n❌ 遷移失敗:', error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    await redis.disconnect();
  }
}

/**
 * 從 key 中提取 Stage ARN
 */
function extractStageArnFromKey(key: string): string {
  // Key 格式: stage:arn:aws:ivs:...:viewers
  const match = key.match(/stage:(arn:aws:ivs:[^:]+:[^:]+:[^:]+\/[^:]+):viewers/);
  return match ? match[1] : '';
}

// 執行遷移
migrate().catch(console.error);
