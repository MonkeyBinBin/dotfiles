#!/usr/bin/env bash

# functions.d/start-tmux.sh
# Purpose: small helper to create/attach tmux sessions with optional layouts
#
# What this script does
# - Provides a reusable `start_tmux` function (and CLI when executed directly)
#   that creates or attaches to named tmux sessions using simple layouts.
# - Defaults are conservative: it checks for tmux in PATH and uses minimal
#   startup actions to avoid unexpected side effects.
#
# Usage notes
# - The file can be sourced to expose `start_tmux` as a shell function, or
#   executed directly to run a one-off session command.
# - Keep the script idempotent and defensive: it does not assume tmux exists and
#   will return a non-zero exit code when tmux is unavailable.
# - CLI options are documented in the `usage` function below.

# 被 zsh source 時不能用 set -euo pipefail，否則 -u 會污染整個 shell
if [[ -z "${ZSH_VERSION:-}" ]]; then
  set -euo pipefail
fi

SCRIPT_NAME=$(basename "$0")

usage() {
    cat <<EOF
Usage: $SCRIPT_NAME [options] [session-name]

Options:
  -h          Show this help and exit
  -k          Kill existing session and recreate
  -l LAYOUT   Choose layout: minimal|full (default: minimal)

Examples:
  $SCRIPT_NAME             # create/attach 'develop' session
  $SCRIPT_NAME -k work     # kill and recreate session 'work'
  $SCRIPT_NAME -l full dev # create 'dev' session with full layout
EOF
}

start_tmux() {
    # Defaults
    local SESSION_NAME="develop"
    local LAYOUT="minimal"
    local KILL_EXISTING=false

    # Parse options
    while getopts ":hkl:" opt; do
        case "$opt" in
            h)
                usage
                exit 0
                ;;
            k)
                KILL_EXISTING=true
                ;;
            l)
                LAYOUT="$OPTARG"
                ;;
            :)
                echo "Option -$OPTARG requires an argument." >&2
                usage
                exit 2
                ;;
            ?)
                echo "Unknown option: -$OPTARG" >&2
                usage
                exit 2
                ;;
        esac
    done

    shift $((OPTIND -1))

    # If a session name is provided as positional arg, use it
    if [ $# -ge 1 ]; then
        SESSION_NAME="$1"
    fi

    # Check tmux available
    if ! command -v tmux >/dev/null 2>&1; then
        echo "tmux is not installed or not in PATH." >&2
        return 2
    fi

    # Kill existing session if requested
    if $KILL_EXISTING && tmux has-session -t "$SESSION_NAME" 2>/dev/null; then
        echo "Killing existing tmux session: $SESSION_NAME"
        tmux kill-session -t "$SESSION_NAME"
    fi

    # Create session if not exists
    if ! tmux has-session -t "$SESSION_NAME" 2>/dev/null; then
        echo "Creating tmux session: $SESSION_NAME (layout: $LAYOUT)"

        case "$LAYOUT" in
            full)
                # Main IDE window with editor + shell on the right
                tmux new-session -d -s "$SESSION_NAME" -n ide
                tmux send-keys -t "$SESSION_NAME":ide "${EDITOR:-nvim}" C-m
                tmux split-window -h -p 30 -t "$SESSION_NAME":ide
                tmux send-keys -t "$SESSION_NAME":ide.1 "${SHELL:-bash}" C-m

                # Server window (left empty for user to start dev server)
                tmux new-window -t "$SESSION_NAME" -n server

                # Logs window
                tmux new-window -t "$SESSION_NAME" -n logs
                ;;
            minimal)
                # Single window with a small bottom pane for quick tasks
                tmux new-session -d -s "$SESSION_NAME" -n shell
                tmux split-window -v -p 20 -t "$SESSION_NAME":shell
                tmux select-pane -t 0
                ;;
            *)
                echo "Unknown layout: $LAYOUT" >&2
                echo "Supported layouts: minimal, full" >&2
                return 2
                ;;
        esac

        sleep 0.2
    else
        echo "tmux session '$SESSION_NAME' already exists, attaching..."
    fi

    # Attach to the session
    tmux attach-session -t "$SESSION_NAME"
}

# 直接執行時才呼叫（僅 bash；zsh 下此檔案只作為 source 用途）
if [ -n "${BASH_SOURCE+x}" ] && [ "${BASH_SOURCE[0]}" = "$0" ]; then
    start_tmux "$@"
fi
