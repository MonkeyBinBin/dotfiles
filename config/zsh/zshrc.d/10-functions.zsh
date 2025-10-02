#!/usr/bin/env zsh

# zshrc.d/10-functions.zsh
# Purpose: load interactive helper functions from functions.d
#
# What this file does
# - Ensures helper functions are loaded once per shell session.
# - Only proceeds in interactive shells to avoid polluting non-interactive
#   environments with interactive helpers.
# - Locates the dotfiles config directory and sources every script found in
#   `functions.d/` so helper functions are collected in a single place.
#
# Usage notes
# - Keep functions lightweight and idempotent. Heavy startup tasks should be
#   avoided or gated behind interactive checks inside the function files.
# - Function files may assume they're sourced from an interactive context.

[[ -n ${_DOTFILES_FUNCTIONS_LOADED:-} ]] && return
export _DOTFILES_FUNCTIONS_LOADED=1

# Only define interactive helpers in interactive shells
if [[ $- != *i* ]]; then
  return
fi

# Determine the zsh config directory (fallback to parent of this file if not set)
if [[ -z ${ZSH_CONFIG_DIR:-} ]]; then
  ZSH_CONFIG_DIR="$(cd "$(dirname "${(%):-%N}")/.." >/dev/null 2>&1 && pwd)"
fi

# Source all .sh files in functions.d (skip if none)
for __f in "${ZSH_CONFIG_DIR}/functions.d"/*.sh; do
  [[ -e $__f ]] || continue
  # shellcheck source=/dev/null
  source "$__f"
done

unset __f
