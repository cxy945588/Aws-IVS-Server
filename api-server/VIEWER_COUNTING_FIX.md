# 觀眾計數系統修復方案

## 問題描述

### 症狀
- **Dev 環境**：觀眾計數正常運作
- **EC2 正式環境**：觀眾加入不會 +1，但離開會 -1，導致觀眾數始終為 0 或負數

### 根本原因

#### 1. Race Condition（競態條件）

**舊架構的問題流程：**

```typescript
// token.ts 中的觀眾加入流程
const countResult = await redis.incrementViewerCountIfNew(userId, stageArn);
await heartbeat.recordViewerJoin(userId, stageArn, participantId);
```

**`incrementViewerCountIfNew` 的錯誤邏輯：**

```typescript
async incrementViewerCountIfNew(userId, stageArn) {
  // 1. 檢查用戶是否在 Set 中
  const isExisting = await this.isViewerInStage(userId, stageArn);

  if (isExisting) {
    return { incremented: false, count };  // 跳過 +1
  }

  // 2. 增加計數器
  const count = await this.incrementViewerCount(stageArn);
  return { incremented: true, count };

  // ❌ 問題：這個方法沒有把用戶加入 Set！
}
```

然後在 `heartbeat.recordViewerJoin` 才把用戶加入 Set：

```typescript
async recordViewerJoin(userId, stageArn, participantId) {
  // ...
  await this.redis.sadd(`stage:${stageArn}:viewers`, userId);  // 在這裡才加入 Set
}
```

**Race Condition 場景：**

```
時間線：
t1: 請求A 檢查 isViewerInStage(user1) → false
t2: 請求B 檢查 isViewerInStage(user1) → false (並行，Set 中還沒有)
t3: 請求A incrementViewerCount → +1 (count=1)
t4: 請求B incrementViewerCount → +1 (count=2) ❌ 錯誤！
t5: 請求A recordViewerJoin → 加入 Set
t6: 請求B recordViewerJoin → 更新 Session (SADD 返回 0，因為已存在)

結果：實際 1 位觀眾，但計數器 = 2
```

#### 2. 數據不一致

系統維護了**兩個獨立的數據源**：

1. **計數器** (`viewers:{stageArn}` - String)
2. **觀眾集合** (`stage:{stageArn}:viewers` - Set)

問題：
- 計數器可能 +1 但 Set 沒加入
- 計數器可能 +2 但實際只有 1 個用戶
- 離開時直接 -1，不檢查用戶是否真的存在

## 解決方案

### 核心原則

**使用 Redis Set 作為唯一真相來源（Single Source of Truth）**

- ✅ 移除獨立計數器
- ✅ 觀眾數 = `SCARD(stage:{stageArn}:viewers)`
- ✅ 原子性操作避免 Race Condition
- ✅ 自動去重

### 架構變更

#### 舊架構 ❌

```
數據結構：
- viewers:{stageArn} (String) → 計數器
- stage:{stageArn}:viewers (Set) → 觀眾列表
- viewer:{userId}:{stageArn} (String) → Session 資訊

問題：
- 兩個數據源可能不同步
- 需要手動同步
- 容易出現 Race Condition
```

#### 新架構 ✅

```
數據結構：
- stage:{stageArn}:viewers (Set) → 觀眾列表（唯一真相來源）
- viewer:{userId}:{stageArn} (String) → Session 資訊（用於心跳）

優勢：
- 單一數據源，不會不一致
- SADD 自動去重
- SCARD 即時計算觀眾數
- 原子性操作
```

### 代碼變更

#### 1. RedisService.ts - 新增原子性方法

