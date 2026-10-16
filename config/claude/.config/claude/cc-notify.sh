#!/bin/sh
# Claude Code completion-notification helper (Telegram).
#
# Goal: send ONE Telegram message when a job is *actually done* — the main
# conversation has stopped AND is not waiting on any background work it started
# (background shells, subagents, monitors, workflows, scheduled wakeups) —
# instead of one per turn.
#
# Model: Stop payload's background_tasks / session_crons + trailing-edge debounce.
#   - Stop with in-flight background_tasks or session_crons -> job is only paused
#     (the background work will wake Claude up again). Mark the job "open" and
#     do not notify.
#   - Stop with both empty -> job is done. Arm a pending send and spawn a
#     detached watcher that waits IDLE_WINDOW seconds.
#   - UserPromptSubmit bumps a generation token; a watcher that wakes to a
#     changed token aborts. This collapses quick checkpoint replies into one.
#   - UserPromptSubmit also fires for synthetic prompts (a background subagent
#     reporting back, a cron firing). While the job is "open" it keeps the
#     original start time and prompt, so elapsed covers the whole job.
#
# Wired from ~/.claude/settings.json hooks:
#   UserPromptSubmit -> cc-notify.sh prompt    (new job or job resumption)
#   SubagentStart    -> cc-notify.sh subagent  (record agent_id for the header)
#   Stop             -> cc-notify.sh stop      (done -> arm + schedule; else hold)
#   (internal)          cc-notify.sh __fire    (detached watcher; not wired directly)
#
# Config (env or ~/.config/claude/telegram.env):
#   CC_NOTIFY_IDLE_WINDOW   seconds of idle before sending           (default 25)
#   CC_NOTIFY_MIN_SECONDS   minimum job duration to bother            (default 30)
#   CC_NOTIFY_DEBUG         1 = append raw hook input to /tmp/claude-cc-debug.log
#
# State (all keyed by session_id, isolated per session):
#   /tmp/claude-cc-turnstart-<sid>  epoch when the job started
#   /tmp/claude-cc-prompt-<sid>     prompt text that started the job
#   /tmp/claude-cc-open-<sid>       job paused on background work; keep start/prompt
#   /tmp/claude-cc-agents-<sid>     subagent ids spawned this job (one per line)
#   /tmp/claude-cc-gen-<sid>        generation token; bumped on every prompt
#   /tmp/claude-cc-armed-<sid>      pending-send marker; content = job elapsed
#   /tmp/claude-cc-reply-<sid>      armed: last assistant message
#   /tmp/claude-cc-cwd-<sid>        armed: main cwd
#   /tmp/claude-cc-lock-<sid>.d     mkdir-based mutex (macOS has no flock)

action="$1"

# Config (defaults; overridable via telegram.env or environment).
[ -f "$HOME/.config/claude/telegram.env" ] && . "$HOME/.config/claude/telegram.env"
WINDOW="${CC_NOTIFY_IDLE_WINDOW:-25}"
MIN="${CC_NOTIFY_MIN_SECONDS:-30}"

if [ "$action" = "__fire" ]; then
  sid="$2"
  input=""
else
  input=$(cat 2>/dev/null)
  sid=$(printf '%s' "$input" | jq -r '.session_id // "default"' 2>/dev/null)
  [ "$CC_NOTIFY_DEBUG" = 1 ] && printf '%s %s %s\n' "$(date +%T)" "$action" "$input" \
    >>/tmp/claude-cc-debug.log
fi
[ -z "$sid" ] && sid=default

turn="/tmp/claude-cc-turnstart-${sid}"
prompt_f="/tmp/claude-cc-prompt-${sid}"
open="/tmp/claude-cc-open-${sid}"
agents="/tmp/claude-cc-agents-${sid}"
gen="/tmp/claude-cc-gen-${sid}"
armed="/tmp/claude-cc-armed-${sid}"
reply_f="/tmp/claude-cc-reply-${sid}"
cwd_f="/tmp/claude-cc-cwd-${sid}"
lock="/tmp/claude-cc-lock-${sid}.d"

acquire() {
  i=0
  while ! mkdir "$lock" 2>/dev/null; do
    i=$((i + 1))
    [ "$i" -gt 100 ] && break
    sleep 0.05 2>/dev/null || :
  done
}
release() { rmdir "$lock" 2>/dev/null || :; }

