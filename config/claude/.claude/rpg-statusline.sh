#!/usr/bin/env bash
# RPG-style status line for Claude Code, matching the rpg-hud / slime-band mods.
#
#   line 1  character sheet: class (model) + effort stars, map (dir, branch, PR), clock, gold, loot
#   line 2  resource bars, drawn as what is LEFT, like a game:
#             MP  context window      SP  5-hour limit      EN  7-day limit      GP  spend limit
#
# Reads everything from Claude Code's stdin JSON: no credentials, no network.
# The slime band above the prompt covers turns, tokens and changed-file counts,
# so they stay out of here.
set -f

input=$(cat)
if [ -z "$input" ]; then
    printf 'Claude'
    exit 0
fi

# ── Palette (truecolor, same hues as the mods) ─────────────
esc=$'\033'
reset="${esc}[0m"
dim="${esc}[2m"
bold="${esc}[1m"
rgb() { printf '%s[38;2;%d;%d;%dm' "$esc" "$1" "$2" "$3"; }
c_gold=$(rgb 255 210 60)
c_cyan=$(rgb 86 200 220)
c_green=$(rgb 90 210 122)
c_blue=$(rgb 90 169 255)
c_purple=$(rgb 200 140 255)
c_red=$(rgb 255 95 95)
c_amber=$(rgb 255 176 85)
c_white=$(rgb 220 220 220)
c_frost=$(rgb 200 210 255)
sep=" ${dim}│${reset} "

# ── One jq pass: every field as KEY=value on its own line ──
fields=$(jq -r '
  def n: if . == null then "" else tostring end;
  "model=\(.model.display_name // "Claude")",
  "effort=\(.effort.level | n)",
  "fast=\(.fast_mode // false)",
  "cwd=\(.workspace.current_dir // .cwd // "")",
  "worktree=\(.worktree.name // .workspace.git_worktree // "" )",
  "agent=\(.agent.name | n)",
  "vim=\(.vim.mode | n)",
  "pr=\(.pr.number | n)",
  "pr_state=\(.pr.review_state | n)",
  "pr_url=\(.pr.url | n)",
  "dur_ms=\(.cost.total_duration_ms // 0)",
  "cost=\(.cost.total_cost_usd // 0)",
  "added=\(.cost.total_lines_added // 0)",
  "removed=\(.cost.total_lines_removed // 0)",
  "ctx_used=\(.context_window.used_percentage | n)",
  "ctx_size=\(.context_window.context_window_size // 0)",
  "ctx_tokens=\(.context_window.total_input_tokens // 0)",
  "h5=\(.rate_limits.five_hour.used_percentage | n)",
  "h5_reset=\(.rate_limits.five_hour.resets_at | n)",
  "d7=\(.rate_limits.seven_day.used_percentage | n)",
  "d7_reset=\(.rate_limits.seven_day.resets_at | n)",
  "sp=\(.rate_limits.spend_limit.used_percentage | n)",
  "sp_usd=\(.rate_limits.spend_limit.used_usd | n)",
  "sp_limit=\(.rate_limits.spend_limit.limit_usd | n)",
  "cache_warm=\(.prompt_cache.warm // false)",
  "cache_hit=\(.prompt_cache.hit_ratio | n)"
' <<<"$input" 2>/dev/null) || fields=""

# Assign without eval, so nothing in the JSON can run as shell.
while IFS= read -r line; do
    key=${line%%=*}
    val=${line#*=}
    printf -v "f_$key" '%s' "$val"
done <<<"$fields"

cols=${COLUMNS:-120}

# ── Helpers ────────────────────────────────────────────────
round() { awk -v x="$1" 'BEGIN { printf "%d", (x == "" ? 0 : x + 0.5) }'; }

fmt_k() {
    local n=$1
    if [ "$n" -ge 1000000 ]; then awk -v n="$n" 'BEGIN { printf "%.1fM", n / 1e6 }'
    elif [ "$n" -ge 100000 ]; then printf '%dk' $(( (n + 500) / 1000 ))
    elif [ "$n" -ge 1000 ]; then awk -v n="$n" 'BEGIN { printf "%.1fk", n / 1e3 }'
    else printf '%d' "$n"
    fi
}

fmt_duration() {
    local s=$(( $1 / 1000 ))
    if [ "$s" -ge 3600 ]; then printf '%dh%02dm' $(( s / 3600 )) $(( s % 3600 / 60 ))
    elif [ "$s" -ge 60 ]; then printf '%dm' $(( s / 60 ))
    else printf '%ds' "$s"
    fi
}

# Epoch seconds → "3:05pm" today, "oct 8" further out.
fmt_reset() {
    local epoch=$1 now style out
    [ -z "$epoch" ] && return
    now=$(date +%s)
    if [ $(( epoch - now )) -lt 86400 ]; then style='+%l:%M%p'; else style='+%b %-d'; fi
    out=$(LC_ALL=C date -r "$epoch" "$style" 2>/dev/null || LC_ALL=C date -d "@$epoch" "$style" 2>/dev/null)
    printf '%s' "$out" | sed 's/^ *//' | tr '[:upper:]' '[:lower:]'
}

# bar <remaining-pct> <width> <colour>: filled ▰ for what is left, red when low.
bar() {
    local left=$1 width=$2 color=$3 filled i out=""
    [ "$left" -lt 0 ] && left=0
    [ "$left" -gt 100 ] && left=100
    filled=$(( (left * width + 50) / 100 ))
    [ "$left" -gt 0 ] && [ "$filled" -eq 0 ] && filled=1
    [ "$left" -le 15 ] && color=$c_red
    out+="$color"
    for ((i = 0; i < filled; i++)); do out+='▰'; done
    out+="${dim}"
    for ((i = filled; i < width; i++)); do out+='▱'; done
    printf '%s%s' "$out" "$reset"
}

# resource <label> <label-colour> <used-pct> <width> [tail]
resource() {
    local label=$1 color=$2 used left pct_color tail=${5:-}
    used=$(round "$3")
    left=$(( 100 - used ))
    pct_color=$color
    [ "$left" -le 15 ] && pct_color=$c_red
    printf '%s%s%s %s %s%3d%%%s%s' "$color$bold" "$label" "$reset" "$(bar "$left" "$4" "$color")" "$pct_color" "$left" "$reset" "$tail"
}

# OSC 8 hyperlink.
link() { printf '%s]8;;%s%s\\%s%s]8;;%s\\' "$esc" "$1" "$esc" "$2" "$esc" "$esc"; }

# ── Line 1: character sheet ────────────────────────────────
case "$f_effort" in
    low)    stars='★☆☆☆☆' ;;
    medium) stars='★★☆☆☆' ;;
    high)   stars='★★★☆☆' ;;
    xhigh)  stars='★★★★☆' ;;
    max)    stars='★★★★★' ;;
    *)      stars='' ;;
