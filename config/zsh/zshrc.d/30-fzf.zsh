#!/usr/bin/env zsh

# zshrc.d/30-fzf.zsh
# Purpose: FZF 模糊搜尋工具的完整設定
#
# 包含色彩主題、fd 整合、preview 函式、自動補全函式。
# 依賴 fzf、fd、bat、eza（皆為 conditional，缺少時會 graceful fallback）。

[[ -n ${_DOTFILES_FZF_LOADED:-} ]] && return
_DOTFILES_FZF_LOADED=1

# 僅在 interactive shell 中載入
[[ $- != *i* ]] && return

# 舊版 fzf 安裝方式的相容載入（已由下方 fzf --zsh 取代，僅在新版不可用時才 fallback）
# [ -f ~/.fzf.zsh ] && source ~/.fzf.zsh

# 新版 fzf shell 整合
command -v fzf >/dev/null && eval "$(fzf --zsh)"

# ── 色彩主題 ──
_fzf_fg="#CBE0F0"
_fzf_bg="#011628"
_fzf_bg_hl="#143652"
_fzf_purple="#B388FF"
_fzf_blue="#06BCE4"
_fzf_cyan="#2CF9ED"

export FZF_DEFAULT_OPTS="--color=fg:${_fzf_fg},bg:${_fzf_bg},hl:${_fzf_purple},fg+:${_fzf_fg},bg+:${_fzf_bg_hl},hl+:${_fzf_purple},info:${_fzf_blue},prompt:${_fzf_cyan},pointer:${_fzf_cyan},marker:${_fzf_cyan},spinner:${_fzf_cyan},header:${_fzf_cyan}"

unset _fzf_fg _fzf_bg _fzf_bg_hl _fzf_purple _fzf_blue _fzf_cyan

# ── fd 整合（需要 fd 已安裝）──
if command -v fd >/dev/null; then
  export FZF_DEFAULT_COMMAND="fd --hidden --strip-cwd-prefix --exclude .git"
  export FZF_CTRL_T_COMMAND="$FZF_DEFAULT_COMMAND"
  export FZF_ALT_C_COMMAND="fd --type=d --hidden --strip-cwd-prefix --exclude .git"

  _fzf_compgen_path() {
    fd --hidden --exclude .git . "$1"
  }

  _fzf_compgen_dir() {
    fd --type=d --hidden --exclude .git . "$1"
  }
fi

# ── fzf-git 整合（選用，需手動安裝 fzf-git.sh）──
[[ -f ~/fzf-git.sh/fzf-git.sh ]] && source ~/fzf-git.sh/fzf-git.sh

# ── Preview 設定 ──
_show_file_or_dir_preview="if [ -d {} ]; then eza --tree --color=always {} | head -200; else bat -n --color=always --line-range :500 {}; fi"

export FZF_CTRL_T_OPTS="--preview '$_show_file_or_dir_preview'"
export FZF_ALT_C_OPTS="--preview 'eza --tree --color=always {} | head -200'"

# ── 自動補全函式 ──
_fzf_comprun() {
  local command=$1
  shift

  case "$command" in
    cd)           fzf --preview 'eza --tree --color=always {} | head -200' "$@" ;;
    export|unset) fzf --preview "eval 'echo \${}'"         "$@" ;;
    ssh)          fzf --preview 'dig {}'                   "$@" ;;
    *)            fzf --preview "$_show_file_or_dir_preview" "$@" ;;
  esac
}

unset _show_file_or_dir_preview

# ── ripgrep + fzf 互動搜尋 ──
# rfv <keyword> — 用 rg 搜尋文字，fzf 即時預覽，Enter 後開啟編輯器跳到該行
if command -v rg >/dev/null; then
  rfv() {
    rg --color=always --line-number --no-heading "$@" |
      fzf --ansi \
          --delimiter : \
          --preview 'bat --color=always --highlight-line {2} {1}' \
          --preview-window '~3:+{2}+3/2' |
      awk -F: '{print "+"$2, $1}' |
      xargs -o ${EDITOR:-vim}
  }
fi
