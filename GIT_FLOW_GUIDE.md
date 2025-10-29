# Git Flow 使用說明

## 分支模型
- **main**：正式站，永遠可用於生產環境。
- **develop**：測試站，日常整合分支，所有功能在這合併+測試。
- **feature/**：功能開發分支，用 `git flow feature start` 開、完成功能再 `git flow feature finish` 自動合併回去`develop`。
- **release/**：發版前穩定化（修 bug、改版本號），最後合併回 `main` 與 `develop`。
- **hotfix/**：線上緊急修復，從 `main` 開，修完再合併回 `main` 與 `develop`。

## 初始化
```bash
# 初始化 git flow
git flow init
# 建議直接按 Enter 接受預設值：
# - main
# - develop
# - feature/
# - bugfix/
# - release/
# - hotfix/
# - support/
# - version tag prefix: v
```

## 日常開發 (Feature)
```bash
# 開新功能
git flow feature start i18n-language-setup

# 完成功能後 合併回 develop = 上測試站
# 所有功能先在本地測試好 在 feature finish 合併上測試站
git flow feature finish i18n-language-setup
git push origin develop
```

## 準備發佈 (Release)

詳細解釋:

凍結功能：當團隊決定要發 1.0.0 版時，從 develop 拉一個 release/1.0.0，代表「接下來要上線的版本」。
這時候不再加新功能，只修 bug、改小東西（像版本號、文檔）。
開發中的新功能可以繼續留在 develop，不影響發版進度。

版本穩定化：在 release 分支可以做測試、QA、修 bug，而不用怕其他人 merge 新功能進來把它搞壞。

發佈後同步：完成後，release/1.0.0 會被合併：

# git flow release finish 會自動合併回 main + develop，並打 tag
合併到 main → 上線版本，並且打上 tag v1.0.0
合併回 develop → 確保 bug 修正也回到測試站

```bash
# 建立 release
git flow release start 2.0.1

# 打commit
git commit -m "Bump version to 2.0.1"

# 結束 release (會自動合併回 main + develop，並打 tag)
git flow release finish 2.0.1
git push origin main develop --follow-tags
```

## 緊急修復 (Hotfix)
```bash
# 線上出 bug，從 main 開 hotfix
git flow hotfix start 1.0.1

# 結束 hotfix (會合併回 main + develop，並打 tag)
git flow hotfix finish 1.0.1
git push origin main develop --follow-tags
```

## 分支命名規則
- `feature/<tracker>-<功能>`：功能開發  
  例：`feature/login-api`、`feature/phase-10-2`
- `release/<版本號>`：發版  
  例：`release/1.0.0`
- `hotfix/<版本號>`：緊急修復  
  例：`hotfix/1.0.1`

## 注意事項

- 避免分支名稱有空格或特殊字元。

- 完成 release/hotfix 一定要執行 finish & push 合併回 main&develop，否則會遺漏更新。

