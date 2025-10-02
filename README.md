# dotfiles Management with GNU Stow

This repository contains my personal configuration files (dotfiles) managed using GNU Stow. The goal is to keep my configurations organized and easily deployable across different machines.

## Prerequisites

- GNU Stow: Make sure you have GNU Stow installed on your system. You can usually install it via your package manager.

  ```bash
  # For MacOS using Homebrew
  brew install stow
  # For Debian/Ubuntu
  sudo apt-get install stow
  ```

  ## Using a repository-level ignore file with GNU Stow

  This repository includes a `.stow-global-ignore` file with common ignore
  patterns (regular expressions). GNU Stow itself accepts `--ignore=PATTERN`
  arguments but doesn't read a dedicated ignore file automatically.

  To make stowing convenient this repo includes a small wrapper script at
  `scripts/stow-wrap.sh` which:

  - Reads `.stow-global-ignore` (or `$HOME/.stow-global-ignore`) and converts
    non-empty, non-comment lines into `--ignore=PATTERN` arguments for stow.
  - Always uses the repository `config/` directory as stow's `-d` (target
    directory). The script will exit with an error if `config/` is missing or
    contains no package subdirectories.

  Quick examples:

  ```bash
  # make the wrapper executable
  chmod +x scripts/stow-wrap.sh

  # Stow the 'tmux' package located at repo/config/tmux
  ./scripts/stow-wrap.sh tmux

  # Dry-run: show the stow command without executing
  ./scripts/stow-wrap.sh --dry-run tmux

  # Debug: show ignore file, patterns and final command, then run
  ./scripts/stow-wrap.sh --debug tmux
  ```

  Notes:

  - Lines starting with `#` and empty lines in `.stow-global-ignore` are ignored.
  - Patterns are regular expressions passed directly to stow's `--ignore`.
  - The wrapper prints installation guidance if `stow` is not found.
