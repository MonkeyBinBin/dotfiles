#!/bin/sh
# Claude Code completion-notification helper (Telegram).
#
# Goal: send ONE Telegram message when a job is *actually done* — i.e. Claude has
# gone idle waiting for you — instead of one per turn. Multi-agent jobs span many
# main-agent turns; the old per-turn Stop rule fired on every one of them.
#
# Model: trailing-edge idle debounce + subagent guard.
#   - Every turn boundary (Stop) does NOT send immediately. It "arms" a pending
#     notification and spawns a detached watcher that waits IDLE_WINDOW seconds.
#   - ANY subsequent activity (a new prompt, any tool call, a subagent finishing)
#     bumps a generation token. When the watcher wakes, a changed token means
#     Claude kept working -> the watcher aborts. Only genuine idle sends.
#   - While tracked subagents are still running (counter > 0) the watcher holds
#     off; the final SubagentStop schedules the real send. So background agents
#     that outlive the main turn are respected.
#
# Net effect: a burst of Stop events (workflow phases, checkpoints the user blows
# through quickly, agent-team coordination) collapses into a single message sent
# only after Claude has been idle for IDLE_WINDOW seconds.
#
# Wired from ~/.claude/settings.json hooks:
#   UserPromptSubmit -> cc-notify.sh prompt    (new job: reset state, cancel stragglers)
#   PreToolUse (all) -> cc-notify.sh pretool   (activity; +count when tool is Agent/Task)
#   SubagentStop     -> cc-notify.sh dec       (a subagent stopped)
#   Stop             -> cc-notify.sh stop      (main-agent turn ended: arm + schedule)
#   (internal)          cc-notify.sh __fire    (detached watcher; not wired directly)
#
# Config (env or ~/.config/claude/telegram.env):
#   CC_NOTIFY_IDLE_WINDOW   seconds of idle before sending           (default 25)
#   CC_NOTIFY_MIN_SECONDS   minimum main-turn duration to bother      (default 30)
#
# State (all keyed by session_id, isolated per session):
#   /tmp/claude-cc-turnstart-<sid>  epoch when the turn started
#   /tmp/claude-cc-gen-<sid>        generation token; bumped on any activity
#   /tmp/claude-cc-subagents-<sid>  active subagent counter (inc/dec)
#   /tmp/claude-cc-subtotal-<sid>   total subagents launched this job (inc only)
#   /tmp/claude-cc-armed-<sid>      pending-send marker; content = main-turn elapsed
#   /tmp/claude-cc-armedat-<sid>    epoch when armed (reserved for future max-wait)
#   /tmp/claude-cc-tp-<sid>         armed: main transcript_path
#   /tmp/claude-cc-cwd-<sid>        armed: main cwd
#   /tmp/claude-cc-lock-<sid>.d     mkdir-based mutex (macOS has no flock)
#
# Note on missed sends: if a subagent dies without emitting SubagentStop, the
# counter stays > 0 and that job's notification is skipped. This is deliberate —
# the priority is fewer notifications, not never missing one — and state is reset
# on the next prompt.

action="$1"

if [ "$action" = "__fire" ]; then
  sid="$2"
  input=""
else
  input=$(cat 2>/dev/null)
  sid=$(printf '%s' "$input" | jq -r '.session_id // "default"' 2>/dev/null)
fi
[ -z "$sid" ] && sid=default

turn="/tmp/claude-cc-turnstart-${sid}"
gen="/tmp/claude-cc-gen-${sid}"
cnt="/tmp/claude-cc-subagents-${sid}"
subtotal="/tmp/claude-cc-subtotal-${sid}"
armed="/tmp/claude-cc-armed-${sid}"
armedat="/tmp/claude-cc-armedat-${sid}"
meta_tp="/tmp/claude-cc-tp-${sid}"
meta_cwd="/tmp/claude-cc-cwd-${sid}"
lock="/tmp/claude-cc-lock-${sid}.d"

# Config (defaults; overridable via telegram.env or environment).
[ -f "$HOME/.config/claude/telegram.env" ] && . "$HOME/.config/claude/telegram.env"
WINDOW="${CC_NOTIFY_IDLE_WINDOW:-25}"
MIN="${CC_NOTIFY_MIN_SECONDS:-30}"

acquire() {
  i=0
  while ! mkdir "$lock" 2>/dev/null; do
    i=$((i + 1))
    [ "$i" -gt 100 ] && break
    sleep 0.05 2>/dev/null || :
  done
}
release() { rmdir "$lock" 2>/dev/null || :; }
read_cnt() { cat "$cnt" 2>/dev/null || echo 0; }
read_total() { cat "$subtotal" 2>/dev/null || echo 0; }

# Unique-enough token: same process writes a token at most once, and distinct
# hook events run in distinct processes (distinct PID), so no two events collide.
gen_token() { printf '%s-%s' "$(date +%s)" "$$"; }

# Spawn a detached watcher for the given captured generation token.
schedule() {
  CC_FIRE_GEN="$1" nohup sh "$0" __fire "$sid" >/dev/null 2>&1 </dev/null &
}

# Collapse whitespace and truncate to N chars, UTF-8 safe (perl -CS).
trunc() {
  perl -CS -e '
    my $n = shift @ARGV;
    local $/; my $t = <STDIN> // "";
    $t =~ s/\s+/ /g; $t =~ s/^\s+|\s+$//g;
    $t = substr($t, 0, $n) . "\x{2026}" if length($t) > $n;
    print $t;
  ' "$1" 2>/dev/null
}

