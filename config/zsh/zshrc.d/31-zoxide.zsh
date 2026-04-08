#!/usr/bin/env zsh

# zshrc.d/31-zoxide.zsh
# Purpose: Zoxide 智慧目錄跳轉初始化
#
# 可透過 DISABLE_ZOXIDE=1 環境變數停用。

[[ -n ${_DOTFILES_ZOXIDE_LOADED:-} ]] && return
export _DOTFILES_ZOXIDE_LOADED=1

if [[ -z "$DISABLE_ZOXIDE" ]] && command -v zoxide >/dev/null 2>&1; then
  eval "$(zoxide init zsh)"
fi
