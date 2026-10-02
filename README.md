# Dotfiles — GNU Stow 管理

使用 GNU Stow 管理個人設定檔，方便在不同機器上快速部署一致的開發環境。

## 套件總覽

| 套件          | 說明                                           | 安裝後的路徑                                      |
| ------------- | ---------------------------------------------- | ------------------------------------------------- |
| `zsh`         | Zsh shell 設定                                 | `~/.zshrc`、`~/zshrc.d/` → `config/zsh/zshrc.d/` |
| `tmux`        | tmux 終端多工器設定                            | `~/.tmux.conf`                                    |
| `ghostty`     | Ghostty 終端模擬器設定                         | `~/.config/ghostty/config`                        |
| `cmux`        | Cmux 終端機設定                                | `~/.config/cmux/`                                 |
| `claude`      | Claude Code 系統提示 + output styles + hooks 範本 | `~/.claude/CLAUDE.md`、`~/.claude/output-styles/` |
| `claude-mods` | Claude Code mods（hooks plugin：pane、band 等） | `~/.claude/mods/<mod>/` → 目錄 symlink |
| `codex`       | Codex CLI 系統提示                             | `~/.codex/AGENTS.md`                              |
| `hammerspoon` | Hammerspoon macOS 自動化                       | `~/.hammerspoon/`                                 |
| `ripgrep`     | ripgrep 搜尋工具設定                           | `~/.ripgreprc`                                    |
| `git`         | 全域 git ignore（XDG 路徑，免設定 git config） | `~/.config/git/ignore`                            |

> `config/shared/skills/` 為共享 skills 的單一來源，**不是 stow 套件**。`stow-wrap.sh` 部署 AI CLI 套件時會自動將其 symlink 到每個工具的 `~/.<tool>/skills/`。

---

## 全新電腦安裝步驟

### 1. 安裝必要工具

```bash
# Homebrew
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# GNU Stow
brew install stow

# CLI 增強工具
brew install eza bat htop fd fzf ripgrep zoxide jq direnv

# 開發工具（按需安裝）
brew install tmux pyenv
```

### 2. 安裝 nvm（Node Version Manager）

依照官方安裝腳本安裝：https://github.com/nvm-sh/nvm?tab=readme-ov-file#install--update-script

### 3. 安裝 Oh-My-Zsh 與 plugins

```bash
# Oh-My-Zsh
sh -c "$(curl -fsSL https://raw.githubusercontent.com/ohmyzsh/ohmyzsh/master/tools/install.sh)"

# 第三方 plugins
git clone https://github.com/zsh-users/zsh-syntax-highlighting.git \
  ${ZSH_CUSTOM:-~/.oh-my-zsh/custom}/plugins/zsh-syntax-highlighting

git clone https://github.com/zsh-users/zsh-autosuggestions.git \
  ${ZSH_CUSTOM:-~/.oh-my-zsh/custom}/plugins/zsh-autosuggestions

git clone https://github.com/jeffreytse/zsh-vi-mode.git \
  ${ZSH_CUSTOM:-~/.oh-my-zsh/custom}/plugins/zsh-vi-mode

# Powerlevel10k 主題
git clone --depth=1 https://github.com/romkatv/powerlevel10k.git \
  ${ZSH_CUSTOM:-$HOME/.oh-my-zsh/custom}/themes/powerlevel10k
```

> 其餘 plugins（`git`、`macos`、`sudo`、`extract`、`colored-man-pages`、`command-not-found`）為 Oh-My-Zsh 內建。`zsh-vi-mode` 已啟用系統剪貼簿整合（`ZVM_SYSTEM_CLIPBOARD_ENABLED=true`）。

### 4. 安裝 fzf-git 整合（選用）

```bash
git clone https://github.com/junegunn/fzf-git.sh.git ~/fzf-git.sh
```

### 5. 安裝 Nerd Font