```typescript
/**
 * 原子性添加觀眾到 Stage
 * SADD 返回 1 = 新成員, 0 = 已存在
 */
async addViewerToStage(userId: string, stageArn: string) {
  const setKey = `stage:${stageArn}:viewers`;
  const prefixedKey = this.getPrefixedKey(setKey);

  // SADD 是原子性操作
  const added = await this.client.sadd(prefixedKey, userId);
  const isNew = added === 1;

  // SCARD 獲取當前觀眾數
  const count = await this.client.scard(prefixedKey);

  return { isNew, count };
}

/**
 * 原子性移除觀眾
 * SREM 返回 1 = 成功移除, 0 = 不存在
 */
async removeViewerFromStage(userId: string, stageArn: string) {
  const setKey = `stage:${stageArn}:viewers`;
  const prefixedKey = this.getPrefixedKey(setKey);

  const removed = await this.client.srem(prefixedKey, userId);
  const count = await this.client.scard(prefixedKey);

  return { removed: removed === 1, count };
}

/**
 * 獲取觀眾數（直接從 Set 計算）
 */
async getStageViewerCount(stageArn: string): Promise<number> {
  const setKey = `stage:${stageArn}:viewers`;
  return await this.scard(setKey);
}
```

#### 2. ViewerHeartbeatService.ts - 使用新方法

```typescript
async recordViewerJoin(userId: string, stageArn: string, participantId: string) {
  // 保存 Session
  const session = { userId, stageArn, participantId, ... };
  await this.redis.set(key, JSON.stringify(session), TTL);

  // 原子性加入 Set（同時返回計數）
  const result = await this.redis.addViewerToStage(userId, stageArn);

  return result;  // { isNew: boolean, count: number }
}

async recordViewerLeave(userId: string, stageArn: string) {
  // 原子性移除（同時返回計數）
  const result = await this.redis.removeViewerFromStage(userId, stageArn);

  // 刪除 Session
  await this.redis.del(key);

  return result;  // { removed: boolean, count: number }
}
```

#### 3. token.ts - 簡化流程

```typescript
// 舊代碼 ❌
const countResult = await redis.incrementViewerCountIfNew(userId, stageArn);
await heartbeat.recordViewerJoin(userId, stageArn, token.participantId);

// 新代碼 ✅
const joinResult = await heartbeat.recordViewerJoin(userId, stageArn, token.participantId);
// joinResult 包含 { isNew, count }
```

### 遷移步驟

#### 1. 在本地測試

```bash
# 確保所有測試通過
npm test
```

#### 2. 部署到 EC2

```bash
# 構建
npm run build

# 上傳到 EC2
# (使用你的部署流程)
```

#### 3. 執行遷移腳本

```bash
# 在 EC2 上執行
cd /path/to/api-server
npx ts-node scripts/migrate-viewer-counting.ts
```

遷移腳本會：
- 掃描所有 Redis keys
- 顯示舊計數器和新 Set 的數據
- 刪除舊的計數器 keys
- 驗證數據一致性
- 生成報告

#### 4. 重啟服務

```bash
pm2 restart api-server
```

#### 5. 驗證

```bash
# 測試觀眾加入
curl -X POST http://your-ec2-ip:3005/api/token/viewer \
  -H "Content-Type: application/json" \
  -d '{"userId": "test-user-1"}'

# 查看統計
curl http://your-ec2-ip:3005/api/stats

# 檢查 Redis
redis-cli
> KEYS *stage:*:viewers
> SCARD ivs:prod:stage:arn:aws:ivs:...:viewers
```

## 為什麼這個方案能解決問題

### 1. 消除 Race Condition

**舊方案：**
```typescript
// 兩步操作，不原子
1. 檢查是否存在
2. 增加計數器
→ 並行請求可能都通過檢查，導致重複計數
```

**新方案：**
```typescript
// 一步原子操作
SADD stage:{arn}:viewers user123
→ Redis 保證原子性，返回 1（新增）或 0（已存在）
→ 不可能重複計數
```

### 2. 數據一致性

**舊方案：**
```
計數器 = 5
Set = {user1, user2, user3}  (只有 3 個)
→ 數據不一致！
```

**新方案：**
```
Set = {user1, user2, user3}
觀眾數 = SCARD = 3
→ 永遠一致！
```

### 3. 自動去重

**舊方案：**
```
同一用戶重複請求 token → 可能被計數多次
```

**新方案：**
```
SADD stage:xxx:viewers user1  → 返回 1 (新增)
SADD stage:xxx:viewers user1  → 返回 0 (已存在)
→ Set 自動去重
```

### 4. 簡化邏輯