# Last real user prompt (string content, non-meta) from a transcript JSONL.
last_user() {
  jq -rc 'select(.type=="user")
          | select(.isMeta != true)
          | select((.message.content | type) == "string")
          | .message.content' "$1" 2>/dev/null | tail -1
}

# Last non-empty assistant text reply from a transcript JSONL.
last_assistant() {
  jq -rc 'select(.type=="assistant")
          | ((.message.content // []) | map(select(.type=="text") | .text) | join(" "))' \
    "$1" 2>/dev/null | grep -v '^[[:space:]]*$' | tail -1
}

send_telegram() {
  elapsed="$1"; tp="$2"; cwd="$3"; total="$4"
  [ -n "$TELEGRAM_BOT_TOKEN" ] || return 0
  [ -n "$cwd" ] || cwd="$PWD"

  dir=$(basename "$cwd")
  branch=$(git -C "$cwd" rev-parse --abbrev-ref HEAD 2>/dev/null)
  loc="$dir"
  [ -n "$branch" ] && loc="$dir ($branch)"

  header="✅ Claude Code 完成 · ${loc} · ${elapsed}s"
  [ "${total:-0}" -gt 0 ] 2>/dev/null && header="${header} · ${total} subagents"

  text="$header"
  if [ -n "$tp" ] && [ -f "$tp" ]; then
    prompt=$(last_user "$tp" | trunc 160)
    reply=$(last_assistant "$tp" | trunc 220)
    [ -n "$prompt" ] && text="${text}
📝 ${prompt}"
    [ -n "$reply" ] && text="${text}
💬 ${reply}"
  fi

  curl -s -o /dev/null --max-time 10 \
    "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/sendMessage" \
    --data-urlencode "chat_id=$TELEGRAM_CHAT_ID" \
    --data-urlencode "text=${text}" || :
}

case "$action" in
  prompt)
    # New job: reset counters, start the clock, and bump gen so any straggler
    # watcher from the previous job aborts.
    acquire
    date +%s >"$turn"
    printf '0' >"$cnt"
    printf '0' >"$subtotal"
    printf '%s' "$(gen_token)" >"$gen"
    rm -f "$armed" "$armedat" "$meta_tp" "$meta_cwd" 2>/dev/null
    release
    ;;

  pretool)
    # Any tool call is activity -> bump gen (cancels a pending idle send).
    printf '%s' "$(gen_token)" >"$gen"
    tool=$(printf '%s' "$input" | jq -r '.tool_name // ""' 2>/dev/null)
    case "$tool" in
      Agent|Task)
        acquire
        c=$(read_cnt); printf '%s' "$((c + 1))" >"$cnt"
        t=$(read_total); printf '%s' "$((t + 1))" >"$subtotal"
        release
        ;;
    esac
    ;;

  dec)
    # A subagent stopped: progress -> bump gen; drop the counter. If that was the
    # last one and a send is armed, (re)schedule the watcher from this moment.
    g=$(gen_token)
    printf '%s' "$g" >"$gen"
    acquire
    c=$(read_cnt); c=$((c - 1)); [ "$c" -lt 0 ] && c=0; printf '%s' "$c" >"$cnt"
    do_sched=0
    [ "$c" -le 0 ] && [ -f "$armed" ] && do_sched=1
    release
    [ "$do_sched" = 1 ] && schedule "$g"
    ;;

  stop)
    start=$(cat "$turn" 2>/dev/null || echo 0)
    elapsed=$(( $(date +%s) - start ))
    tp=$(printf '%s' "$input" | jq -r '.transcript_path // ""' 2>/dev/null)
    cwd=$(printf '%s' "$input" | jq -r '.cwd // ""' 2>/dev/null)
    [ -z "$cwd" ] && cwd="$PWD"
    if [ "$start" -gt 0 ] && [ "$elapsed" -ge "$MIN" ]; then
      g=$(gen_token)
      acquire
      printf '%s' "$elapsed" >"$armed"
      date +%s >"$armedat"
      printf '%s' "$tp" >"$meta_tp"
      printf '%s' "$cwd" >"$meta_cwd"
      printf '%s' "$g" >"$gen"
      release
      schedule "$g"
    else
      acquire
      rm -f "$armed" "$armedat" "$meta_tp" "$meta_cwd" 2>/dev/null
      release
    fi
    ;;

  __fire)
    # Detached watcher: wait, then send iff still idle and no subagents running.
    captured="$CC_FIRE_GEN"
    sleep "$WINDOW" 2>/dev/null || :
    acquire
    if [ ! -f "$armed" ]; then release; exit 0; fi
    cur=$(cat "$gen" 2>/dev/null)
    if [ "$cur" != "$captured" ]; then release; exit 0; fi   # new activity happened
    c=$(read_cnt)
    if [ "$c" -le 0 ]; then
      elapsed=$(cat "$armed" 2>/dev/null || echo 0)
      tp=$(cat "$meta_tp" 2>/dev/null || echo "")
      cwd=$(cat "$meta_cwd" 2>/dev/null || echo "")
      total=$(read_total)
      rm -f "$armed" "$armedat" "$meta_tp" "$meta_cwd" "$cnt" "$subtotal" 2>/dev/null
      release
      send_telegram "$elapsed" "$tp" "$cwd" "$total"
    else
      # Subagents still running; the final SubagentStop will schedule the send.
      release
    fi
    ;;
esac
exit 0
