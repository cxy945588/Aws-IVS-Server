# 測試指南

## 測試工具總覽

本專案提供三個測試/診斷工具，各有不同用途：

| 工具 | 用途 | 使用時機 |
|------|------|---------|
| `test-full-flow.js` | 完整流程測試 | 測試自動擴展 + Participant Replication |
| `verify-replication.js` | API 層面診斷 | 檢查 Replication 配置狀態 |
| `check-stage-participants.js` | AWS 直接查詢 | 查看 Stage 實際參與者 |

---

## 🧪 test-full-flow.js - 完整流程測試

### 用途

測試完整的自動擴展和 Participant Replication 流程。

### 測試項目

1. ✅ 主播 Token 生成
2. ✅ 等待主播推流（在 OBS 中）
3. ✅ 模擬 50 個觀眾加入
4. ✅ 觸發自動擴展（閾值 45）
5. ✅ 驗證 Participant Replication
6. ✅ 提供 AWS 控制台鏈接
7. ✅ 清理測試資源（可選）

### 使用方式

```bash
# 確保 API 服務器正在運行
cd /path/to/Aws-IVS-Server
node test-full-flow.js
```

### 測試流程

#### 1. 啟動測試

```bash
node test-full-flow.js
```

輸出：
```
============================================================
步驟 1：生成主播 Token
============================================================

✅ 主播 Token 生成成功

📋 主播資訊：
  - Participant ID: abc123xyz
  - User ID: test-full-flow-broadcaster
  - Stage ARN: arn:aws:ivs:us-east-1:...
  - Token 有效期: 7200 秒

🔑 Token（用於推流）：
eyJhbGciOiJFUzM4NCIsInR5cCI6IkpXVCJ9...
```

#### 2. 設置 OBS 推流

測試會暫停，等待你在 OBS 中設置推流：

```
============================================================
步驟 2：等待主播開始推流
============================================================

請在 OBS 中設置推流：

📺 OBS 設置：
1. 設定 → 串流
2. 服務：WHIP
3. 服務器：從 Stage ARN 提取 WHIP 端點
4. Bearer Token：使用上方顯示的 Token
5. 點擊「開始串流」

💡 提示：推流成功後，按 Enter 繼續測試
```

**在 OBS 中操作：**
1. 打開 OBS Studio
2. 設定 → 串流
3. 服務選擇 "WHIP"
4. 服務器填寫 WHIP 端點（例如：`https://us-east-1.global-contribute.live-video.net`）
5. Bearer Token 粘貼上方的完整 Token
6. 點擊「開始串流」
7. 確認 OBS 顯示「串流中」
8. **回到終端機按 Enter 繼續**

#### 3. 模擬觀眾加入

```
============================================================
步驟 3：模擬 50 個觀眾加入
============================================================

正在模擬 50 個觀眾加入 Master Stage...

  已模擬 10/50 個觀眾...
  已模擬 20/50 個觀眾...
  ...
  已模擬 50/50 個觀眾...

✅ 成功模擬 50 個觀眾
```

#### 4. 等待自動擴展

測試會自動等待自動擴展觸發（最多 5 分鐘）：

```
============================================================
步驟 4：等待自動擴展觸發
============================================================

自動擴展檢查週期：30 秒
正在等待自動擴展觸發...

⏳ 檢查 1/10 - 找到 1 個 Stage (0 個自動擴展)
⏳ 檢查 2/10 - 找到 2 個 Stage (1 個自動擴展)

✅ 檢測到自動擴展！創建了 1 個新 Stage

1. auto-stage-1730123456789
   ARN: arn:aws:ivs:us-east-1:...:stage/xyz789
   觀眾數: 0
```

#### 5. 驗證 Replication

```
============================================================
步驟 5：驗證 Participant Replication
============================================================

檢查新創建的 Stage 是否啟動了 Replication...

✅ auto-stage-1730123456789 - Replication 已啟動
   - 來源 Stage: ...stage/abc123
   - Participant ID: abc123xyz

總結：1/1 個 Stage 啟動了 Replication
```

