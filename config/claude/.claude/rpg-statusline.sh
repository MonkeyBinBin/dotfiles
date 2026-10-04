#!/usr/bin/env bash
# RPG-style status line for Claude Code, matching the rpg-hud / slime-band mods.
#
#   one row of segments, wrapped between segments to fit COLUMNS:
#     class (model) + effort stars, map (dir, branch, loot, PR), resource bars, clock
#   resource bars are drawn as what is LEFT, like a game:
#     MP  context window      ⌛5h / ⌛7d  usage limits      ⛁ cap  spend limit
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
  # Control characters out: a newline would forge a KEY= line, an ESC a terminal sequence.
  def s: tostring | gsub("[\u0000-\u001f\u007f-\u009f]"; "");
  def n: if . == null then "" else s end;
  # Numbers only, so bash arithmetic never evaluates text from the JSON; i drops the fraction.
  def num: if type == "number" then tostring else "" end;
  def i: if type == "number" then floor | tostring else "" end;
  "model=\(.model.display_name // "Claude" | s)",
  "effort=\(.effort.level | n)",
  "fast=\(.fast_mode == true)",
  "cwd=\(.workspace.current_dir // .cwd // "" | s)",
  "worktree=\(.worktree.name // .workspace.git_worktree // "" | s)",
  "agent=\(.agent.name | n)",
  "vim=\(.vim.mode | n)",
  "pr=\(.pr.number | i)",
  "pr_state=\(.pr.review_state | n)",
  "pr_url=\(.pr.url | n)",
  "dur_ms=\(.cost.total_duration_ms // 0 | i)",
  "added=\(.cost.total_lines_added // 0 | i)",
  "removed=\(.cost.total_lines_removed // 0 | i)",
  "ctx_used=\(.context_window.used_percentage | num)",
  "ctx_size=\(.context_window.context_window_size // 0 | i)",
  "ctx_tokens=\(.context_window.total_input_tokens // 0 | i)",
  "h5=\(.rate_limits.five_hour.used_percentage | num)",
  "h5_reset=\(.rate_limits.five_hour.resets_at | i)",
  "d7=\(.rate_limits.seven_day.used_percentage | num)",
  "d7_reset=\(.rate_limits.seven_day.resets_at | i)",
  "sp=\(.rate_limits.spend_limit.used_percentage | num)",
  "sp_usd=\(.rate_limits.spend_limit.used_usd | num)",
  "sp_limit=\(.rate_limits.spend_limit.limit_usd | num)",
  "cache_warm=\(.prompt_cache.warm == true)",
  "cache_hit=\(.prompt_cache.hit_ratio | num)"
' <<<"$input" 2>/dev/null) || fields=""

# Assign without eval, so nothing in the JSON can run as shell.
while IFS= read -r line; do
    key=${line%%=*}
    val=${line#*=}
    # A plain name only: printf -v would evaluate an array subscript like x[$(cmd)].
    [[ $key =~ ^[a-z0-9_]+$ ]] || continue
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

# Epoch seconds → "oct 4 3:05pm": always the date, so a reset is never ambiguous.
fmt_reset() {
    local epoch=$1 out
    [ -z "$epoch" ] && return
    out=$(LC_ALL=C date -r "$epoch" '+%b %-d %l:%M%p' 2>/dev/null || LC_ALL=C date -d "@$epoch" '+%b %-d %l:%M%p' 2>/dev/null)
    printf '%s' "$out" | sed 's/  */ /g; s/^ //' | tr '[:upper:]' '[:lower:]'
}

# Same steps as rpg-hud's gaugeColor, on the unrounded share: the resource's own
# colour above 60% left, amber above 30%, red below.
gauge_color() {
    case $(awk -v u="$1" 'BEGIN { l = 100 - u; print (l > 60 ? 0 : (l > 30 ? 1 : 2)) }') in
        0) printf '%s' "$2" ;;
        1) printf '%s' "$c_amber" ;;
        *) printf '%s' "$c_red" ;;
    esac
}

# bar <remaining-pct> <width> <colour>: filled ▰ for what is left.
bar() {
    local left=$1 width=$2 color=$3 filled i out=""
    filled=$(( (left * width + 50) / 100 ))
    [ "$left" -gt 0 ] && [ "$filled" -eq 0 ] && filled=1
    out+="$color"
    for ((i = 0; i < filled; i++)); do out+='▰'; done
    out+="${dim}"
    for ((i = filled; i < width; i++)); do out+='▱'; done
    printf '%s%s' "$out" "$reset"
}

# resource <label> <label-colour> <used-pct> <width> [tail]
resource() {
    local label=$1 color=$2 used left gauge tail=${5:-}
    used=$(round "$3")
    left=$(( 100 - used ))
    # Spend can run past its limit: never show less than nothing left.
    [ "$left" -lt 0 ] && left=0
    [ "$left" -gt 100 ] && left=100
    gauge=$(gauge_color "$3" "$color")
    printf '%s%s%s %s %s%3d%%%s%s' "$color$bold" "$label" "$reset" "$(bar "$left" "$4" "$gauge")" "$gauge" "$left" "$reset" "$tail"
}

# OSC 8 hyperlink.
link() { printf '%s]8;;%s%s\\%s%s]8;;%s\\' "$esc" "$1" "$esc" "$2" "$esc" "$esc"; }

# ── Segments, in reading order ─────────────────────────────
segs=()

case "$f_effort" in
    low)    stars='★☆☆☆☆' ;;
    medium) stars='★★☆☆☆' ;;
    high)   stars='★★★☆☆' ;;
    xhigh)  stars='★★★★☆' ;;
    max)    stars='★★★★★' ;;
    *)      stars='' ;;
