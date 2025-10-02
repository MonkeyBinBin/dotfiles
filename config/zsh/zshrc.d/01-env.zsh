# zshrc.d/01-env.zsh
# Purpose: lightweight, defensive environment defaults for optional tooling
#
# What this file does
# - Sets a safe default for a tooling directory environment variable when not already set
#   (the variable named below is `NVM_DIR` for historical reasons). It intentionally
#   avoids failing if the tooling is not present on the system.
# - Conditionally sources associated helper scripts only when the target files exist.
#   This prevents errors in CI, containers, or minimal environments where the tool
#   isn't installed.
# - Keeps initialization minimal and fast so it can be sourced in both interactive and
#   non-interactive shells without causing delays or side effects.
#
# Usage notes
# - To override the default directory, export the env var (e.g. `export NVM_DIR="..."`)
#   before this file is sourced.
# - Avoid placing heavy, interactive-only configuration here; keep that in an
#   interactive-only config to prevent slowing non-interactive shells.
#
# Example (the actual sourcing lines follow below):
#   export NVM_DIR="$HOME/.nvm"
#   [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
#   [ -s "$NVM_DIR/bash_completion" ] && \. "$NVM_DIR/bash_completion"

export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"  # This loads nvm
[ -s "$NVM_DIR/bash_completion" ] && \. "$NVM_DIR/bash_completion"  # This loads nvm bash_completion
