#!/usr/bin/env zsh

# zshrc.d/02-omz.zsh
# Purpose: Oh-My-Zsh 框架初始化與主題設定
#
# 載入 Oh-My-Zsh 框架、設定 Powerlevel10k 主題與啟用的 plugins。
# 使用檔案存在檢查保護，在未安裝 Oh-My-Zsh 的環境中不會報錯。

[[ -n ${_DOTFILES_OMZ_LOADED:-} ]] && return
_DOTFILES_OMZ_LOADED=1

export ZSH="${ZSH:-$HOME/.oh-my-zsh}"

# 僅在 Oh-My-Zsh 已安裝時才進行設定與載入
if [[ -f "$ZSH/oh-my-zsh.sh" ]]; then
  ZSH_THEME="powerlevel10k/powerlevel10k"
  POWERLEVEL9K_MODE='nerdfont-complete'

  plugins=(
    git
    macos
    sudo
    extract
    colored-man-pages
    command-not-found
    zsh-autosuggestions
    zsh-syntax-highlighting
  )

  source "$ZSH/oh-my-zsh.sh"
fi
