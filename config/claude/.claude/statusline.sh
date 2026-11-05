#!/usr/bin/env bash
# Status line for Claude Code: plain labels, numbers first, nothing to decode.
#
#   line 1: model and effort, folder, branch and uncommitted lines, PR, context used
#   line 2: the account's usage limits (5h, 7d, spend cap): how much is used and when each resets
#   each line wraps between its segments to fit COLUMNS. Bars and percentages are what is USED;
#   a gauge turns amber at 70% and red at 90%.
#
# Reads everything from Claude Code's stdin JSON: no credentials, no network.
set -f

input=$(cat)
if [ -z "$input" ]; then
    printf 'Claude'
    exit 0
fi

# ── Palette (truecolor) ────────────────────────────────────
esc=$'\033'
reset="${esc}[0m"
dim="${esc}[2m"
bold="${esc}[1m"
rgb() { printf '%s[38;2;%d;%d;%dm' "$esc" "$1" "$2" "$3"; }
c_white=$(rgb 220 220 220)
c_cyan=$(rgb 86 200 220)
c_green=$(rgb 90 210 122)
c_purple=$(rgb 200 140 255)
c_red=$(rgb 255 95 95)
c_amber=$(rgb 255 176 85)
c_frost=$(rgb 200 210 255)
c_bar=$(rgb 120 170 230)
# Nerd Font glyphs (folder, branch), as UTF-8 bytes so bash 3.2 can spell them
ic_dir=$'\xef\x81\xbb'
ic_branch=$'\xee\x82\xa0'

# ── One jq pass: every field as KEY=value on its own line ──
fields=$(jq -r '
  # Control characters out: a newline would forge a KEY= line, an ESC a terminal sequence.
  def s: tostring | gsub("[\u0000-\u001f\u007f-\u009f]"; "");
  def n: if . == null then "" else s end;
  # Numbers only, so bash arithmetic never evaluates text from the JSON; i drops the fraction.
  def num: if type == "number" then tostring else "" end;
  def i: if type == "number" then floor | tostring else "" end;
  # A used share, rounded and held to 0–100, and its gauge step on the unrounded share
  # (0 below 70% used, 1 below 90%, 2 above), so no awk runs per bar.
  def used: if type == "number" then [0, ([100, (. + 0.5 | floor)] | min)] | max | tostring else "" end;
  def level: if type == "number" then if . < 70 then "0" elif . < 90 then "1" else "2" end else "" end;
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
  "ctx_used=\(.context_window.used_percentage | used)",
  "ctx_level=\(.context_window.used_percentage | level)",
  "ctx_size=\(.context_window.context_window_size // 0 | i)",
  "ctx_tokens=\(.context_window.total_input_tokens // 0 | i)",
  "h5_used=\(.rate_limits.five_hour.used_percentage | used)",
  "h5_level=\(.rate_limits.five_hour.used_percentage | level)",
  "h5_reset=\(.rate_limits.five_hour.resets_at | i)",
  "d7_used=\(.rate_limits.seven_day.used_percentage | used)",
  "d7_level=\(.rate_limits.seven_day.used_percentage | level)",
  "d7_reset=\(.rate_limits.seven_day.resets_at | i)",
  "sp_used=\(.rate_limits.spend_limit.used_percentage | used)",
  "sp_level=\(.rate_limits.spend_limit.used_percentage | level)",
  "sp_usd=\(.rate_limits.spend_limit.used_usd | num)",
  "sp_limit=\(.rate_limits.spend_limit.limit_usd | num)",
  "cache_warm=\(.prompt_cache.warm == true)",
  "cache_pct=\(.prompt_cache.hit_ratio | if type == "number" then . * 100 + 0.5 | floor | tostring else "" end)"
' <<<"$input" 2>/dev/null) || fields=""

# Assign without eval, so nothing in the JSON can run as shell.
while IFS= read -r line; do
    key=${line%%=*}
    val=${line#*=}
    # A plain name only: printf -v would evaluate an array subscript like x[$(cmd)].
    [[ $key =~ ^[a-z0-9_]+$ ]] || continue
    printf -v "f_$key" '%s' "$val"
done <<<"$fields"
# jq missing or the JSON unreadable: still name the model.
f_model=${f_model:-Claude}

cols=${COLUMNS:-120}
now=$(date +%s)

# ── Helpers ────────────────────────────────────────────────
fmt_k() {
    local n=$1
    if [ "$n" -ge 1000000 ]; then awk -v n="$n" 'BEGIN { printf "%.1fM", n / 1e6 }'
    elif [ "$n" -ge 100000 ]; then printf '%dk' $(( (n + 500) / 1000 ))
    elif [ "$n" -ge 1000 ]; then awk -v n="$n" 'BEGIN { printf "%.1fk", n / 1e3 }'
    else printf '%d' "$n"
    fi
}

# Epoch seconds → "resets 2:20am (in 1h12m)"; the date too when it isn't today: "resets nov 9 8:00am (in 4d 6h)".
on_day() { date -r "$1" +%F 2>/dev/null || date -d "@$1" +%F 2>/dev/null; }
fmt_reset() {
    local epoch=$1 fmt out left
    [ -z "$epoch" ] && return
    if [ "$(on_day "$epoch")" = "$(date +%F)" ]; then fmt='%l:%M%p'; else fmt='%b %-d %l:%M%p'; fi
    out=$(LC_ALL=C date -r "$epoch" "+$fmt" 2>/dev/null || LC_ALL=C date -d "@$epoch" "+$fmt" 2>/dev/null)
    out=$(printf '%s' "$out" | sed 's/  */ /g; s/^ //' | tr '[:upper:]' '[:lower:]')
    left=$(( epoch - now ))
    if [ "$left" -le 0 ]; then left="now"
    elif [ "$left" -ge 86400 ]; then left="in $(( left / 86400 ))d $(( left % 86400 / 3600 ))h"
    elif [ "$left" -ge 3600 ]; then left="in $(( left / 3600 ))h$(( left % 3600 / 60 ))m"
    else left="in $(( left / 60 ))m"
    fi
    printf 'resets %s (%s)' "$out" "$left"
}

# gauge_color <level>: the normal colour, then amber, then red (see `level` in jq).
gauge_color() {
    case $1 in
        0) printf '%s' "$c_bar" ;;
        1) printf '%s' "$c_amber" ;;
        *) printf '%s' "$c_red" ;;
    esac
}