```bash
brew install --cask font-jetbrains-mono-nerd-font
```

### 6. macOS 系統設定

```bash
# 關閉長按字元選單，改為按住重複輸入（vim 操作必要）
defaults write -g ApplePressAndHoldEnabled -bool false
```

> 需登出再登入或重新啟動 app 才會生效。

### 7. Clone 並部署

```bash
git clone <此 repo 的 URL> ~/dotfiles
cd ~/dotfiles

# 備份現有設定檔
mkdir -p ~/.dotfiles-backup
for f in ~/.zshrc ~/.tmux.conf ~/.ripgreprc \
         ~/.config/ghostty/config ~/.config/cmux/cmux.json \
         ~/.claude/CLAUDE.md ~/.codex/AGENTS.md \
         ~/.hammerspoon/init.lua; do
  # 用 cp -L 解引用 symlink，確保備份的是實體內容
  [ -e "$f" ] && mkdir -p ~/.dotfiles-backup/"$(dirname "${f#$HOME/}")" \
    && cp -L "$f" ~/.dotfiles-backup/"${f#$HOME/}" \
    && rm "$f"
done

# 部署所有套件
chmod +x scripts/stow-wrap.sh
for pkg in zsh tmux ghostty cmux claude claude-mods codex hammerspoon ripgrep git; do
  ./scripts/stow-wrap.sh "$pkg"
done
```

### 8. 設定 Powerlevel10k

```bash
p10k configure
```

> `~/.p10k.zsh` 由 p10k 精靈產生，不納入版控。專案中的 `36-p10k-theme.zsh` 會自動覆寫 Gruvbox 色彩主題。

### 9. 設定 AI CLI 工具的 cmux 通知

Codex 的 `hooks.json` 已由 stow 部署，按以下步驟完成設定：

- **Codex CLI**：在 `~/.codex/config.toml` 啟用 feature flag：
  ```toml
  [features]
  codex_hooks = true
  ```
- **Claude Code**：執行 `./scripts/stow-wrap.sh claude` 時，`stow-wrap` 會自動呼叫 `scripts/sync-ai-cli-settings.sh`：
  - `~/.<tool>/settings.json` 不存在 → 直接複製 `.example` 範本
  - 已存在 → 用 `jq` 智慧合併：`permissions.allow`/`deny` 取聯集去重；`hooks` 以 command 字串為鍵冪等附加；`env` 同 key 以範本為準。`plugins`、`mcpServers` 等使用者自訂內容完全保留
  - 合併前會建立 `settings.json.bak.YYYYMMDD-HHMMSS` 備份

> Claude Code 的 `settings.json` 含機器專屬設定（plugins、MCP servers），無法整檔由 stow 管理，故改採「不存在則複製、已存在則合併」策略。`jq` 為必要相依（`brew install jq`）。可用 `--dry-run` 預覽合併動作。

### 10. 建立機器專屬設定（選用）

```bash
cp ~/dotfiles/config/zsh/zshrc.d/90-local.zsh.example ~/dotfiles/config/zsh/zshrc.d/90-local.zsh
```

編輯 `90-local.zsh` 加入機器專屬的 PATH、環境變數或 secrets 來源。`~/zshrc.d/` 是指向 `config/zsh/zshrc.d/` 的 symlink，因此直接在 dotfiles 內操作即可。此檔案已加入 `.gitignore`，不會被提交。

> 敏感資訊（API key、token）建議放在 `~/.secrets`，並在 `90-local.zsh` 中 source 它。

### 11. 驗證安裝

```bash
exec zsh
ls -la ~/.zshrc ~/.tmux.conf
alias
which fzf eza
```

---

## stow-wrap.sh 使用說明

```bash
./scripts/stow-wrap.sh zsh            # 部署套件
./scripts/stow-wrap.sh --dry-run zsh   # 預覽模式
./scripts/stow-wrap.sh --debug zsh     # 除錯模式
./scripts/stow-wrap.sh --list-ignore   # 列出忽略規則
./scripts/stow-wrap.sh -D zsh          # 移除套件 symlink
```

