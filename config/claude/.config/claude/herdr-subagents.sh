#!/bin/sh
# Reports Claude Code's in-process subagents to the Herdr app, which can't see them: they aren't terminals.
#
# Each running subagent is one label on this session's terminal, so concurrent subagents never overwrite each other:
#   cc.sub.<agent_id>=<agent_type>@<epoch seconds>
# The sub mod reads them from terminals() (mods/sub/state.js escortsOf).
#
#   SubagentStart              -> start   add its label
#   SubagentStop               -> stop    remove its label
#   Stop                       -> settle  no background task left: remove any label a missed SubagentStop left behind
#   SessionStart (not compact) -> reset   remove every label
#   SessionEnd                 -> reset
#
# Does nothing outside a Herdr app terminal. Always exits 0: a display must never get in Claude's way.

terminal=${HC_TERMINAL_ID:-}
[ -n "$terminal" ] || exit 0
command -v hc >/dev/null 2>&1 || exit 0
command -v jq >/dev/null 2>&1 || exit 0

input=$(cat)
field() { printf '%s' "$input" | jq -r "$1" 2>/dev/null; }

clear_labels() {
  # word splitting is safe here: label keys hold no whitespace
  keys=$(hc get "$terminal" --json 2>/dev/null |
    jq -r '.labels // {} | keys[] | select(startswith("cc.sub.")) | . + "="' 2>/dev/null)
  [ -n "$keys" ] && hc label "$terminal" $keys
}

case "${1:-}" in
  start)
    id=$(field '.agent_id // ""')
    [ -n "$id" ] && hc label "$terminal" "cc.sub.$id=$(field '.agent_type // ""')@$(date +%s)"
    ;;
  stop)
    id=$(field '.agent_id // ""')
    [ -n "$id" ] && hc label "$terminal" "cc.sub.$id="
    ;;
  settle)
    [ "$(field '(.background_tasks // []) | length')" = "0" ] && clear_labels
    ;;
  reset)
    clear_labels
    ;;
esac >/dev/null 2>&1

exit 0