# bar <used-pct> <width> <colour>: a dot per step, ● for what is used, a dim ○ for what is free.
bar() {
    local used=$1 width=$2 color=$3 filled i out=""
    filled=$(( (used * width + 50) / 100 ))
    [ "$used" -gt 0 ] && [ "$filled" -eq 0 ] && filled=1
    out+="$color"
    for ((i = 0; i < filled; i++)); do out+='●'; done
    out+="${dim}"
    for ((i = filled; i < width; i++)); do out+='○'; done
    printf '%s%s' "$out" "$reset"
}

# resource <label> <used-pct> <level> <width> [tail]: "5h ●●●●●○○○○○  46% used", then the tail.
# used is already held to 0–100 by jq: spend can run past its limit.
resource() {
    local label=$1 used=$2 gauge tail=${5:-}
    gauge=$(gauge_color "$3")
    printf '%s%s%s %s %s%3d%%%s %sused%s%s' "$c_white" "$label" "$reset" "$(bar "$used" "$4" "$gauge")" "$gauge$bold" "$used" "$reset" "$dim" "$reset" "$tail"
}

# OSC 8 hyperlink.
link() { printf '%s]8;;%s%s\\%s%s]8;;%s\\' "$esc" "$1" "$esc" "$2" "$esc" "$esc"; }

# ── Line 1: this session ───────────────────────────────────
line1=()

seg="${bold}${c_white}${f_model}${reset}"
[ -n "$f_effort" ] && seg+=" ${dim}${f_effort}${reset}"
[ "$f_fast" = "true" ] && seg+=" ${c_amber}fast${reset}"
[ -n "$f_agent" ] && seg+=" ${dim}agent${reset} ${c_purple}${f_agent}${reset}"
line1+=("$seg")

cwd=${f_cwd:-$PWD}
seg="${c_cyan}${ic_dir} $(basename "$cwd")${reset}"
# One git call for branch and dirty: porcelain v2 heads its entries with `# branch.*` lines.
if git_status=$(git --no-optional-locks -C "$cwd" status --porcelain=v2 --branch 2>/dev/null); then
    branch="" oid="" dirty=""
    while IFS= read -r line; do
        case $line in
            '# branch.head '*) branch=${line#'# branch.head '} ;;
            '# branch.oid '*)  oid=${line#'# branch.oid '} ;;
            '#'*) ;;
            *) dirty=1; break ;;
        esac
    done <<<"$git_status"
    [ "$branch" = "(detached)" ] && branch=${oid:0:7}
    seg+=" ${c_green}${ic_branch} ${branch}${reset}"
    # Lines not yet committed, against HEAD: ` 3 files changed, 93 insertions(+), 67 deletions(-)`.
    # Only a dirty tree is asked, and a repository with no commit yet has no HEAD to diff against.
    if [ -n "$dirty" ]; then
        changes=""
        if shortstat=$(git --no-optional-locks -C "$cwd" diff --shortstat HEAD 2>/dev/null); then
            added=0 removed=0
            [[ $shortstat =~ ([0-9]+)\ insertion ]] && added=${BASH_REMATCH[1]}
            [[ $shortstat =~ ([0-9]+)\ deletion ]] && removed=${BASH_REMATCH[1]}
            [ "$added" -gt 0 ] || [ "$removed" -gt 0 ] && changes=" ${c_green}+${added}${reset} ${c_red}-${removed}${reset}"
        fi
        seg+="${changes:- ${c_amber}uncommitted${reset}}"
    fi