#### 6. AWS 控制台驗證

```
============================================================
步驟 6：在 AWS 控制台驗證
============================================================

請在 AWS IVS 控制台驗證結果：

🔗 AWS IVS Real-time 控制台：
https://console.aws.amazon.com/ivs/home?region=us-east-1#/real-time/stages

📋 Master Stage：
https://console.aws.amazon.com/ivs/home?region=us-east-1#/real-time/stages/abc123

📋 自動擴展的 Stage：
1. auto-stage-1730123456789
   https://console.aws.amazon.com/ivs/home?region=us-east-1#/real-time/stages/xyz789

✅ 驗證步驟：
1. 點擊上方連結進入 AWS 控制台
2. 查看 Master Stage 的 Participants（應該有 1 個 Publisher）
3. 查看自動擴展 Stage 的 Participants（應該也有 1 個 Publisher - 複製的）
4. 確認兩個 Stage 都顯示主播畫面
```

**在 AWS 控制台中驗證：**
1. 點擊提供的鏈接進入 AWS 控制台
2. 查看 **Master Stage**：
   - Participants 標籤
   - 應該看到 1 個 Publisher（你的主播）
   - 狀態：Connected, Publishing
3. 查看 **自動擴展的 Stage**：
   - Participants 標籤
   - 應該也看到 1 個 Publisher（通過 Replication 複製的）
   - 狀態：Connected, Publishing
4. 如果看到 "The stage currently has no publishers"：
   - 表示 Replication 失敗或主播沒有推流

#### 7. 清理資源

```
============================================================
步驟 7：清理測試資源
============================================================

是否要清理測試資源？(y/n)
這將刪除所有自動擴展創建的 Stage

y

正在清理...

✅ 已刪除: auto-stage-1730123456789

✅ 清理完成
```

### 預期結果

#### ✅ 成功的測試

```
============================================================
測試完成
============================================================

🎉 所有測試步驟已完成！

💡 下一步：
1. 在 AWS 控制台驗證結果
2. 確認 Participant Replication 是否正常工作
3. 檢查兩個 Stage 是否都能看到主播
```

**AWS 控制台應該顯示：**
- Master Stage：1 個 Publisher（主播）
- 自動擴展 Stage：1 個 Publisher（複製的主播）

#### ❌ 常見問題

**問題 1：自動擴展沒有觸發**

```
⏳ 檢查 10/10 - 找到 1 個 Stage (0 個自動擴展)

⚠️ 等待超時，未檢測到自動擴展

可能原因：
1. 觀眾數未達到閾值（45）
2. 自動擴展服務未啟動
3. 達到 Stage 數量上限
```

解決方案：
- 檢查 API 日誌是否有自動擴展相關錯誤
- 確認觀眾數是否正確增加
- 檢查 `StageAutoScalingService` 是否已啟動

**問題 2：Replication 未啟動**

```
❌ auto-stage-xyz - 沒有 Replication

總結：0/1 個 Stage 啟動了 Replication
```

解決方案：
- 確認主播正在推流（檢查 OBS 狀態）
- 查看 API 日誌中的 Replication 錯誤
- 使用 `check-stage-participants.js` 驗證主播狀態
- 檢查 AWS SDK 版本（需要 >= 3.600.0）

**問題 3：AWS 控制台顯示 "no publishers"**

原因：
- 主播沒有真正開始推流
- 只生成了 Token 但沒有連接到 Stage

解決方案：
1. 確認 OBS 顯示「串流中」
2. 使用 `check-stage-participants.js` 檢查：
   ```bash
   node check-stage-participants.js <stage-arn>
   ```

---

## 🔍 verify-replication.js - API 層面診斷

### 用途

快速檢查 Replication 配置狀態（不需要推流）。

### 使用方式

```bash
node verify-replication.js
```

### 輸出示例

