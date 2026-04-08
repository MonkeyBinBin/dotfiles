#!/usr/bin/env zsh

# zshrc.d/20-aliases.zsh
# Purpose: small set of safe, conditional aliases
#
# What this file does
# - Defines a handful of convenience aliases when the corresponding tools are
#   available on the system. Each alias is guarded by a `command -v` check to avoid
#   creating broken aliases in minimal environments.
# - Provides tmux-related helper aliases only if the `start_tmux` function is
#   already defined (keeps alias footprint small when tmux helpers are not loaded).
#
# Usage notes
# - Aliases are safe to source in interactive shells; they won't be created if the
#   underlying commands are missing.
# - To change behavior, override by defining your own aliases after this file is
#   sourced.

[[ -n ${_DOTFILES_ALIASES_LOADED:-} ]] && return
export _DOTFILES_ALIASES_LOADED=1

alias reload-zsh="source ~/.zshrc"

if command -v htop >/dev/null 2>&1; then
  alias top="htop"
fi

if command -v bat >/dev/null 2>&1; then
  alias cat='bat'
fi

if command -v eza >/dev/null 2>&1; then
  alias ls="eza -alhgo --group-directories-first"
fi

# Only define tmux helper aliases if the start_tmux function was already loaded
# (this keeps aliases out of the environment when the functions file wasn't sourced)
if typeset -f start_tmux >/dev/null 2>&1; then
  # Public command: tmuxd -> delegates to the start_tmux function
  tmuxd() { start_tmux "$@"; }
  alias st='tmuxd'
fi

if command -v npm >/dev/null 2>&1; then
  alias install-agent-cli="npm install -g @openai/codex @google/gemini-cli @github/copilot @anthropic-ai/claude-code"
fi
