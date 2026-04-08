# Dotfiles — GNU Stow 管理

使用 GNU Stow 管理個人設定檔，方便在不同機器上快速部署一致的開發環境。

## 套件總覽

| 套件          | 說明                              | 安裝後的路徑                                     |
| ------------- | --------------------------------- | ------------------------------------------------ |
| `bin`         | 共用腳本（cmux-notify 等）        | `~/.local/bin/`                                  |
| `zsh`         | Zsh shell 設定                    | `~/.zshrc`、`~/zshrc.d/` → `config/zsh/zshrc.d/` |
| `tmux`        | tmux 終端多工器設定               | `~/.tmux.conf`                                   |
| `ghostty`     | Ghostty 終端模擬器設定            | `~/.config/ghostty/config`                       |
| `cmux`        | Cmux 終端機設定                   | `~/.config/cmux/`                                |
| `claude`      | Claude Code 系統提示 + hooks 範本 | `~/.claude/CLAUDE.md`                            |
| `codex`       | Codex CLI 系統提示 + hooks 設定   | `~/.codex/AGENTS.md`、`hooks.json`               |
| `gemini`      | Gemini CLI 系統提示 + hooks 範本  | `~/.gemini/GEMINI.md`                            |
| `copilot`     | Copilot CLI 系統提示 + hooks 設定 | `~/.copilot/instructions.md`、`hooks.json`       |
| `hammerspoon` | Hammerspoon macOS 自動化          | `~/.hammerspoon/`                                |
| `ripgrep`     | ripgrep 搜尋工具設定              | `~/.ripgreprc`                                   |

---

## 全新電腦安裝步驟

### 1. 安裝必要工具

```bash
# Homebrew
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# GNU Stow
brew install stow

# CLI 增強工具
brew install eza bat htop fd fzf ripgrep zoxide jq

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

# Powerlevel10k 主題
git clone --depth=1 https://github.com/romkatv/powerlevel10k.git \
  ${ZSH_CUSTOM:-$HOME/.oh-my-zsh/custom}/themes/powerlevel10k
```

> 其餘 plugins（`git`、`macos`、`sudo`、`extract`、`colored-man-pages`、`command-not-found`）為 Oh-My-Zsh 內建。

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
         ~/.config/ghostty/config ~/.config/cmux/settings.json \
         ~/.claude/CLAUDE.md ~/.codex/AGENTS.md ~/.codex/hooks.json \
         ~/.gemini/GEMINI.md \
         ~/.copilot/instructions.md ~/.copilot/hooks.json \
         ~/.hammerspoon/init.lua ~/.local/bin/cmux-notify; do
  [ -e "$f" ] && mkdir -p ~/.dotfiles-backup/"$(dirname "${f#$HOME/}")" \
    && mv "$f" ~/.dotfiles-backup/"${f#$HOME/}"
done

# 部署所有套件
chmod +x scripts/stow-wrap.sh
for pkg in bin zsh tmux ghostty cmux claude codex gemini copilot hammerspoon ripgrep; do
  ./scripts/stow-wrap.sh "$pkg"
done
```

### 8. 設定 Powerlevel10k

```bash
p10k configure
```

> `~/.p10k.zsh` 由 p10k 精靈產生，不納入版控。專案中的 `36-p10k-theme.zsh` 會自動覆寫 Gruvbox 色彩主題。

### 9. 設定 AI CLI 工具的 cmux 通知

Codex 和 Copilot 的 `hooks.json` 已由 stow 部署，按以下步驟完成設定：

- **Codex CLI**：在 `~/.codex/config.toml` 啟用 feature flag：
  ```toml
  [features]
  codex_hooks = true
  ```
- **Copilot CLI**：部署後即生效，無需額外設定
- **Claude Code**：參考 repo 中的 `config/claude/.claude/settings.json.example`，將 hooks 區塊手動合併到 `~/.claude/settings.json`
- **Gemini CLI**：參考 repo 中的 `config/gemini/.gemini/settings.json.example`，將 hooks 區塊手動合併到 `~/.gemini/settings.json`

> Claude Code 和 Gemini CLI 的 `settings.json` 含機器專屬設定（plugins、MCP servers），無法直接由 stow 管理，因此提供 `.example` 範本供手動合併。

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
which fzf eza cmux-notify
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

## Zsh 設定架構

```
~/.zshrc                    ← Stow symlink，最小化 loader
├── p10k instant prompt     ← 最頂端載入，確保 prompt 即時顯示
└── source zshrc.d/*.zsh    ← 依檔名順序載入以下模組
    ├── 00-paths.zsh        ← PATH 設定（$HOME/bin、$HOME/.local/bin）
    ├── 01-env.zsh          ← 環境變數（Powerline、NVM、Pyenv、ripgrep）
    ├── 02-omz.zsh          ← Oh-My-Zsh 框架、主題、plugins
    ├── 10-functions.zsh    ← 載入 functions.d/*.sh 輔助函式
    ├── 20-aliases.zsh      ← 條件式別名（htop、bat、eza、tmux）
    ├── 30-fzf.zsh          ← FZF 模糊搜尋（色彩、fd、preview、rfv）
    ├── 31-zoxide.zsh       ← Zoxide 智慧目錄跳轉
    ├── 35-p10k.zsh         ← 載入 ~/.p10k.zsh（各機器獨立）
    ├── 36-p10k-theme.zsh   ← Gruvbox 色彩主題覆寫
    └── 90-local.zsh        ← 機器專屬設定（不納入版控）
```

每個模組使用 guard 變數（不 export）防止同一 shell 內重複載入，不會影響 tmux 等子 shell 的初始化。

## AI CLI 工具管理

### 系統提示

四個工具各自維護獨立的系統提示檔，皆透過 stow 管理。目前內容相同，可依不同 LLM 特性分別微調。

### cmux 通知 Hooks

所有工具共用 `~/.local/bin/cmux-notify` 腳本，各工具透過參數傳入名稱：

| 工具        | Hook 設定                           | 管理方式                          |
| ----------- | ----------------------------------- | --------------------------------- |
| Claude Code | `settings.json.example`（手動合併） | settings.json 含機器專屬設定      |
| Codex CLI   | `hooks.json`（stow 管理）           | 需啟用 `codex_hooks` feature flag |
| Gemini CLI  | `settings.json.example`（手動合併） | settings.json 含機器專屬設定      |
| Copilot CLI | `hooks.json`（stow 管理）           | 部署後即生效                      |

### 設定檔策略

各工具的設定檔（`config.toml`、`settings.json`、`config.json`）包含機器專屬內容，不納入版控，各機器獨立維護。

## 新增套件

1. 在 `config/` 下建立新目錄，結構反映 `$HOME` 下的相對路徑
2. 將設定檔放入對應位置
3. 執行 `./scripts/stow-wrap.sh <套件名>` 部署
4. 更新此 README 的套件總覽表格
