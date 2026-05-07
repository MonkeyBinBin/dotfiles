#!/usr/bin/env zsh

# zshrc.d/32-direnv.zsh
# Purpose: direnv 目錄式環境變數自動載入
#
# 可透過 DISABLE_DIRENV=1 環境變數停用。

[[ -n ${_DOTFILES_DIRENV_LOADED:-} ]] && return
_DOTFILES_DIRENV_LOADED=1

if [[ -z "${DISABLE_DIRENV:-}" ]] && command -v direnv >/dev/null 2>&1; then
  eval "$(direnv hook zsh)"
fi