**舊方案：**
- 維護計數器
- 維護 Set
- 手動同步
- 複雜的錯誤處理

**新方案：**
- 只維護 Set
- 觀眾數 = SCARD
- 簡單直觀

## 測試清單

### 功能測試

- [ ] 觀眾加入：計數 +1
- [ ] 觀眾離開：計數 -1
- [ ] 同一用戶重複加入：計數不變
- [ ] 並行請求：計數正確
- [ ] /api/stats 顯示正確觀眾數
- [ ] 觀眾列表正確

### 壓力測試

```bash
# 模擬 100 個觀眾同時加入
for i in {1..100}; do
  curl -X POST http://localhost:3005/api/token/viewer \
    -H "Content-Type: application/json" \
    -d "{\"userId\": \"user-$i\"}" &
done
wait

# 檢查計數是否為 100
curl http://localhost:3005/api/stats
```

### Edge Cases

- [ ] Redis 連接失敗
- [ ] 觀眾離開但從未加入
- [ ] Session 過期但 Set 仍有用戶
- [ ] 心跳清理是否正確移除用戶

## 回滾計劃

如果遷移失敗，可以：

1. 停止新服務
2. 恢復舊代碼
3. Redis 數據會自動恢復（Set 數據仍在）

**注意**：舊的計數器 keys 已刪除，但可以通過 Set 重建：

```bash
# 重建計數器（如果需要）
redis-cli
> SCARD ivs:prod:stage:{arn}:viewers
> SET ivs:prod:viewers:{arn} <count>
```

## 性能影響

### Redis 操作複雜度

- `SADD`: O(1)
- `SREM`: O(1)
- `SCARD`: O(1)
- `SMEMBERS`: O(N) - 只在需要列表時使用

### 對比

**舊方案：**
```
加入：INCR (O(1)) + SADD (O(1)) = 2 次操作
離開：DECR (O(1)) + SREM (O(1)) = 2 次操作
查詢：GET (O(1))
```

**新方案：**
```
加入：SADD (O(1)) + SCARD (O(1)) = 2 次操作
離開：SREM (O(1)) + SCARD (O(1)) = 2 次操作
查詢：SCARD (O(1))
```

**結論**：性能相同，但數據更可靠

## 監控建議

### 日誌關鍵點

1. 觀眾加入時記錄 `isNew` 狀態
2. 觀眾離開時記錄 `removed` 狀態
3. 定期輸出觀眾統計

### CloudWatch Metrics

```typescript
// 建議添加的指標
- ViewerJoinRate: 加入速率
- ViewerLeaveRate: 離開速率
- ViewerCountMismatch: Set vs Session 不一致次數
- DuplicateJoinAttempts: 重複加入嘗試次數
```

## 常見問題

### Q1: 為什麼不用 Lua Script 來保證原子性？

A: `SADD` 本身就是原子性的，返回值已經告訴我們是否新增成功。不需要額外的 Lua Script。

### Q2: 如果 Session 過期但 Set 中仍有用戶怎麼辦？

A: `ViewerHeartbeatService` 的定期清理會檢測到這種情況，並自動從 Set 中移除。

### Q3: 觀眾數會有延遲嗎？

A: 不會。`SCARD` 是即時的 O(1) 操作。

### Q4: 如何處理歷史數據？

A: 歷史數據在 PostgreSQL 中保存，不受此次修改影響。

## 總結

這個解決方案：

✅ **徹底消除 Race Condition**
✅ **保證數據一致性**
✅ **自動去重**
✅ **簡化代碼邏輯**
✅ **性能無損**
✅ **向後兼容**（保留舊方法作為 deprecated）

## 相關文件

- [scripts/migrate-viewer-counting.ts](./scripts/migrate-viewer-counting.ts) - 遷移腳本
- [src/services/RedisService.ts](./src/services/RedisService.ts) - Redis 服務
- [src/services/ViewerHeartbeatService.ts](./src/services/ViewerHeartbeatService.ts) - 心跳服務
- [src/routes/token.ts](./src/routes/token.ts) - Token 路由

---

**修復日期**: 2025-01-XX
**版本**: 1.0.0
**作者**: Claude Code Assistant
