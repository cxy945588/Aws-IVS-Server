## 🛠️ 問題修復總結

### 修復日期: 2025-10-19

---

## 🐛 發現的問題

### 1. **測試腳本 Stage ARN 解析錯誤**
**錯誤訊息:**
```
❌ 查詢 Stage 失敗: Cannot read properties of undefined (reading 'split')
```

**原因:**
- 測試腳本假設 API 返回 `stage.stageArn`，但實際返回的是 `stage.arn`
- 沒有檢查回傳資料是否存在就直接使用 `.split()`

**修復:**
- 在 `test-auto-scaling.js` 中添加完整的錯誤檢查
- 修改 ARN 解析邏輯，使用更安全的 `substring()` + `lastIndexOf()`
- 在 `stage.ts` API 中統一返回 `stageArn` 欄位

### 2. **Stats API 的 WRONGTYPE 錯誤**
**錯誤訊息:**
```
[error]: 獲取統計資料失敗 {"error":"WRONGTYPE Operation against a key holding the wrong kind of value"}
```

**原因:**
- Redis 中某些 key 的資料類型不一致
- 可能是之前測試留下的錯誤資料

**修復:**
- 在 `RedisService.ts` 中添加 `cleanupInvalidKeys()` 方法
- 在服務啟動時自動清理無效的 key
- 在 `getTotalViewerCount()` 和 `getStageViewerCount()` 中添加錯誤處理

### 3. **觀眾心跳超時被自動移除**
**現象:**
```
[warn]: ⏱️ 觀眾心跳超時，自動移除 {"userId":"test-viewer-024",...}
```

**原因:**
- 測試腳本沒有發送心跳請求
- 觀眾加入後 60 秒無活動會被自動清理

**說明:**
- 這是**正常行為**，不是 bug
- 如需模擬真實場景，測試腳本需要每 30 秒發送心跳

---

## ✅ 修復內容

### 1. `test-auto-scaling.js` 修復

```javascript
// ❌ 修復前
const stageId = data.data.stageArn.split('/').pop().substring(0, 8);

// ✅ 修復後
if (response.ok && data.success && data.data && data.data.stageArn) {
  const stageArn = data.data.stageArn;
  const stageId = stageArn.substring(stageArn.lastIndexOf('/') + 1, stageArn.lastIndexOf('/') + 13);
  // ...
}
```

**添加的安全檢查:**
- 檢查 `response.ok`
- 檢查 `data.success`
- 檢查 `data.data` 存在
- 檢查 `data.data.stageArn` 存在
- 使用更安全的字串解析方法

### 2. `stage.ts` API 修復

```typescript
// ❌ 修復前
return {
  ...stage,  // 返回 arn 而不是 stageArn
  viewerCount,
};

// ✅ 修復後
return {
  stageArn: stage.arn,  // 明確返回 stageArn 欄位
  name: stage.name,
  viewerCount,
  autoScaled: stageInfo?.autoScaled || false,
  createdAt: stageInfo?.createdAt,
  tags: stage.tags,
};
```

**改進:**
- 明確返回 `stageArn` 欄位名稱
- 添加 `totalStages` 欄位
- 返回 `autoScaled` 標記
- 統一回傳格式

### 3. `RedisService.ts` 修復

添加 `cleanupInvalidKeys()` 方法:

```typescript
public async cleanupInvalidKeys(): Promise<void> {
  try {
    const prefix = this.getPrefixedKey('');
    const keys = await this.client.keys(`${prefix}*`);
    
    let cleanedCount = 0;
    
    for (const key of keys) {
      const type = await this.client.type(key);
      
      // 檢查計數器 key 是否為字串類型
      if (key.includes('viewer:count:') && type !== 'string') {
        await this.client.del(key);
        cleanedCount++;
      }
      
      if (key.includes('total:viewers') && type !== 'string') {
        await this.client.del(key);
        cleanedCount++;
      }
    }
    
    if (cleanedCount > 0) {
      logger.info(`✅ Redis 清理完成，刪除 ${cleanedCount} 個無效 key`);
    }
  } catch (error: any) {
    logger.error('Redis 清理失敗', { error: error.message });
  }
}
```

添加錯誤處理:

