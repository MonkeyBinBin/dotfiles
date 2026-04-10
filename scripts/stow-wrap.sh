#!/usr/bin/env bash
set -euo pipefail

# Wrapper for GNU Stow
# - Reads .stow-global-ignore (repo or $HOME) and turns lines into --ignore=PATTERN
# - Always uses repo's `config/` as the stow -d source directory and `$HOME` as
#   the stow -t target directory. If `config/` is missing or contains no package
#   directories, the script exits with an error.
#
# Usage examples:
#   chmod +x scripts/stow-wrap.sh
#   # stow the 'tmux' package located at repo/config/tmux
#   ./scripts/stow-wrap.sh tmux
#
#   # dry-run: show the stow command without executing
#   ./scripts/stow-wrap.sh --dry-run tmux
#
#   # debug: print ignore file/patterns and final command, then run
#   ./scripts/stow-wrap.sh --debug tmux
#
# Supported wrapper flags (not forwarded to stow):
#   --dry-run, -n   : print the stow command and exit
#   --debug         : print debugging information

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
IGNORE_FILES=("$REPO_ROOT/.stow-global-ignore" "$HOME/.stow-global-ignore")

DRY_RUN=0
DEBUG=0
LIST_IGNORE=0

stow_args=()

# Parse wrapper-only flags; forward remaining args to stow
while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run|-n)
      DRY_RUN=1
      shift
      ;;
    --debug)
      DEBUG=1
      shift
      ;;
    --list-ignore)
      LIST_IGNORE=1
      shift
      ;;
    --)
      shift
  # everything after -- is passed to stow as-is
      while [[ $# -gt 0 ]]; do
        stow_args+=("$1")
        shift
      done
      ;;
    *)
      stow_args+=("$1")
      shift
      ;;
  esac
done

# collect --ignore args from the first existing ignore file
IGNORE_ARGS=()
USED_IGNORE_FILE=""
for f in "${IGNORE_FILES[@]}"; do
  if [[ -f "$f" ]]; then
    USED_IGNORE_FILE="$f"
    while IFS= read -r line || [[ -n "$line" ]]; do
      # remove trailing CR if present
      line="${line%%$'\r'}"
      # trim whitespace using sed (portable)
      line="$(printf '%s' "$line" | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//')"
      # skip empty lines and comments
      if [[ -z "$line" ]]; then
        continue
      fi
      if [[ "$line" =~ ^# ]]; then
        continue
      fi
      IGNORE_ARGS+=("--ignore=$line")
    done < "$f"
    break
  fi
done

# If stow is not available, print friendly advice and exit
if ! command -v stow >/dev/null 2>&1; then
  cat <<'MSG' >&2
Error: GNU stow not found in PATH.

Please install stow and re-run this script. On macOS with Homebrew:
  brew install stow

On Debian/Ubuntu:
  sudo apt-get install stow

If you have stow installed but it's not in your PATH, adjust your PATH or call stow directly.
MSG
  exit 2
fi

# Build final command array (stow + ignore patterns + forwarded args)
cmd=(stow)
if [[ ${#IGNORE_ARGS[@]} -gt 0 ]]; then
  cmd+=("${IGNORE_ARGS[@]}")
fi
if [[ ${#stow_args[@]} -gt 0 ]]; then
  cmd+=("${stow_args[@]}")
fi

# Use repo config/ as stow -d and validate it contains at least one package
CHOSEN_CONFIG_DIR="$REPO_ROOT/config"
if [[ ! -d "$CHOSEN_CONFIG_DIR" ]]; then
  echo "Error: config directory not found: $CHOSEN_CONFIG_DIR" >&2
  echo "Create 'config/' with at least one stow package." >&2
  exit 1
fi

# Ensure there is at least one subdirectory (package) under config/
found_pkg=0
shopt -s nullglob
for d in "$CHOSEN_CONFIG_DIR"/*/; do
  if [[ -d "$d" ]]; then
    found_pkg=1
    break
  fi
done
shopt -u nullglob

if [[ $found_pkg -eq 0 ]]; then
  echo "Error: no stow packages found in $CHOSEN_CONFIG_DIR" >&2
  echo "Add a package directory (e.g. 'tmux/') inside config/." >&2
  exit 1
fi

# 這些套件的目標目錄可能同時存放非 dotfiles 管理的內容，
# 使用 --no-folding 避免 stow 將整個上層目錄折疊為單一 symlink。
# 因為 --no-folding 是 stow 全域選項，需要將這些套件拆成獨立呼叫
NO_FOLDING_PKGS=(claude codex copilot gemini)

# 將套件分為需要 --no-folding 與一般兩組
no_folding_args=()
normal_args=()
stow_flags=()

for arg in "${stow_args[@]}"; do
  if [[ "$arg" == -* ]]; then
    stow_flags+=("$arg")
    continue
  fi
  is_no_folding=0
  for nf in "${NO_FOLDING_PKGS[@]}"; do
    if [[ "$arg" == "$nf" ]]; then
      is_no_folding=1
      break
    fi
  done
  if [[ $is_no_folding -eq 1 ]]; then
    no_folding_args+=("$arg")
  else
    normal_args+=("$arg")
  fi
done

# 共用的基礎指令參數
base_cmd=(stow -d "$CHOSEN_CONFIG_DIR" -t "$HOME")
if [[ ${#IGNORE_ARGS[@]} -gt 0 ]]; then
  base_cmd+=("${IGNORE_ARGS[@]}")
fi

# 輔助函式：印出 debug 資訊
print_debug() {
  local label="$1"
  shift
  echo "[stow-wrap] $label: $*" >&2
}

if [[ $DEBUG -eq 1 ]]; then
  echo "[stow-wrap] Using ignore file: ${USED_IGNORE_FILE:-<none>}" >&2
  if [[ -n "$CHOSEN_CONFIG_DIR" && -d "$CHOSEN_CONFIG_DIR" ]]; then
    echo "[stow-wrap] chosen config dir: $CHOSEN_CONFIG_DIR" >&2
  fi
  if [[ ${#IGNORE_ARGS[@]} -gt 0 ]]; then
    echo "[stow-wrap] ignore patterns:" >&2
    for ia in "${IGNORE_ARGS[@]}"; do
      echo "  $ia" >&2
    done
  fi
  if [[ ${#no_folding_args[@]} -gt 0 ]]; then
    print_debug "no-folding packages" "${no_folding_args[*]}"
  fi
  if [[ ${#normal_args[@]} -gt 0 ]]; then
    print_debug "normal packages" "${normal_args[*]}"
  fi
fi

if [[ $LIST_IGNORE -eq 1 ]]; then
  if [[ ${#IGNORE_ARGS[@]} -eq 0 ]]; then
    echo "No ignore patterns loaded (no .stow-global-ignore found)."
  else
    echo "Loaded ignore patterns:"
    for ia in "${IGNORE_ARGS[@]}"; do
      echo "  ${ia#--ignore=}"
    done
  fi
  exit 0
fi

# 執行一般套件
# 注意：macOS 內建 bash 3.2 在 set -u 下展開空陣列會報 unbound variable，
# 因此使用 ${arr[@]+"${arr[@]}"} 的安全展開語法
if [[ ${#normal_args[@]} -gt 0 ]]; then
  normal_cmd=("${base_cmd[@]}" ${stow_flags[@]+"${stow_flags[@]}"} "${normal_args[@]}")
  if [[ $DEBUG -eq 1 ]]; then
    print_debug "normal command" "${normal_cmd[*]}"
  fi
  if [[ $DRY_RUN -eq 1 ]]; then
    printf '%s ' "${normal_cmd[@]}"
    printf '\n'
  else
    "${normal_cmd[@]}"
  fi
fi

# 執行需要 --no-folding 的套件（獨立呼叫以避免影響一般套件）
if [[ ${#no_folding_args[@]} -gt 0 ]]; then
  nf_cmd=("${base_cmd[@]}" --no-folding ${stow_flags[@]+"${stow_flags[@]}"} "${no_folding_args[@]}")
  if [[ $DEBUG -eq 1 ]]; then
    print_debug "no-folding command" "${nf_cmd[*]}"
  fi
  if [[ $DRY_RUN -eq 1 ]]; then
    printf '%s ' "${nf_cmd[@]}"
    printf '\n'
  else
    "${nf_cmd[@]}"
  fi
fi
