# 📚 文檔中心

歡迎來到 AWS IVS Real-time API Server 文檔中心！

---

## 🗺️ 文檔導航

### 🚀 快速開始

| 文檔 | 描述 | 適合對象 |
|------|------|---------|
| **[README.md](../README.md)** | 專案介紹、安裝和快速開始 | 所有用戶 |
| **[API.md](API.md)** | 完整的 API 文檔（YApi 格式） | 開發者 |
| **[DATA_FLOW.md](DATA_FLOW.md)** | 系統數據流程圖 | 開發者、架構師 |

### 📖 參考文檔

| 文檔 | 描述 |
|------|------|
| **[CHANGELOG.md](../CHANGELOG.md)** | 版本更新記錄 |
| **[API_FIXES_2025-10-21.md](../API_FIXES_2025-10-21.md)** | 最新 API 修復記錄 |
| **[archive/](archive/)** | 歷史文檔存檔 |

---

## 📘 API 文檔

### [完整 API 文檔 →](API.md)

**YApi 格式的完整 API 文檔**，包含：

- ✅ 所有 API 端點詳細說明
- ✅ 請求參數和回應格式
- ✅ 完整的請求/回應示例
- ✅ 錯誤碼說明
- ✅ 數據模型定義
- ✅ WebSocket 接口說明
- ✅ 最佳實踐指南

**主要章節**:
- [基本資訊](API.md#基本資訊) - Base URL、認證方式
- [通用規範](API.md#通用規範) - 統一回應格式
- [錯誤碼說明](API.md#錯誤碼說明) - 所有錯誤碼
- [API 接口列表](API.md#api-接口列表) - 所有端點
- [數據模型](API.md#數據模型) - 數據結構定義
- [WebSocket](API.md#websocket-接口) - 即時更新

---

## 🏗️ 架構文檔

### [數據流圖 →](DATA_FLOW.md)

**系統數據流程和架構圖**，包含：

- 主播推流流程
- 觀眾觀看流程
- Token 生成流程
- 自動擴展機制
- 心跳追蹤機制

---

## 📝 版本記錄

### [更新日誌 →](../CHANGELOG.md)

**完整的版本更新記錄**，包含：

- 所有版本的變更記錄
- 破壞性變更說明
- 新增功能列表
- 錯誤修復記錄
- 棄用和移除的功能

**最新版本**: v1.1.0 (2025-10-21)

---

## 🔧 修復記錄

### [API 修復記錄 2025-10-21 →](../API_FIXES_2025-10-21.md)

**最新的 API 設計修復**，包含：

- API 回應格式統一
- 錯誤處理標準化
- 欄位命名統一
- Response Helper 工具
- 完整的修復對照表

---

## 📦 歷史文檔

### [存檔文檔 →](archive/)

已棄用的歷史文檔，包含：

- 舊版 API 文檔
- 歷史修復記錄
- 初期問題說明

⚠️ **注意**: 這些文檔僅供歷史參考，請勿作為開發依據。

---

## 🗂️ 文檔結構

```
docs/
├── README.md              # 📚 本文件 - 文檔索引
├── API.md                 # 📘 完整 API 文檔（YApi 格式）
├── DATA_FLOW.md          # 🏗️ 數據流圖
└── archive/              # 📦 歷史文檔
    ├── README.md         # 存檔說明
    ├── API.md            # 舊版 API 文檔
    ├── API_DOCUMENTATION.md
    ├── FIXES.md
    ├── FIXES_2025-10-19.md
    ├── STATS_API_FIX.md
    └── ...               # 其他歷史文檔
```

---

## 🎯 依據場景查找文檔

### 我想了解專案

→ 閱讀 **[README.md](../README.md)**

### 我要調用 API

→ 查看 **[API.md](API.md)**

### 我想知道如何集成

→ 參考 **[API.md - 快速示例](API.md#快速示例)**

### 我遇到錯誤

→ 查看 **[API.md - 錯誤碼說明](API.md#錯誤碼說明)**

### 我想了解系統架構

→ 閱讀 **[DATA_FLOW.md](DATA_FLOW.md)** 和 **[README.md - 系統架構](../README.md#系統架構)**

### 我想知道版本更新了什麼

→ 查看 **[CHANGELOG.md](../CHANGELOG.md)**

### 我要貢獻代碼

→ 閱讀 **[README.md - 開發指南](../README.md#開發指南)**

---

## 📊 API 端點快速索引

### Token 管理
- `POST /api/token/publisher` - [生成主播 Token](API.md#21-生成主播-token)
- `POST /api/token/viewer` - [生成觀眾 Token](API.md#22-生成觀眾-token)

### Stage 管理
- `GET /api/stage/list` - [獲取 Stage 列表](API.md#31-獲取-stage-列表)
- `POST /api/stage` - [創建新 Stage](API.md#33-創建新-stage)
- `DELETE /api/stage/:stageArn` - [刪除 Stage](API.md#34-刪除-stage)

### 觀眾管理
- `POST /api/viewer/heartbeat` - [發送心跳](API.md#41-發送觀眾心跳)
- `POST /api/viewer/leave` - [觀眾離開](API.md#42-觀眾離開)
- `GET /api/viewer/list/:stageArn` - [獲取觀眾列表](API.md#43-獲取觀眾列表)

### 統計數據
- `GET /api/stats` - [獲取總體統計](API.md#51-獲取總體統計)
- `GET /api/stats/viewers` - [獲取觀眾統計](API.md#52-獲取觀眾統計)
- `GET /api/stats/publisher` - [獲取主播狀態](API.md#53-獲取主播狀態)

### 健康檢查
- `GET /health` - [服務健康檢查](API.md#11-服務健康檢查)

---

## 🔍 搜索建議

使用 `Ctrl+F` 或 `Cmd+F` 在文檔中搜索：

- **API 端點**: 搜索端點路徑（如 `/api/token/viewer`）
- **錯誤碼**: 搜索錯誤代碼（如 `VALIDATION_ERROR`）
- **欄位名稱**: 搜索欄位名（如 `stageArn`）
- **功能**: 搜索關鍵字（如 "心跳"、"Token"）

---

## 📞 需要幫助？

- 📧 **Email**: support@your-domain.com
- 🐛 **Bug 報告**: [GitHub Issues](https://github.com/your-org/aws-ivs-server/issues)
- 💬 **討論**: [GitHub Discussions](https://github.com/your-org/aws-ivs-server/discussions)

---

## 🤝 貢獻文檔

歡迎改進文檔！如果您發現：

- 錯別字或語法錯誤
- 不清楚的說明
- 缺少的資訊
- 過時的內容

請提交 Issue 或 Pull Request。

### 文檔編寫規範

- 使用 Markdown 格式
- 添加清晰的標題和目錄
- 提供實際的示例代碼
- 包含請求/回應示例
- 保持與代碼同步更新

---

## 📅 文檔更新記錄

| 日期 | 版本 | 更新內容 |
|------|------|---------|
| 2025-10-21 | v2.0 | 創建 YApi 格式完整 API 文檔 |
| 2025-10-21 | v2.0 | 整理歷史文檔到 archive |
| 2025-10-21 | v2.0 | 創建 CHANGELOG.md |
| 2025-10-19 | v1.0 | 初始文檔版本 |

---

**最後更新**: 2025-10-21
**文檔版本**: 2.0
**API 版本**: v1.1.0

**⭐ 如果文檔對您有幫助，請給專案一個 Star！**