> `bin`、`claude`、`codex` 套件會自動以 `--no-folding` 模式部署（腳本內的 `NO_FOLDING_PKGS`），避免將目標目錄折疊為單一 symlink，確保非 dotfiles 管理的檔案不受影響。多套件混合執行時會自動拆分為獨立呼叫。
>
> 部署完成後，`config/shared/skills/` 內的共享 skills 會自動 symlink 至各 AI CLI 工具的 `~/.<tool>/skills/`（腳本內的 `AI_CLI_PKGS`，目前為 `claude`、`codex`）；工具專屬 skill 優先，不會被覆蓋。`bin` 雖同為 no-folding 套件但不參與 skills 注入。`shared` 不是合法的套件名稱，傳入會直接報錯。

### `--no-folding` 為什麼必要

stow 預設會做 directory folding：若目標目錄在 `$HOME` 尚不存在，stow 不會逐檔建 symlink，而是直接把整個目錄做成一個指向 repo 的 symlink。之後任何寫入該目錄的檔案都會實際落在 dotfiles repo 內。

實際案例：曾有一個 `bin` 套件（放 `cmux-notify`）對應 `~/.local/bin/`，但 `~/.local/` 同時是 uv、Claude Code installer 等工具的安裝位置。`~/.local` 被折疊成 `~/.local -> dotfiles/config/bin/.local` 後，這些工具安裝的內容累積到 1.5 GB 全部落在 repo 內。該套件已隨 `cmux-notify` 一併移除，但教訓保留於此。

判斷準則：**只要套件的目標路徑或其上層目錄可能被 dotfiles 以外的程式寫入，就要加進 `NO_FOLDING_PKGS`。**

> 同理，`.gitignore` 不要使用 `*.local` 這類樣式 —— gitignore 的 `*` 可匹配零字元，會連名為 `.local` 的目錄整棵樹一起忽略，使上述污染在 `git status` 完全隱形。

## Zsh 設定架構

```
~/.zshrc                    ← Stow symlink，最小化 loader
├── direnv 預載              ← 在 instant prompt 前完成首次 .envrc 載入，避免 p10k 警告
├── p10k instant prompt     ← 最頂端載入，確保 prompt 即時顯示
└── source zshrc.d/*.zsh    ← 依檔名順序載入以下模組
    ├── 00-paths.zsh        ← PATH 設定（$HOME/bin、$HOME/.local/bin）
    ├── 01-env.zsh          ← 環境變數（Powerline、NVM、Pyenv、ripgrep）
    ├── 02-omz.zsh          ← Oh-My-Zsh 框架、主題、plugins
    ├── 10-functions.zsh    ← 載入 functions.d/*.sh 輔助函式
    ├── 20-aliases.zsh      ← 條件式別名（htop、bat、eza、tmux）
    ├── 30-fzf.zsh          ← FZF 模糊搜尋（色彩、fd、preview、rfv）
    ├── 31-zoxide.zsh       ← Zoxide 智慧目錄跳轉
    ├── 32-direnv.zsh       ← direnv 目錄式環境變數自動載入（須先 brew install direnv）
    ├── 35-p10k.zsh         ← 載入 ~/.p10k.zsh（各機器獨立）
    ├── 36-p10k-theme.zsh   ← Gruvbox 色彩主題覆寫
    └── 90-local.zsh        ← 機器專屬設定（不納入版控）
```

每個模組使用 guard 變數（不 export）防止同一 shell 內重複載入，不會影響 tmux 等子 shell 的初始化。

## AI CLI 工具管理

### 系統提示

兩個工具各自維護獨立的系統提示檔，皆透過 stow 管理。目前內容相同，可依不同 LLM 特性分別微調。

### Skills（共享技能）