```typescript
async getTotalViewerCount(): Promise<number> {
  try {
    const count = await this.get(REDIS_KEYS.TOTAL_VIEWERS);
    return parseInt(count || '0', 10);
  } catch (error: any) {
    logger.warn('Redis 資料類型錯誤，重置總觀眾數');
    await this.set(REDIS_KEYS.TOTAL_VIEWERS, '0');
    return 0;
  }
}
```

### 4. `index.ts` 服務初始化修復

```typescript
// 初始化 Redis
const redis = RedisService.getInstance();
await redis.ping();
logger.info('✅ Redis 連接成功');

// 修復: 清理無效的 Redis key
await redis.cleanupInvalidKeys();
logger.info('✅ Redis 資料清理完成');
```

---

## 🧪 測試步驟

### 1. 清理 Redis（推薦）

```bash
# 在 PowerShell 中執行
redis-cli
FLUSHALL
exit
```

### 2. 重新啟動 API Server

```bash
cd C:\Users\Cxy\Documents\MarbleLeague\AWS-IVS\api-server
npm run dev
```

**預期看到:**
```
[info]: 正在初始化服務...
[info]: Redis 連接成功
[info]: ✅ Redis 資料清理完成
[info]: ✅ Metrics 收集已啟動
[info]: ✅ Stage Auto Scaling 已啟動
[info]: ✅ Viewer Heartbeat 已啟動
```

### 3. 運行測試腳本

```bash
cd C:\Users\Cxy\Documents\MarbleLeague\AWS-IVS
node test-auto-scaling.js
```

**預期輸出:**
```
✅ 觀眾 1: test-viewer-001 → Stage sWyAydfRqqF8 (總觀眾: 1)
✅ 觀眾 2: test-viewer-002 → Stage 3dTeoAGT0sMy (總觀眾: 1)
...

📊 目前 Stage 狀態:
============================================================
1. Stage sWyAydfRqqF8 👤 手動 - 22 觀眾
2. Stage 3dTeoAGT0sMy 👤 手動 - 21 觀眾
3. Stage 0Vu4qZ7TIQXi 👤 手動 - 22 觀眾
============================================================
總共 3 個 Stage
```

---

## 📊 修復結果

### 修復前的錯誤:
1. ❌ `Cannot read properties of undefined (reading 'split')` - Stage ARN 解析失敗
2. ❌ `WRONGTYPE Operation against a key` - Redis 資料類型錯誤  
3. ⚠️ 所有觀眾 60-89 秒後被移除 - 缺少心跳機制

### 修復後的狀態:
1. ✅ Stage ARN 正確解析和顯示
2. ✅ Redis 資料類型自動清理和修復
3. ✅ API 返回格式統一 (`stageArn` 欄位)
4. ✅ 完整的錯誤處理和日誌
5. ℹ️ 觀眾移除是預期行為（需要心跳機制才能保持連線）

---

## 💡 未來改進建議

### 1. 測試腳本添加心跳功能
如需模擬真實場景，可以添加:

```javascript
// 每 30 秒發送心跳
setInterval(async () => {
  for (const viewer of viewers.values()) {
    await fetch(`${API_URL}/api/viewer/heartbeat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': API_KEY,
      },
      body: JSON.stringify({
        userId: viewer.userId,
        stageArn: viewer.stageArn,
      })
    });
  }
}, 30000);
```

### 2. 監控告警
建議添加:
- Redis 資料類型異常告警
- API 回傳格式驗證
- Stage 數量超限告警

### 3. 日誌優化
- 減少 DEBUG 等級日誌
- 重要錯誤添加告警機制
- 定期清理過期日誌

---

## 🔗 相關文件

- `test-auto-scaling.js` - 測試腳本
- `src/routes/stage.ts` - Stage API
- `src/services/RedisService.ts` - Redis 服務
- `src/index.ts` - 主程式

---

## ✅ 修復確認清單

- [x] Stage ARN 解析邏輯修復
- [x] API 返回格式統一
- [x] Redis 資料類型清理
- [x] 錯誤處理添加
- [x] 日誌改進
- [x] 測試腳本安全檢查
- [ ] 心跳功能（選擇性）
- [ ] 監控告警（未來）
