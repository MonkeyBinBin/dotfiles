# zsh 設定

- 只在互動 shell (interactive) 中載入與執行，避免在非互動／批次執行時產生副作用。
- 將互動設定拆成多個小檔案放於 `zshrc.d/`，依檔名（字母序）載入以控制順序。
- 每個子檔案使用 guard 環境變數避免重複載入。

## 檔案／目錄說明

- `.zshrc`
   - 角色：互動 shell 的載入器。
   - 行為：檢查是否為互動 shell，若是則按字母序載入 `zshrc.d/` 內的 `.zsh` 檔案。
   - 實作要點：包含防止重複載入的 guard（例如 `_DOTFILES_ZSHRC_LOADED`），並會優先把 `~/.local/bin`（若存在）加入 PATH。

- `zshrc.d/`（資料夾）
   - 角色：把互動 shell 設定拆成多個小檔，便於維護與控制載入順序。
   - 建議命名帶數字前綴（例：`00-`, `10-`, `20-`）以明確排序。

- `zshrc.d/00-paths.zsh`
   - 角色：PATH 與基礎環境變數設定。
   - 行為：將 `~/.local/bin`（若存在）加入 PATH；可選把 repo 的 `scripts/`（本專案的 `scripts/`）加入 PATH，方便開發工具可直接執行。
   - Guard：設定並檢查 `_DOTFILES_PATHS_LOADED` 以避免重複執行。

- `zshrc.d/01-env.zsh`
   - 角色：載入或設定與環境（locale、LANG、LC_* 等）相關的變數，以及使用者偏好的環境值。
   - 行為：僅設定必要的環境變數，避免做重的初始化動作。
   - Guard：可使用 `_DOTFILES_ENV_LOADED`。

- `zshrc.d/10-functions.zsh`
   - 角色：互動 helper 與 wrapper 函式。
   - 行為：只在互動 shell 中定義函式（會檢查 `$-`）；例如 `start_tmux` wrapper（會優先使用 repo 裡的 `functions.d/start-tmux.sh`，若不可用則 fallback 到 PATH 中的 `start-tmux`），以及範例性的 `dotfiles-bin-install` helper（把 `scripts/` 內的檔案 symlink 到 `~/.local/bin`）。
   - Guard：設定並檢查 `_DOTFILES_FUNCTIONS_LOADED`。

- `zshrc.d/20-aliases.zsh`
   - 角色：定義常用 alias。
   - 行為：定義例如 `ll`, `la` 等常見 alias；若偵測到本 repo 的 `functions.d/start-tmux.sh` 可執行或在 PATH，會建立 `start-tmux` / `st` 的 alias。
   - Guard：設定並檢查 `_DOTFILES_ALIASES_LOADED`。

- `functions.d/`
   - 角色：放置可獨立執行的 helper script（非直接由 `.zsh` 載入的程式），例如啟動 tmux 的腳本。
   - 範例：`functions.d/start-tmux.sh`：tmux 啟動與 session 管理的 wrapper script，`10-functions.zsh` 會嘗試先呼叫此腳本。

## 重要注意事項

- 互動檢查：所有在 `zshrc.d/` 的設定檔都應該在必要時檢查是否為互動 shell（例如檢查 `$-` 是否包含 `i`），以避免在非互動環境產生副作用。
- Guard：使用明確的 guard 變數（例：`_DOTFILES_PATHS_LOADED`, `_DOTFILES_ENV_LOADED`, `_DOTFILES_FUNCTIONS_LOADED`, `_DOTFILES_ALIASES_LOADED`）來避免重複執行初始化程式碼。
- 擴充與覆寫：建議新增 `zshrc.d/90-local.zsh` 作為私人覆寫檔（不加入版本控制），放使用者專屬的設定或敏感資訊。