`config/shared/skills/` 是所有 AI CLI 工具共用 skills 的唯一來源。部署時 `stow-wrap.sh` 自動將每個 skill 目錄 symlink 到各工具的 `~/.<tool>/skills/<skill>`，無需手動同步。

若特定工具需要專屬 skill，將其放入 `config/<tool>/.<tool>/skills/<skill>/`；該目錄下的 skill 由既有 promote 流程優先處理，不會被共享版本覆蓋。

新增 / 修改共享 skill 只需操作 `config/shared/skills/`，重新執行 `./scripts/stow-wrap.sh <AI 工具套件>` 即可生效。

### cmux 通知 Hooks

**由 cmux 自行處理，dotfiles 不再維護通知腳本。**

| 工具        | 安裝方式                                       | 產生的檔案                              |
| ----------- | ---------------------------------------------- | --------------------------------------- |
| Claude Code | cmux Claude wrapper 自動注入，無須設定         | 無（wrapper 動態注入）                  |
| 其他 agent  | `cmux hooks setup <agent>`                     | 各 agent 自己的 hook 檔（cmux 管理）    |

Claude Code 只要 cmux 設定中 `automation.claudeCodeIntegration` 為 `true` 即生效：cmux 用
wrapper 包住 `claude` 執行檔（PATH 最前面的 `cmux-cli-shims/`），啟動時動態注入自己的 hooks，
提供 running/idle/needsInput 狀態、Feed 審批、session restore 與 `PushNotification` 橋接。

其他 agent（`codex`、`opencode`、`gemini` 等）用 `cmux hooks setup` 安裝，cmux 會寫入該 agent
自己的設定檔（Codex 為 `~/.codex/hooks.json` 與 `config.toml`）。**這些檔案由 cmux 管理，不納入
dotfiles**——否則 cmux 更新格式時 repo 內的手寫版本會悄悄失效。

> 歷史：先前由 dotfiles 維護一支 `cmux-notify` 腳本供各工具呼叫，因 cmux 變更 socket 路徑
> （`/tmp/cmux.sock` → `~/.local/state/cmux/cmux-<uid>.sock`）而靜默失效。既然 cmux 已內建整合，
> 該腳本與其所屬的 `bin` 套件已一併移除。細節見 `cmux docs agents`。

#### Claude Code Telegram 完成通知（`cc-notify.sh`）

`claude` 套件另含 `~/.config/claude/cc-notify.sh`（由 stow 部署為 symlink），在 Claude Code
「工作真正完成」時發一則 Telegram 訊息。設計為 trailing-edge idle debounce：主 agent 閒置
`CC_NOTIFY_IDLE_WINDOW` 秒後才發，任何後續活動（新 prompt、工具呼叫、subagent 結束）都會
取消待發通知，因此多 subagent／多 turn 的工作會 collapse 成單一通知。相關 hooks
（`UserPromptSubmit`/`PreToolUse`/`SubagentStop`/`Stop`）已寫入 `settings.json.example`，由 sync 合併。

設定：複製 `~/.config/claude/telegram.env.example` 為 `telegram.env` 並填入 `TELEGRAM_BOT_TOKEN`、
`TELEGRAM_CHAT_ID`（此檔含 secret，不納入版控）；可選用 `CC_NOTIFY_IDLE_WINDOW`（預設 25s）與
`CC_NOTIFY_MIN_SECONDS`（預設 30s，主 turn 短於此不通知）。未設定 `telegram.env` 時腳本靜默略過。

#### Claude Code Output Styles

`claude` 套件含 `config/claude/.claude/output-styles/`，由 stow 以 `--no-folding` 逐檔 symlink
到 `~/.claude/output-styles/`，因此 Claude Code 自己在該目錄產生的 style 不受影響。目前收錄：

