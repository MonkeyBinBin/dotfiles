---
name: commit
description: 建立符合約定式提交（Conventional Commits）格式的 git commit，自動偵測歷史 commit 語言（預設繁體中文），嚴禁加入任何 AI 署名或生成標記。適用於使用者要求 commit、提交變更、建立 git commit 時觸發。
---

# Conventional Commit

建立符合約定式提交格式的 git commit，具備語言自動偵測與嚴格的署名禁止規則。

## 資訊收集

執行以下命令取得必要資訊：

```bash
git status
git diff --cached 2>/dev/null || git diff
git branch --show-current
git log --oneline -10 2>/dev/null || echo "（初始專案，尚無 commit 歷史）"
git log -5 --pretty=format:"%s%n%b" 2>/dev/null || echo "（初始專案，預設使用繁體中文）"
```

## 語言判斷

分析最近 5 筆 commit 訊息：
- 主要使用繁體中文 → 使用繁體中文
- 主要使用英文 → 使用英文
- 無 commit 歷史或無法判斷 → 預設使用繁體中文

## Commit 格式

```
<type>(<scope>): <subject>

<body>

<footer>
```

### Type（必填）

| Type | 用途 |
|------|------|
| `feat` | 新功能 |
| `fix` | 修復 bug |
| `docs` | 文件變更 |
| `style` | 程式碼格式調整（不影響邏輯） |
| `refactor` | 重構 |
| `perf` | 效能優化 |
| `test` | 測試相關 |
| `build` | 建置系統或外部相依性變更 |
| `ci` | CI/CD 設定檔變更 |
| `chore` | 其他不修改 src 或 test 的變更 |
| `revert` | 回復先前的 commit |

### Scope（選填）

影響範圍，例如：component、service、api、config。

### Subject（必填）

- 簡短描述（50 字以內）
- 祈使句，現在式
- 不以句號結尾

### Body（選填）

- 說明變更原因與內容
- 與 subject 之間空一行

### Footer（選填）

- Breaking Changes：`BREAKING CHANGE: description`
- 關閉 Issue：`Closes #123`

## 執行步驟

1. 收集 git 資訊（見上方命令）
2. 判斷語言
3. 分析 diff，確定 type 與 scope
4. 撰寫 commit message
5. 確認檔案已加入暫存區（必要時執行 `git add`）
6. 執行 commit：
   ```bash
   git commit -m "<type>(<scope>): <subject>

   <body（若有）>"
   ```
7. 確認 commit 成功並顯示 commit hash

## 參數支援

若使用者提供參數：
- `$1`: type（例如 feat, fix, docs）
- `$2`: scope（例如 auth, api, ui）
- `$3`: message 主旨

有參數則使用，無則根據 diff 自動判斷。

## 嚴格禁止規則

- **禁止**加入 `Co-Authored-By: Claude` 或任何 AI 署名
- **禁止**加入 `Generated with Claude Code` 或任何 AI 生成標記
- **禁止**加入任何 emoji 或連結標註 AI 來源
- **禁止**使用 `--no-verify` 參數
- Commit message 只包含 type、scope、subject、body、footer，不得有其他內容