fi
[ -n "$f_worktree" ] && seg+=" ${dim}worktree${reset} ${c_frost}${f_worktree}${reset}"
if [ -n "$f_pr" ]; then
    case "$f_pr_state" in
        approved)          pr_color=$c_green ;;
        changes_requested) pr_color=$c_red ;;
        draft)             pr_color=$dim ;;
        *)                 pr_color=$c_amber ;;
    esac
    pr_text="PR #${f_pr}"
    [ -n "$f_pr_state" ] && pr_text+=" ${f_pr_state//_/ }"
    [ -n "$f_pr_url" ] && pr_text=$(link "$f_pr_url" "$pr_text")
    seg+=" ${pr_color}${pr_text}${reset}"
fi
line1+=("$seg")

if [ "$cols" -lt 100 ]; then width=6; else width=10; fi
if [ -n "$f_ctx_used" ]; then
    tail=" ${dim}$(fmt_k "${f_ctx_tokens:-0}") / $(fmt_k "${f_ctx_size:-0}")${reset}"
    [ "$f_cache_warm" = "true" ] && [ -n "$f_cache_pct" ] && tail+=" ${dim}· cache hit${reset} ${c_white}${f_cache_pct}%${reset}"
    line1+=("$(resource context "$f_ctx_used" "$f_ctx_level" "$width" "$tail")")
fi
[ -n "$f_vim" ] && line1+=("${c_purple}${f_vim}${reset}")

# ── Line 2: the account's limits ───────────────────────────
line2=()
if [ -n "$f_h5_used" ]; then
    reset_at=$(fmt_reset "$f_h5_reset")
    line2+=("$(resource 5h "$f_h5_used" "$f_h5_level" "$width" "${reset_at:+ ${dim}· ${reset_at}${reset}}")")
fi
if [ -n "$f_d7_used" ]; then
    reset_at=$(fmt_reset "$f_d7_reset")
    line2+=("$(resource 7d "$f_d7_used" "$f_d7_level" "$width" "${reset_at:+ ${dim}· ${reset_at}${reset}}")")
fi
if [ -n "$f_sp_used" ]; then
    tail=""
    [ -n "$f_sp_usd" ] && [ -n "$f_sp_limit" ] &&
        tail=" ${dim}$(awk -v u="$f_sp_usd" -v l="$f_sp_limit" 'BEGIN { printf "$%.0f / $%.0f", u, l }')${reset}"
    line2+=("$(resource spend "$f_sp_used" "$f_sp_level" "$width" "$tail")")
fi

# ── Output: each line wrapped between its segments ─────────
sep=" ${dim}│${reset} "
sep_width=3
# Claude Code pads the row; keep a little slack so the terminal never wraps it first.
limit=$(( cols - 2 ))
started=0
emit() {
    [ "$#" -eq 0 ] && return
    local widths=() w seg i=0 used=0
    # Columns each segment takes on screen, in one perl pass: escapes dropped, East Asian wide / fullwidth
    # glyphs (CJK) counted twice. Perl decodes UTF-8 itself, so this holds under any locale and on bash 3.2.
    while IFS= read -r w; do widths+=("$w"); done < <(perl -CSA -e '
        for (@ARGV) {
            s/\e\[[0-9;]*m//g;
            s/\e\]8;;[^\e]*\e\\//g;
            my $wide = () = /[\p{EA=W}\p{EA=F}]/g;
            print length($_) + $wide, "\n";
        }' "$@" 2>/dev/null)
    [ "$started" -eq 1 ] && printf '\n'
    started=1
    for seg in "$@"; do
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
        i=$(( i + 1 ))
    done
}
emit "${line1[@]}"
[ "${#line2[@]}" -gt 0 ] && emit "${line2[@]}"
exit 0
