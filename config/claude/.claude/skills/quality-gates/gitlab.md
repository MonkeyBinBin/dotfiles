# GitLab

## 平台操作的管道

GitLab 上的操作（查 runner、改專案設定、設定 MR 自動合併）依序選用：

1. **GitLab MCP**：session 裡有 GitLab MCP server 的工具時優先用。工具名稱因 server 而異，依功能找，例如能更新專案設定、能合併 MR 的工具。
2. **`glab`**：MCP 沒有對應功能，且 `glab auth status` 已登入同一台主機時使用。
3. **手動設定提示**：兩者都做不到時，依 SKILL.md 的格式寫成提示，UI 路徑見下方「手動設定位置」。

MCP 用的 personal access token 存在 MCP 設定裡：不讀取 MCP 設定檔，也不要求我提供 token。改專案設定需要 token 具 `api` scope，且帳號在該專案是 Maintainer 以上；操作回 401／403 時照實回報權限不足，改走下一種管道。

## CI

先確認專案有可用的 runner（MCP，或 `glab api projects/:id/runners`；查不到就看既有 job 是否成功跑過）。沒有 runner 時 pipeline 會停在 pending：寫成手動設定提示，CI 檔照樣寫。

`check` 以新增 job 加入：把 [`assets/gitlab-check.yml`](assets/gitlab-check.yml) 的 job 合併進 `.gitlab-ci.yml`，沒有這個檔就新建。已有跑 lint／test 的 job 也不改名，另外新增 `check`。

- 依 package manager 調整 `image`、安裝指令與 cache：pnpm 用 `pnpm install --frozen-lockfile`，cache 鍵用 `pnpm-lock.yaml`、路徑用 `.pnpm-store/`（搭配 `pnpm config set store-dir .pnpm-store`）；Yarn 1 用 `yarn install --frozen-lockfile --cache-folder .yarn-cache`；Yarn 2+ 用 `yarn install --immutable`，cache 路徑 `.yarn/cache/`；bun 改用 `oven/bun` image 與 `bun install --frozen-lockfile`。
- `image` 的 Node 版本跟專案的版本來源一致。自建 GitLab 在內網時，runner 可能拉不到 Docker Hub：沿用既有 job 用的 image 來源（例如內部 registry mirror）。
- 既有的 `stages` 要包含 `test`，或把 job 的 `stage` 改成既有的 stage。
- gitlab.com Free 的 instance runner 每月 400 compute minutes：`check` job 保持精簡（cache 依賴、不放 E2E），回報時附上這次 gate 指令的耗時供估算。額度不夠時改在自己機器註冊 project runner，不建議購買額外的 compute minutes。自架 GitLab 用自己的 runner，不涉及平台費用。

**每條 MR pipeline 都要包含 `check`**：合併閘門只看 MR pipeline 整條是否成功，不認 job 名稱。讀既有的 `workflow:rules` 與各 job 的 `rules`，確認 MR 事件會建立 pipeline 而且 `check` 在其中：

- 既有設定只跑 branch pipeline（沒有 `merge_request_event`）時，MR 的 pipeline 就是不含 `check` 的 branch pipeline，綠了照樣能合併。這時需要改 `workflow:rules`（先問我確認），改用下面的寫法：MR 有開時跑 MR pipeline，預設分支、其他分支與 tag 照常跑，既有的部署 job 不受影響：

  ```yaml
  workflow:
    rules:
      - if: $CI_PIPELINE_SOURCE == "merge_request_event"
      - if: $CI_COMMIT_BRANCH && $CI_OPEN_MERGE_REQUESTS
        when: never
      - if: $CI_COMMIT_BRANCH
      - if: $CI_COMMIT_TAG
  ```

- 既有 `workflow:rules` 有其他條件時，保留原條件，只補上缺的那一條，並在回報中說明。

完成條件：依規則推論，MR 事件建立的 pipeline 包含 `check`。回報中提醒我在第一個 MR 上確認 pipeline 確實有 `check` job。

## 自動修復

Claude 的 Auto-fix 只支援 GitHub。GitLab 上的對等做法是：CI 失敗後在本機開 Claude 修，用 MCP 讀失敗 job 的 log，Stop hook 會在結束前重跑 gate 指令。回報時講清楚這點。

GitLab 維護的 Claude Code GitLab CI/CD 整合（beta）需要 `ANTHROPIC_API_KEY` 並按用量計費，與 Claude 訂閱分開。只在我明確要求時才設定，方式見 https://code.claude.com/docs/en/gitlab-ci-cd

## 合併閘門（確認後執行）

套用時機依 SKILL.md 第 4 節的選擇：選了等待時，這一節整個留到第一個 MR 的 `check` 綠燈後再做。

開啟「Pipelines must succeed」，對應專案屬性 `only_allow_merge_if_pipeline_succeeds`：

```bash
glab api -X PUT projects/:id -F only_allow_merge_if_pipeline_succeeds=true
```

開啟前先確認每個 MR 都會產生 pipeline：MR 沒有 pipeline、或 pipeline 被 skip，開啟後都無法合併。既有規則會讓某些 MR 沒有 pipeline 時，優先調整規則；真的需要時才一併開啟「Skipped pipelines are considered successful」（`allow_merge_on_skipped_pipeline`），並在回報中寫明取捨：開啟後，訊息帶 `[ci skip]` 的 commit 可以不跑 `check` 就合併。

自建 GitLab 要確認 `glab` 已登入那台主機（`glab auth status`）。

完成條件：讀回專案設定（MCP，或 `glab api projects/:id`），`only_allow_merge_if_pipeline_succeeds` 為 `true`。做不到時，回報「合併閘門尚未生效」。

之後對單一低風險 MR 開啟自動合併：用 MCP 合併工具的 auto-merge（merge when pipeline succeeds）選項，或 `glab mr merge <MR> --squash -y`（`--auto-merge` 是預設值），或 MR 頁面的 Set to auto-merge。pipeline 還在跑時會等全綠才合併。「Pipelines must succeed」沒開時，沒有 pipeline 在跑的 MR 會立即合併：只在閘門已生效後才用。Free 方案沒有強制審核規則，「低風險」由我決定要不要對該 MR 開啟。

## 手動設定位置

| 設定 | 位置 | 動作 | 驗證 |
|---|---|---|---|
| 註冊 runner | 專案的 Settings → CI/CD → Runners | 確認有可用的 runner；沒有就新增 project runner，或請 instance 管理員開放 | 同一頁顯示綠燈的 runner，pipeline 不再停在 pending |
| Pipelines must succeed | 專案的 Settings → Merge requests → Merge checks | 勾選 Pipelines must succeed | pipeline 未成功的 MR 無法按下 Merge |
| 允許 skipped pipeline 合併（需要時） | 同上 | 勾選 Skipped pipelines are considered successful | pipeline 被 skip 的 MR 可以合併 |

自建的舊版 GitLab 選項名稱或位置可能不同，提示中註明這點。
