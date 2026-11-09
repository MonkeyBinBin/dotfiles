# zshrc.d/01-env.zsh
# Purpose: 輕量的環境變數與工具初始化
#
# 設定各種開發工具的環境變數，每個工具都有防禦性檢查，
# 未安裝時不會報錯。適用於 interactive 與 non-interactive shell。

[[ -n ${_DOTFILES_ENV_LOADED:-} ]] && return
_DOTFILES_ENV_LOADED=1

# ── Powerline 顯示設定 ──
POWERLINE_HIDE_HOST_NAME="true"
POWERLINE_DISABLE_RPOMPT="true"
POWERLINE_FULL_CURRENT_PATH="true"

# ── NVM (Node.js 版本管理) ──
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
[ -s "$NVM_DIR/bash_completion" ] && \. "$NVM_DIR/bash_completion"

# ── Ripgrep 設定檔路徑 ──
if [[ -f "$HOME/.ripgreprc" ]]; then
  export RIPGREP_CONFIG_PATH="$HOME/.ripgreprc"
fi

# ── Pyenv (Python 版本管理) ──
if [[ -d "$HOME/.pyenv" ]]; then
  export PYENV_ROOT="$HOME/.pyenv"
  command -v pyenv >/dev/null || export PATH="$PYENV_ROOT/bin:$PATH"
  eval "$(pyenv init -)"
fi

# ── Rust (Cargo / Rustup) ──
if [[ -f "$HOME/.cargo/env" ]]; then
  . "$HOME/.cargo/env"
fi

# ── 預設編輯器（git、Claude Code Ctrl+G、fzf、start-tmux 共用）──
if (( $+commands[nvim] )); then
  export EDITOR="nvim"
else
  export EDITOR="vim"
fi

# ── Claude Code mods ──
# Not set in settings.json because its env overrides the shell. Inside Herdr (every
# herdr-core terminal has HC_TERMINAL_ID) only the helm-* mods made for its sub
# interface load; the RPG set clashes with its UI. key-hints loads in both.
if [[ -n ${HC_TERMINAL_ID:-} ]]; then
  export CLAUDE_CODE_PLUGIN_DIRS="$HOME/.claude/mods/helm-bridge:$HOME/.claude/mods/helm-spinner:$HOME/.claude/mods/key-hints"
else
  export CLAUDE_CODE_PLUGIN_DIRS="$HOME/.claude/mods/rpg-hud:$HOME/.claude/mods/slime-band:$HOME/.claude/mods/skill-bar:$HOME/.claude/mods/rpg-spinner:$HOME/.claude/mods/rpg-battle:$HOME/.claude/mods/rpg-prompt:$HOME/.claude/mods/rpg-quest:$HOME/.claude/mods/key-hints"
fi
