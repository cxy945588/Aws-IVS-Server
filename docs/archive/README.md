# 歷史文檔存檔

本目錄包含已棄用或過時的文檔，保留作為歷史參考。

---

## 📁 檔案說明

### API 文檔 (已棄用)

- **API.md** - 舊版簡化 API 文檔
  - 替代文檔: [`../API.md`](../API.md) (YApi 格式完整版)
  - 棄用日期: 2025-10-21

- **API_DOCUMENTATION.md** - 舊版 API 文檔
  - 替代文檔: [`../API.md`](../API.md)
  - 棄用日期: 2025-10-21

### 架構文檔 (v1.1 - DynamoDB 版本)

- **DATA_FLOW_v1.1_DynamoDB.md** - 舊版數據流程圖（基於 DynamoDB）
  - 替代文檔: [`../SIMPLE_ARCHITECTURE.md`](../SIMPLE_ARCHITECTURE.md)
  - 棄用日期: 2025-10-22
  - 棄用原因: 專案已改用 PostgreSQL 架構

- **COST_OPTIMIZATION_v1.1_DynamoDB.md** - 舊版成本優化方案（DynamoDB 快照方案）
  - 替代文檔: [`../SIMPLE_ARCHITECTURE.md`](../SIMPLE_ARCHITECTURE.md) 和 [`../DEPLOYMENT_GUIDE.md`](../DEPLOYMENT_GUIDE.md)
  - 棄用日期: 2025-10-22
  - 棄用原因: 實際實現採用 PostgreSQL 而非 DynamoDB 快照

- **OPTIMIZATION_GUIDE_v1.1_DynamoDB.md** - 舊版優化指南（建議實現 DynamoDB）
  - 替代文檔: 實際實現已採用 PostgreSQL，無需此優化
  - 棄用日期: 2025-10-22
  - 棄用原因: 建議的 DynamoDB 實現未被採用

- **QUICK_START_OPTIMIZATION_v1.1.md** - 舊版快速優化指南（Week 1）
  - 替代文檔: 整合測試套件已完成 ([`../../api-server/tests/integration/`](../../api-server/tests/integration/))
  - 棄用日期: 2025-10-22
  - 棄用原因: 建議的 DynamoDB 實現未被採用

### 修復記錄 (歷史)

- **FIXES.md** - 初期修復記錄
  - 日期: 2025-10-19
  - 內容: Redis 連接、Token 生成等初期問題修復

- **FIXES_2025-10-19.md** - 特定日期修復記錄
  - 日期: 2025-10-19
  - 內容: Stats API 修復、路由順序修正

- **STATS_API_FIX.md** - Stats API 特定修復
  - 日期: 2025-10-19
  - 內容: totalViewers 計算方式修正

- **FIX-SUMMARY.md** - 修復總結
  - 日期: 2025-10-19
  - 內容: 所有修復的概要說明

- **README-FIXES.md** - README 修復說明
  - 日期: 2025-10-19
  - 內容: README 文件的修復歷史

- **修復完成總結.md** - 中文修復總結
  - 日期: 2025-10-19
  - 內容: 修復完成的詳細說明（中文版）

---

## 🔄 遷移到新文檔

所有歷史修復記錄已整合到以下新文檔：

1. **[CHANGELOG.md](../../CHANGELOG.md)** - 完整的版本更新記錄
2. **[API.md](../API.md)** - YApi 格式的完整 API 文檔
3. **[README.md](../../README.md)** - 更新的主文檔
4. **[API_FIXES_2025-10-21.md](../../API_FIXES_2025-10-21.md)** - 最新的 API 修復記錄

---

## 📅 時間軸

```
2025-10-19
├── v1.0.0 初始版本發布
├── 發現並修復 Redis WRONGTYPE 錯誤
├── 修正 Stats API 計算邏輯
└── 修正路由順序問題

2025-10-21
├── v1.1.0 版本發布
├── 統一 API 回應格式
├── 創建完整的 YApi API 文檔
├── 整理歷史文檔到 archive
└── 建議 DynamoDB 實現方案（未採用）

2025-10-22
├── v1.2.0 版本發布
├── 採用 PostgreSQL 作為持久化方案
├── 完成整合測試套件
├── 歸檔 DynamoDB 相關文檔
└── 更新為 PostgreSQL 架構文檔
```

---

## ⚠️ 注意事項

- ⚠️ 本目錄中的文檔已過時，僅供歷史參考
- ⚠️ 請勿使用這些文檔作為開發依據
- ⚠️ 請參考項目根目錄的最新文檔

---

## 📚 建議閱讀順序

如果您想了解項目的演進歷史：

1. 先閱讀 `FIXES.md` 了解初期問題
2. 再閱讀 `FIXES_2025-10-19.md` 了解具體修復
3. 最後查看 `../../CHANGELOG.md` 了解完整版本歷史

---

**最後更新**: 2025-10-22
**維護者**: Your Team