```
步驟 1：檢查主播狀態
✅ 找到主播資訊
  - Participant ID: abc123
  - User ID: test-broadcaster
  ...

步驟 2：列出所有 Stage
✅ 找到 2 個 Stage

步驟 3：檢查 Replication 狀態
  ✅ auto-stage-xyz - 有 Replication

步驟 4：診斷建議
✅ 有 1 個 Stage 啟動了 Replication
```

---

## 🔬 check-stage-participants.js - AWS 直接查詢

### 用途

直接使用 AWS SDK 查詢 Stage 的實際參與者（最準確）。

### 使用方式

```bash
# 需要提供 Stage ARN
node check-stage-participants.js <stage-arn-1> [stage-arn-2] ...
```

### 示例

```bash
node check-stage-participants.js \
  arn:aws:ivs:us-east-1:123456789012:stage/abc123 \
  arn:aws:ivs:us-east-1:123456789012:stage/xyz789
```

### 輸出示例

```
檢查 Stage 1/2
ARN: arn:aws:ivs:...

📋 Stage: Stage 1
   參與者數量: 1

   1. Participant ID: abc123xyz
      User ID: test-broadcaster
      狀態: CONNECTED
      發布: 是  ✅

📊 統計：
   總參與者: 1
   發布者（主播）: 1
   訂閱者（觀眾）: 0

診斷建議
✅ 有 1 個 Stage 有主播在推流
```

---

## 📝 測試最佳實踐

### 1. 測試前準備

- ✅ 確保 API 服務器運行
- ✅ 確保 Redis 運行
- ✅ AWS 憑證已配置
- ✅ OBS Studio 已安裝

### 2. 測試順序

1. 先使用 `test-full-flow.js` 進行完整測試
2. 如果遇到問題，使用 `verify-replication.js` 診斷配置
3. 使用 `check-stage-participants.js` 查看實際狀態

### 3. 驗證 Replication 是否成功

**方法 1：AWS 控制台（推薦）**
- 查看兩個 Stage 的 Participants
- 都應該顯示 Publisher

**方法 2：使用診斷工具**
```bash
node check-stage-participants.js <master-stage-arn> <replica-stage-arn>
```

**方法 3：查看 API 日誌**
```bash
# 搜索 Replication 相關日誌
grep "Participant Replication" logs/app.log
```

### 4. 清理測試資源

測試後記得清理：
- 在測試工具中選擇清理
- 或手動刪除測試 Stage
- 停止 OBS 推流

---

## 🐛 故障排除

### 問題：自動擴展沒有觸發

**檢查清單：**
- [ ] 觀眾數是否 ≥ 45？
- [ ] `StageAutoScalingService` 是否啟動？
- [ ] 是否達到 Stage 上限（10）？
- [ ] 檢查 API 日誌

### 問題：Replication 失敗

**檢查清單：**
- [ ] 主播是否在推流？（OBS 顯示「串流中」）
- [ ] AWS SDK 版本是否 >= 3.600.0？
- [ ] 查看 API 日誌中的錯誤訊息
- [ ] 使用 `check-stage-participants.js` 驗證

### 問題：AWS 控制台顯示 "no publishers"

**原因：**
- 主播沒有真正推流

**解決：**
1. 確認 OBS 狀態
2. 使用 `check-stage-participants.js` 驗證
3. 檢查 Token 是否正確

---

## 📚 相關文檔

- [Participant Replication 功能文檔](./PARTICIPANT_REPLICATION.md)
- [Participant Replication 使用指南](./PARTICIPANT_REPLICATION_USAGE.md)
- [API 文檔](./API.md)

---

## 🎯 總結

| 場景 | 使用工具 |
|------|---------|
| 完整流程測試 | `test-full-flow.js` |
| 快速診斷配置 | `verify-replication.js` |
| 驗證實際狀態 | `check-stage-participants.js` |
| AWS 控制台驗證 | 點擊測試工具提供的鏈接 |

記住：**Participant Replication 要求主播正在推流！**
