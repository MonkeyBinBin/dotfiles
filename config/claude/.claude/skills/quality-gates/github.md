# GitHub

## 平台操作的管道

GitHub 上的操作依序選用：

1. **GitHub MCP**：session 裡有 GitHub MCP server 的工具時優先用，依功能找工具。
2. **`gh`**：MCP 沒有對應功能，且 `gh auth status` 已登入時使用。
3. **手動設定提示**：兩者都做不到時，依 SKILL.md 的格式寫成提示，UI 路徑見下方「手動設定位置」。

MCP 用的 personal access token 存在 MCP 設定裡：不讀取 MCP 設定檔，也不要求我提供 token。建立或修改 ruleset、改 repo 設定需要 repo 的 admin 權限（fine-grained PAT 的 Administration: write，classic PAT 的 `repo`）；操作回 401／403 時照實回報權限不足，改走下一種管道。

官方 GitHub MCP server 的 ruleset 工具（只有建立與讀取，沒有更新）屬於 `governance` toolset，讀 job log 的工具屬於 `actions` toolset，兩者都不在預設 toolset 裡；session 裡看不到這些工具就直接走 `gh`。它也沒有「開啟 repo 的 auto-merge」與「對 PR 開啟 auto-merge」的工具：這兩項一律走 `gh` 或 UI。

## CI

`check` 以新增 job 加入：沒有合適的 workflow 就以 [`assets/github-check.yml`](assets/github-check.yml) 為底建立 `.github/workflows/check.yml`；已有跑 lint／test 的 workflow，也不改它的 job 名稱，另外新增 `check` job。

- `push.branches` 換成偵測到的預設分支。
- 安裝步驟依 package manager：

  | package manager | 額外步驟 | `setup-node` 的 `cache` | 安裝指令 |
  |---|---|---|---|
  | npm | — | `npm` | `npm ci` |
  | pnpm | `setup-node` 之前加 `pnpm/action-setup` | `pnpm` | `pnpm install --frozen-lockfile` |
  | Yarn 1 | — | `yarn` | `yarn install --frozen-lockfile` |
  | Yarn 2+ | `setup-node` 之前跑 `corepack enable` | `yarn` | `yarn install --immutable` |
  | bun | 改用 `oven-sh/setup-bun`，不需要 `setup-node` | — | `bun install --frozen-lockfile` |

- `node-version-file` 對應偵測到的版本來源：`.nvmrc`、`.node-version` 或 `package.json`；都沒有就寫死版本。
- `actions/*`、`pnpm/action-setup`、`oven-sh/setup-bun` 的 major 版本會前進，寫入前到各 action 的 releases 頁確認最新 major。
- `runs-on` 只用標準 GitHub-hosted runner 的 label（例如 `ubuntu-latest`、`macos-26`、`xcode-27`），不用 larger runner：larger runner 連 public repo 都收費。
- 費用：public repo 的標準 runner 免費。私有 repo 每月只有一筆小額免費額度，macOS runner 的每分鐘費率約是 Linux 的 10 倍，很快就會用完：私有 repo 需要 macOS runner（Swift、Xcode 等）時先問我，並說明它會消耗這筆額度。
- 私有 repo 的回報中提醒我確認：帳號沒綁付款方式（額度用完只會停用 CI，不會扣款），或 Budgets 裡 Actions 的預算設為 0 並在達到時停止使用。

## 自動修復（Auto-fix）

Auto-fix 是對單一 PR 開啟，repo 裡沒有可以寫的設定。它有兩個前提：

- 我在 claude.ai 連結的 GitHub 帳號能存取這個 repo。claude.ai 只連結一個 GitHub 帳號，常見的是只連公司帳號，這時個人帳號底下的 repo 用不了 Auto-fix。
- repo 裝了 Claude GitHub App（https://github.com/apps/claude）。

這兩項都無法用我的 token 查到：`repos/{owner}/{repo}/installation` 需要 App 本身的憑證，用 user token 一定回 401，不要呼叫。memory 或我先前的話已說明帳號狀況就照著判斷；沒有的話，在合併閘門的那次確認裡一併問我這個 repo 要不要用 Auto-fix。要用時才寫安裝 App 的手動設定提示；不用時只寫下面的本機修正流程。