esac
seg="${c_gold}⚔${reset} ${bold}${c_blue}${f_model}${reset}"
[ -n "$stars" ] && seg+=" ${c_gold}${stars}${reset}"
[ "$f_fast" = "true" ] && seg+=" ${c_amber}⚡${reset}"
[ -n "$f_agent" ] && seg+=" ${dim}as${reset} ${c_purple}${f_agent}${reset}"
segs+=("$seg")

cwd=${f_cwd:-$PWD}
seg="${c_cyan}⌂ $(basename "$cwd")${reset}"
if git -C "$cwd" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    branch=$(git -C "$cwd" symbolic-ref --short HEAD 2>/dev/null || git -C "$cwd" rev-parse --short HEAD 2>/dev/null)
    dirty=""
    [ -n "$(git --no-optional-locks -C "$cwd" status --porcelain 2>/dev/null | head -1)" ] && dirty="${c_red}✎"
    seg+=" ${c_green}⎇ ${branch}${dirty}${reset}"
fi
if [ "${f_added:-0}" -gt 0 ] || [ "${f_removed:-0}" -gt 0 ]; then
    seg+=" ${c_green}+${f_added}${reset} ${c_red}-${f_removed}${reset}"
fi
[ -n "$f_worktree" ] && seg+=" ${dim}⑂${reset} ${c_frost}${f_worktree}${reset}"
if [ -n "$f_pr" ]; then
    case "$f_pr_state" in
        approved)          pr_color=$c_green ;;
        changes_requested) pr_color=$c_red ;;
        draft)             pr_color=$dim ;;
        *)                 pr_color=$c_amber ;;
    esac
    pr_text="⚑ #${f_pr}"
    [ -n "$f_pr_url" ] && pr_text=$(link "$f_pr_url" "$pr_text")
    seg+=" ${pr_color}${pr_text}${reset}"
fi
segs+=("$seg")

# Resources, as what is LEFT. MP is the context window, the same MP as the
# rpg-hud hero panel; the limits are the account's, so they go by their window.
if [ "$cols" -lt 100 ]; then width=6; else width=10; fi
if [ -n "$f_ctx_used" ]; then
    tail=" ${dim}$(fmt_k "${f_ctx_tokens:-0}")/$(fmt_k "${f_ctx_size:-0}")${reset}"
    [ "$f_cache_warm" = "true" ] && [ -n "$f_cache_hit" ] &&
        tail+=" ${c_amber}♨ ${dim}cache${reset}${c_amber} $(round "$(awk -v h="$f_cache_hit" 'BEGIN { print h * 100 }')")%${reset}"
    segs+=("$(resource MP "$c_blue" "$f_ctx_used" "$width" "$tail")")
fi
if [ -n "$f_h5" ]; then
    reset_at=$(fmt_reset "$f_h5_reset")
    segs+=("$(resource '⌛5h' "$c_gold" "$f_h5" "$width" "${reset_at:+ ${dim}⟳${reset} ${c_white}${reset_at}${reset}}")")
fi
if [ -n "$f_d7" ]; then
    reset_at=$(fmt_reset "$f_d7_reset")
    segs+=("$(resource '⌛7d' "$c_purple" "$f_d7" "$width" "${reset_at:+ ${dim}⟳${reset} ${c_white}${reset_at}${reset}}")")
fi
if [ -n "$f_sp" ]; then
    tail=""
    [ -n "$f_sp_usd" ] && [ -n "$f_sp_limit" ] &&
        tail=" ${dim}$(awk -v u="$f_sp_usd" -v l="$f_sp_limit" 'BEGIN { printf "$%.0f/$%.0f", u, l }')${reset}"
    segs+=("$(resource '⛁ cap' "$c_green" "$f_sp" "$width" "$tail")")
fi

[ "${f_dur_ms:-0}" -gt 0 ] 2>/dev/null && segs+=("${c_white}◷ $(fmt_duration "$f_dur_ms")${reset}")
[ -n "$f_vim" ] && segs+=("${c_purple}${f_vim}${reset}")

# ── Output: one line, wrapped between segments ─────────────
# Columns each segment takes on screen, in one perl pass: escapes dropped,
# East Asian wide / fullwidth glyphs (CJK, ⚡, ⌛) counted twice. Perl decodes
# UTF-8 itself, so this holds under any locale and on bash 3.2, whose bracket
# patterns mis-match multibyte ranges.
widths=()
while IFS= read -r w; do widths+=("$w"); done < <(perl -CSA -e '
    for (@ARGV) {
        s/\e\[[0-9;]*m//g;
        s/\e\]8;;[^\e]*\e\\//g;
        my $wide = () = /[\p{EA=W}\p{EA=F}]/g;
        print length($_) + $wide, "\n";
    }' "${segs[@]}" 2>/dev/null)

# Claude Code pads the row; keep a little slack so the terminal never wraps it first.
limit=$(( cols - 2 ))
sep_width=3
used=0
for i in "${!segs[@]}"; do
    seg=${segs[$i]}
    w=${widths[$i]:-${#seg}}
    if [ "$i" -eq 0 ]; then
        printf '%s' "$seg"
        used=$w
    elif [ $(( used + sep_width + w )) -le "$limit" ]; then
        printf '%s%s' "$sep" "$seg"
        used=$(( used + sep_width + w ))
    else
        printf '\n%s' "$seg"
        used=$w
    fi
done
exit 0
