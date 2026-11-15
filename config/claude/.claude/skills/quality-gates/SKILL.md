---
name: quality-gates
description: 為目前專案建立三道品質關卡：Claude 結束任務前的 Stop hook、每個 PR／MR 都跑的 CI，以及全綠才能合併的合併閘門（支援 GitHub 與 GitLab）。
disable-model-invocation: true
---

# Quality gates

三道關卡共用同一條 **gate 指令**：Stop hook 在本機跑它，CI 的 `check` job 在每個 PR／MR 跑它，合併閘門要求 `check` 綠燈才能合併。三處跑的是同一件事，本機綠燈就代表 CI 大概率也綠。

整套設定不能產生任何費用：只用平台的免費額度與免費功能（GitHub 標準 runner、GitLab 免費 instance runner 額度或自架 runner），不選 larger runner、不購買額外額度、不啟用按用量計費的服務。會吃掉有限免費額度的選擇先問我，平台檔有各自的規則。

## 1. 偵測專案

- **平台**：看 `git remote get-url origin`。`github.com` → GitHub；`gitlab.com`、已有 `.gitlab-ci.yml`、或自架主機上 `glab auth status` 認得 → GitLab。判斷不出來就問我。
- **工具鏈**：lockfile 決定 package manager（`pnpm-lock.yaml`／`yarn.lock`／`bun.lock`／`package-lock.json`）；Yarn 再看 `package.json` 的 `packageManager` 或 `.yarnrc.yml` 分辨 Yarn 1 與 Yarn 2+。Node 版本來源依序是 `.nvmrc`、`.node-version`、`package.json` 的 `engines.node`。
- **既有設定**：`package.json` scripts、`.claude/settings.json` 與 `.claude/settings.local.json` 的 `hooks`、`.github/workflows/` 或 `.gitlab-ci.yml`（含 `workflow:rules`）、預設分支。
- **hook 依賴**：`command -v jq || command -v python3`，兩者都沒有就列為待我處理。

完成條件：能寫出平台、package manager（含 Yarn 版本）、Node 版本來源、預設分支，以及 lint／typecheck／test 各自對應的 script（沒有的標「無」）。

## 2. 建立 gate 指令

在 `package.json` 加一個 `check` script，依序串起既有的 lint、typecheck、test，例如 `"check": "npm run lint && npm run typecheck && npm test"`。

- 已有語意相同的 script（例如已經串好 lint 與 test 的 `validate`）就沿用它當 gate 指令，不另建。
- 已有名為 `check` 但語意不同的 script（例如 SvelteKit 的 `svelte-kit sync && svelte-check`）：把它併進 gate 指令的串接裡；併不進去就把 gate 命名為 `gate`。回報中註明選了哪個。
- 缺的那一項直接省略，回報時列出來。非 Node 專案改用專案自己的 task runner（`Makefile`、`justfile` 等）提供同樣一條指令。

完成條件：在 repo 根目錄以 `CI=1` 執行 gate 指令，記下結果與耗時。目前是紅的就照實回報，不在這個 skill 裡修程式碼。

## 3. Stop hook

安裝前一次問我兩件事：hook 寫進 `.claude/settings.json`（commit 後所有協作者都會套用）還是 `.claude/settings.local.json`（只有我）；以及 gate 目前是紅的時，要現在裝 hook，還是先只裝 CI、修綠後再裝。

1. 複製 [`assets/stop-check.sh`](assets/stop-check.sh) 到 `.claude/hooks/check.sh`，把 `CHECK_CMD` 設成 gate 指令，`chmod +x`。gate 指令超過約 60 秒時，hook 改跑較快的子集（lint + typecheck），完整測試留給 CI，並在回報中說明。
2. 把下面的 `Stop` hook **合併**進選定的設定檔，保留其他 hooks 與設定：

   ```json
   { "hooks": { "Stop": [ { "hooks": [ { "type": "command", "command": "\"$CLAUDE_PROJECT_DIR\"/.claude/hooks/check.sh" } ] } ] } }
   ```

