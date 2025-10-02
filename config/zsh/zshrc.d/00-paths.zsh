#!/usr/bin/env zsh

# zshrc.d/00-paths.zsh
# Purpose: centralized, minimal PATH and related environment fragment
#
# What this file is for
# - Provide a small, safe place to set PATH additions and other lightweight path
#   related environment variables used by the dotfiles repository.
# - Keep the logic simple and idempotent so sourcing this file multiple times
#   (or in different shells) won't duplicate entries or cause side effects.
#
# Usage notes
# - This file intentionally only contains minimal, optional examples. Uncomment
#   and adapt the example below to enable it in your environment.
# - To override defaults, export variables (e.g. PATH) before this file is sourced.
# - Heavy or interactive-only PATH logic should live in an interactive-specific
#   config to avoid slowing non-interactive shells.

[[ -n ${_DOTFILES_PATHS_LOADED:-} ]] && return
export _DOTFILES_PATHS_LOADED=1

# 並避免重複加入相同路徑。
# if [[ ":$PATH:" != *":$HOME/.local/bin:"* ]]; then
#   export PATH="$HOME/.local/bin:$PATH"
# fi