| Style  | 用途                                                                     |
| ------ | ------------------------------------------------------------------------ |
| `eli5` | 極簡回覆，只講做了什麼、成不成功、下一步做什麼                           |
| `ste`  | 受控技術語言（ASD-STE100 Issue 9 紀律）：單一詞義、短句、主動語態、零歧義 |

新增 style：在 `config/claude/.claude/output-styles/` 放入 `<name>.md`（frontmatter 需含
`name`、`description`），再跑 `./scripts/stow-wrap.sh claude`。切換用 `/output-style`。

#### Claude Code Mods

`claude-mods` 套件收錄 `config/claude-mods/.claude/mods/<mod>/`，由 `CLAUDE_CODE_PLUGIN_DIRS`
（`settings.json.example` 的 `env`，經 `sync-ai-cli-settings.sh` 合併）載入。目前收錄 `tool-calls`、
`slime-band`、`skill-bar`。

此套件**刻意不用** `--no-folding`：plugin loader 讀 `hooks/hooks.json` 時不跟隨 symlink，且 module
realpath 落在 plugin 目錄外會被判為 path traversal，逐檔 symlink 會讓 mod 整個載入失敗。folding 後
`~/.claude/mods/<mod>` 是指向 repo 的目錄 symlink，engine 產生的 `.claude-plugin/types/` 會寫進 repo
（已 gitignore）。

新增 mod：在 `config/claude-mods/.claude/mods/` 建目錄、把路徑加進 `settings.json.example` 的
`CLAUDE_CODE_PLUGIN_DIRS`，再跑 `./scripts/stow-wrap.sh claude claude-mods`。驗證用
`claude plugin validate ~/.claude/mods/<mod>` 與 `claude plugin test ~/.claude/mods/<mod>`。

### 設定檔策略

各工具的設定檔（`config.toml`、`settings.json`、`config.json`）包含機器專屬內容，不納入版控，各機器獨立維護。

## 多機同步：移除不會自動傳播

`git pull` 只更新 repo 內的檔案，**無法撤銷既有部署**。從 repo 刪除一個檔案後，其他機器上仍會留下：

- stow 建立的 symlink（pull 後變成 broken symlink）
- `sync-ai-cli-settings.sh` 合併進 live `~/.claude/settings.json` 的項目（該腳本只增不減）
- 各工具自己快取的狀態（例如 Codex 的 `[hooks.state]` trusted hash）

因此凡是「下架」性質的變更，都在 `scripts/` 下附一支 `migrate-<YYYYMMDD>-<描述>.sh`，記錄該次變更需要在其他機器上執行的清理步驟。慣例：

- 支援 `--dry-run`，預覽時不得寫入任何檔案
- 冪等：在已清理或全新的機器上執行應為 no-op
- 修改前先備份（`cp -p` 保留權限），並在輸出中告知備份路徑
- 需要大量資料搬移或有風險的操作只偵測並提示，不自動執行

現有腳本：

```bash
./scripts/migrate-20260812-remove-cmux-notify.sh --dry-run   # 預覽
./scripts/migrate-20260812-remove-cmux-notify.sh             # 執行
```

> 若尚未 pull，優先在 pull **之前**執行 `./scripts/stow-wrap.sh -D <套件>` 解除部署——套件目錄一旦被 pull 刪除，`stow -D` 就無法再運作。

## 新增套件

1. 在 `config/` 下建立新目錄，結構反映 `$HOME` 下的相對路徑
2. 將設定檔放入對應位置
3. 若目標路徑或其上層目錄可能被 dotfiles 以外的程式寫入，將套件名加入 `scripts/stow-wrap.sh` 的 `NO_FOLDING_PKGS`（原因見上方「`--no-folding` 為什麼必要」）
4. 執行 `./scripts/stow-wrap.sh <套件名>` 部署
5. 部署後確認目標目錄本身仍是真實目錄而非 symlink：`ls -ld ~/<目標目錄>`
6. 更新此 README 的套件總覽表格
