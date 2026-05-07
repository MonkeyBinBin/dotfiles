#!/usr/bin/env zsh

# zshrc.d/32-direnv.zsh
# Purpose: direnv 目錄式環境變數自動載入（註冊 precmd / chpwd hook）
#
# 註：首次 .envrc 載入由 .zshrc 在 p10k instant prompt 之前完成，
#     避免 instant prompt 警告。本檔僅負責註冊持續性的目錄監聽 hook。
#
# 可透過 DISABLE_DIRENV=1 環境變數停用。

[[ -n ${_DOTFILES_DIRENV_LOADED:-} ]] && return
_DOTFILES_DIRENV_LOADED=1

if [[ -z "${DISABLE_DIRENV:-}" ]] && command -v direnv >/dev/null 2>&1; then
  eval "$(direnv hook zsh)"
fi