腳本的行為：

- 以 hook 輸入的 `cwd` 定位 repo，所以 Claude 進 worktree 後檢查的是 worktree。
- 工作目錄乾淨、或同一份變更已經有過結果（通過，或失敗且已回報過）時跳過，所以純對話與重複的回合不會反覆擋人。
- gate 失敗時輸出 `decision: "block"`，把最後 60 行錯誤（上限 8000 bytes）交給 Claude 繼續修。
- Claude 因此續跑過一次（`stop_hook_active`）仍失敗時，改用 `systemMessage` 通知我，不再阻擋。
- 不是 git repo 時整個 hook 跳過：沒有變更判斷就不跑 gate。

完成條件：在 repo 根目錄執行

```bash
echo "{\"stop_hook_active\":false,\"cwd\":\"$PWD\"}" | .claude/hooks/check.sh; echo "exit=$?"
rm -f "$(git rev-parse --absolute-git-dir)/quality-gate.last"
```

gate 綠時無輸出且 `exit=0`；gate 紅時 stdout 是含 `"decision": "block"` 的 JSON 且 `exit=0`。第二行清掉這次測試留下的狀態，讓下一次真正結束任務時重新檢查。

## 4. CI 與合併閘門

依平台讀一份，照著做：

- GitHub → [`github.md`](github.md)
- GitLab → [`gitlab.md`](gitlab.md)

兩個平台的閘門機制不同：GitHub 把 `check` 設為必要的 status check，靠 job 名稱對應；GitLab 沒有必要 job 的概念，靠「每條 MR pipeline 都包含 `check` job，且 pipeline 必須成功才能合併」。

需要先問我確認的：

- 會改到 GitHub／GitLab 上專案設定的操作（auto-merge 開關、ruleset、合併條件）：列出要改的項目與實際指令。
- 合併閘門的套用時機，在同一次確認裡問：
  - **等第一個 PR／MR 的 `check` 綠燈後再套用**（推薦）：`check` 的 CI 檔還沒進預設分支時，閘門一生效，所有不含它的 PR／MR 都等不到 `check` 而無法合併；CI 第一次跑就失敗的話，也要先修好才能合併任何東西。
  - **現在套用**：CI 檔已在預設分支、且 `check` 已經綠過時才適合。

  選了等待時，這次只套用不會擋合併的設定（例如 GitHub 的 auto-merge 開關），閘門留到之後我說一聲再套用。
- 修改既有 CI：改既有 job 的名稱或 `rules`、新增或修改 `workflow:rules`。既有 job 不改名（branch protection 可能要求舊名稱），`check` 一律以新增 job 的方式加入。

只新增檔案或新增 `check` job 時直接寫。工具做不到、權限不足或我選擇自己來的設定，改寫成手動設定提示。

## 5. 回報

依序列出：

- gate 指令及這次的執行結果
- 新增或修改的檔案
- 已套用的平台設定
- 合併閘門是否已經生效（平台檔有檢查方式）。尚未生效時明講：此時對 PR／MR 開啟自動合併會立即合併，不會等 CI。選了等待時，寫出下一步：把新增的檔案以 PR／MR 送出，`check` 綠燈後叫我套用閘門
- 閘門已生效時提醒：預設分支不能再直接 push，所有變更都要走 PR／MR
- 手動設定提示（沒有就省略）
- 之後怎麼對單一 PR／MR 開啟自動修復與自動合併（平台檔各有一段）

手動設定提示每項一個區塊，讓我照著點就能完成：

```
### 手動設定：<設定名稱>
- 位置：<設定頁路徑，例如 Settings → General → Pull Requests>
- 動作：<勾選或填入什麼，值逐字寫出>
- 原因：<不設定會怎樣，一句話>
- 驗證：<設定後怎麼確認生效>
```

UI 選項名稱以平台檔寫的為準；平台版本不同可能略有差異，照實註明。

不要 commit，除非我要求。