`.github/workflows/` 裡有 `issue_comment` 觸發的 workflow 時要特別提出：Auto-fix 會用我的 GitHub 帳號回覆 PR 留言，可能觸發它們。

之後開啟方式：在 PR 的 branch 上跑 `/autofix-pr`。不用 Auto-fix 時，CI 失敗後在本機開 Claude 修：讀失敗 job 的 log（MCP 的 actions 工具，或 `gh run view <run-id> --log-failed`），修完由 Stop hook 重跑 gate 指令。

## 合併閘門（確認後執行）

套用時機依 SKILL.md 第 4 節的選擇：選了等待時只做步驟 1，步驟 2–3 留到第一個 PR 的 `check` 綠燈後。

1. 開啟 repo 的 auto-merge：`gh api -X PATCH repos/{owner}/{repo} -F allow_auto_merge=true`。
2. 讀取預設分支實際生效的規則：
   - `gh api repos/{owner}/{repo}/rules/branches/<default-branch>`：列出所有套用到這個分支的 ruleset 規則，包含 org 層級的。
   - `gh api repos/{owner}/{repo}/branches/<default-branch>/protection`：舊式 branch protection，404 代表沒有設定。
3. 依結果處理：
   - 已有 `required_status_checks` 而且包含 `check`：閘門已生效，不用改。
   - 有 repo 層級的 ruleset 要求其他 status check：先用 `gh api repos/{owner}/{repo}/rulesets/<id>` 取回完整內容，在 `required_status_checks` 陣列加入 `{ "context": "check" }`，再把完整的 `name`、`target`、`enforcement`、`conditions`、`rules` 以 `gh api -X PUT repos/{owner}/{repo}/rulesets/<id> --input -` 送回。PUT 會整份取代，漏帶的規則會被刪掉。
   - 規則來自 org 層級 ruleset、或來自舊式 branch protection：寫成手動設定提示，不在 repo 層級修改。
   - 什麼都沒有：新建 ruleset（MCP 的建立工具參數與下面的 JSON 對應）：

     ```bash
     gh api -X POST repos/{owner}/{repo}/rulesets --input - <<'EOF'
     {
       "name": "quality-gates",
       "target": "branch",
       "enforcement": "active",
       "conditions": { "ref_name": { "include": ["~DEFAULT_BRANCH"], "exclude": [] } },
       "rules": [
         {
           "type": "required_status_checks",
           "parameters": {
             "strict_required_status_checks_policy": false,
             "do_not_enforce_on_create": false,
             "required_status_checks": [{ "context": "check" }]
           }
         }
       ]
     }
     EOF
     ```

   私有 repo 在 GitHub Free 方案可能回 403 或要求升級：照實回報，不改用別的方式繞過。

完成條件：再跑一次步驟 2 的第一個指令，結果的 `required_status_checks` 包含 `check`。做不到時，回報「合併閘門尚未生效」。

之後對單一低風險 PR 開啟自動合併：`gh pr merge <PR> --auto --squash`，或 PR 頁面的 Enable auto-merge。CI 全綠後 GitHub 會自動合併；ruleset 若還要求 review，會等到有人 approve。`check` 不是必要檢查時，`--auto` 會立即合併，即使 CI 是紅的：只在閘門已生效後才用。

## 手動設定位置

| 設定 | 位置 | 動作 | 驗證 |
|---|---|---|---|
| 安裝 Claude GitHub App | https://github.com/apps/claude → Install／Configure | 選取這個 repo | repo 的 Settings → GitHub Apps 列出 Claude |
| 開啟 auto-merge | repo 的 Settings → General → Pull Requests | 勾選 Allow auto-merge | `gh api repos/{owner}/{repo} --jq .allow_auto_merge` 回傳 `true` |
| 要求 `check` 通過 | repo 的 Settings → Rules → Rulesets → New ruleset → New branch ruleset | Enforcement status 設 Active；Target branches 加 Include default branch；勾 Require status checks to pass，加入 `check` | `gh api repos/{owner}/{repo}/rules/branches/<default-branch>` 的 `required_status_checks` 包含 `check` |
| org ruleset 或舊式 branch protection 加入 `check` | org 的 Settings → Rules → Rulesets，或 repo 的 Settings → Branches | 在要求的 status checks 加入 `check` | 同上 |