esac

line1="${c_gold}⚔${reset} ${bold}${c_blue}${f_model}${reset}"
[ -n "$stars" ] && line1+=" ${c_gold}${stars}${reset}"
[ "$f_fast" = "true" ] && line1+=" ${c_amber}⚡${reset}"
[ -n "$f_agent" ] && line1+=" ${dim}as${reset} ${c_purple}${f_agent}${reset}"

cwd=${f_cwd:-$PWD}
line1+="${sep}${c_cyan}⌂ $(basename "$cwd")${reset}"
if git -C "$cwd" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    branch=$(git -C "$cwd" symbolic-ref --short HEAD 2>/dev/null || git -C "$cwd" rev-parse --short HEAD 2>/dev/null)
    dirty=""
    [ -n "$(git --no-optional-locks -C "$cwd" status --porcelain 2>/dev/null | head -1)" ] && dirty="${c_red}✎"
    line1+=" ${c_green}⎇ ${branch}${dirty}${reset}"
fi
[ -n "$f_worktree" ] && line1+=" ${dim}⑂${reset} ${c_frost}${f_worktree}${reset}"

if [ -n "$f_pr" ]; then
    case "$f_pr_state" in
        approved)          pr_color=$c_green ;;
        changes_requested) pr_color=$c_red ;;
        draft)             pr_color=$dim ;;
        *)                 pr_color=$c_amber ;;
    esac
    pr_text="⚑ #${f_pr}"
    [ -n "$f_pr_url" ] && pr_text=$(link "$f_pr_url" "$pr_text")
    line1+=" ${pr_color}${pr_text}${reset}"
fi

[ "${f_dur_ms:-0}" -gt 0 ] 2>/dev/null && line1+="${sep}${c_white}◷ $(fmt_duration "$f_dur_ms")${reset}"
line1+="${sep}${c_gold}◎ $(awk -v c="${f_cost:-0}" 'BEGIN { printf "$%.2f", c }')${reset}"
if [ "${f_added:-0}" -gt 0 ] || [ "${f_removed:-0}" -gt 0 ]; then
    line1+="${sep}${c_green}+${f_added}${reset} ${c_red}-${f_removed}${reset}"
fi
[ -n "$f_vim" ] && line1+="${sep}${c_purple}${f_vim}${reset}"

# ── Line 2: resource bars ──────────────────────────────────
if [ "$cols" -lt 100 ]; then width=6; else width=10; fi
bars=()

if [ -n "$f_ctx_used" ]; then
    ctx_tail=" ${dim}$(fmt_k "${f_ctx_tokens:-0}")/$(fmt_k "${f_ctx_size:-0}")${reset}"
    [ "$f_cache_warm" = "true" ] && [ -n "$f_cache_hit" ] &&
        ctx_tail+=" ${c_amber}♨$(round "$(awk -v h="$f_cache_hit" 'BEGIN { print h * 100 }')")%${reset}"
    bars+=("$(resource MP "$c_blue" "$f_ctx_used" "$width" "$ctx_tail")")
fi
if [ -n "$f_h5" ]; then
    reset_at=$(fmt_reset "$f_h5_reset")
    bars+=("$(resource SP "$c_gold" "$f_h5" "$width" "${reset_at:+ ${dim}⟳${reset} ${c_white}${reset_at}${reset}}")")
fi
if [ -n "$f_d7" ]; then
    reset_at=$(fmt_reset "$f_d7_reset")
    bars+=("$(resource EN "$c_purple" "$f_d7" "$width" "${reset_at:+ ${dim}⟳${reset} ${c_white}${reset_at}${reset}}")")
fi
if [ -n "$f_sp" ]; then
    gp_tail=""
    [ -n "$f_sp_usd" ] && [ -n "$f_sp_limit" ] &&
        gp_tail=" ${dim}$(awk -v u="$f_sp_usd" -v l="$f_sp_limit" 'BEGIN { printf "$%.0f/$%.0f", u, l }')${reset}"
    bars+=("$(resource GP "$c_green" "$f_sp" "$width" "$gp_tail")")
fi

# ── Output ─────────────────────────────────────────────────
printf '%s' "$line1"
if [ "${#bars[@]}" -gt 0 ]; then
    printf '\n'
    for i in "${!bars[@]}"; do
        [ "$i" -gt 0 ] && printf '%s' "$sep"
        printf '%s' "${bars[$i]}"
    done
fi
exit 0