# Unique-enough token: distinct hook events run in distinct processes (PID).
gen_token() { printf '%s-%s' "$(date +%s)" "$$"; }

# Spawn a detached watcher for the given captured generation token. stdout/stderr
# must be redirected, or Claude Code keeps reading the hook's output.
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

send_telegram() {
  elapsed="$1"; cwd="$2"; total="$3"; prompt="$4"; reply="$5"
  [ -n "$TELEGRAM_BOT_TOKEN" ] || return 0
  [ -n "$cwd" ] || cwd="$PWD"

  dir=$(basename "$cwd")
  branch=$(git -C "$cwd" rev-parse --abbrev-ref HEAD 2>/dev/null)
  loc="$dir"
  [ -n "$branch" ] && loc="$dir ($branch)"

  header="✅ Claude Code 完成 · ${loc} · ${elapsed}s"
  [ "${total:-0}" -gt 0 ] 2>/dev/null && header="${header} · ${total} subagents"

  text="$header"
  prompt=$(printf '%s' "$prompt" | trunc 160)
  reply=$(printf '%s' "$reply" | trunc 220)
  [ -n "$prompt" ] && text="${text}
📝 ${prompt}"
  [ -n "$reply" ] && text="${text}
💬 ${reply}"

  curl -s -o /dev/null --max-time 10 \
    "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/sendMessage" \
    --data-urlencode "chat_id=$TELEGRAM_CHAT_ID" \
    --data-urlencode "text=${text}" || :
}

case "$action" in
  prompt)
    # Any prompt cancels a pending send. Only a prompt outside a paused job
    # starts a new job; synthetic prompts (background reports, crons) resume it.
    acquire
    printf '%s' "$(gen_token)" >"$gen"
    rm -f "$armed" "$reply_f" "$cwd_f" 2>/dev/null
    if [ ! -f "$open" ]; then
      date +%s >"$turn"
      printf '%s' "$input" | jq -r '.prompt // ""' 2>/dev/null >"$prompt_f"
      : >"$agents"
    fi
    release
    ;;

  subagent)
    id=$(printf '%s' "$input" | jq -r '.agent_id // ""' 2>/dev/null)
    [ -n "$id" ] && printf '%s\n' "$id" >>"$agents"
    ;;

  stop)
    pending=$(printf '%s' "$input" |
      jq -r '((.background_tasks // []) | length) + ((.session_crons // []) | length)' 2>/dev/null)
    if [ "${pending:-0}" -gt 0 ] 2>/dev/null; then
      # Paused on background work; it will wake Claude up (and Stop again).
      : >"$open"
      exit 0
    fi
    rm -f "$open" 2>/dev/null
    start=$(cat "$turn" 2>/dev/null || echo 0)
    elapsed=$(( $(date +%s) - start ))
    if [ "$start" -gt 0 ] && [ "$elapsed" -ge "$MIN" ]; then
      g=$(gen_token)
      acquire
      printf '%s' "$elapsed" >"$armed"
      printf '%s' "$input" | jq -r '.last_assistant_message // ""' 2>/dev/null >"$reply_f"
      printf '%s' "$input" | jq -r '.cwd // ""' 2>/dev/null >"$cwd_f"
      printf '%s' "$g" >"$gen"
      release
      schedule "$g"
    fi
    ;;

  __fire)
    # Detached watcher: wait, then send iff no prompt arrived in the meantime.
    captured="$CC_FIRE_GEN"
    sleep "$WINDOW" 2>/dev/null || :
    acquire
    if [ ! -f "$armed" ] || [ "$(cat "$gen" 2>/dev/null)" != "$captured" ]; then
      release; exit 0
    fi
    elapsed=$(cat "$armed")
    cwd=$(cat "$cwd_f" 2>/dev/null)
    reply=$(cat "$reply_f" 2>/dev/null)
    prompt=$(cat "$prompt_f" 2>/dev/null)
    total=$(sort -u "$agents" 2>/dev/null | grep -c .)
    rm -f "$armed" "$reply_f" "$cwd_f" "$turn" "$prompt_f" "$agents" 2>/dev/null
    release
    send_telegram "$elapsed" "$cwd" "$total" "$prompt" "$reply"
    ;;
esac
exit 0
