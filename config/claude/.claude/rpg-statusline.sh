#!/usr/bin/env bash
# RPG-style status line for Claude Code, matching the rpg-hud / slime-band mods.
#
#   one row of segments, wrapped between segments to fit COLUMNS:
#     class (model) + effort stars, map (dir, branch, loot, PR), resource bars, clock
#   resource bars are drawn as what is LEFT, like a game:
#     MP  context window       5h /  7d  usage limits       cap  spend limit
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
  # A used share as what is LEFT, rounded and held to 0–100, and its gauge step on the unrounded share
  # (rpg-hud gaugeColor: 0 above 60% left, 1 above 30%, 2 below), so no awk runs per bar.
  def left: if type == "number" then [0, ([100, 100 - (. + 0.5 | floor)] | min)] | max | tostring else "" end;
  def level: if type == "number" then (100 - .) as $l | if $l > 60 then "0" elif $l > 30 then "1" else "2" end else "" end;
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
  "ctx_left=\(.context_window.used_percentage | left)",
  "ctx_level=\(.context_window.used_percentage | level)",
  "ctx_size=\(.context_window.context_window_size // 0 | i)",
  "ctx_tokens=\(.context_window.total_input_tokens // 0 | i)",
  "h5_left=\(.rate_limits.five_hour.used_percentage | left)",
  "h5_level=\(.rate_limits.five_hour.used_percentage | level)",
  "h5_reset=\(.rate_limits.five_hour.resets_at | i)",
  "d7_left=\(.rate_limits.seven_day.used_percentage | left)",
  "d7_level=\(.rate_limits.seven_day.used_percentage | level)",
  "d7_reset=\(.rate_limits.seven_day.resets_at | i)",
  "sp_left=\(.rate_limits.spend_limit.used_percentage | left)",
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
# jq missing or the JSON unreadable: still name the class.
f_model=${f_model:-Claude}

cols=${COLUMNS:-120}

# ── Helpers ────────────────────────────────────────────────
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

# gauge_color <level> <colour>: the resource's own colour, then amber, then red (see `level` in jq).
gauge_color() {
    case $1 in
        0) printf '%s' "$2" ;;
        1) printf '%s' "$c_amber" ;;
        *) printf '%s' "$c_red" ;;
    esac
}

# Icons are Nerd Font glyphs, so they share the terminal font's size and weight
# instead of each falling back to whatever font has them.

# bar <remaining-pct> <width> <colour>: filled █ for what is left, ░ for what is spent.
# Block elements, because Ghostty-based terminals (cmux) draw them to the cell
# themselves; ▰▱ fell back to an over-wide glyph that overlapped its neighbours.
bar() {
    local left=$1 width=$2 color=$3 filled i out=""
    filled=$(( (left * width + 50) / 100 ))
    [ "$left" -gt 0 ] && [ "$filled" -eq 0 ] && filled=1
    out+="$color"
    for ((i = 0; i < filled; i++)); do out+='█'; done
    out+="${dim}"
    for ((i = filled; i < width; i++)); do out+='░'; done
    printf '%s%s' "$out" "$reset"
}

# resource <label> <label-colour> <left-pct> <level> <width> [tail]
# left is already held to 0–100 by jq: spend can run past its limit, never below nothing left.
resource() {
    local label=$1 color=$2 left=$3 gauge tail=${6:-}
    gauge=$(gauge_color "$4" "$color")
    printf '%s%s%s %s %s%3d%%%s%s' "$color$bold" "$label" "$reset" "$(bar "$left" "$5" "$gauge")" "$gauge" "$left" "$reset" "$tail"
}

# OSC 8 hyperlink.
link() { printf '%s]8;;%s%s\\%s%s]8;;%s\\' "$esc" "$1" "$esc" "$2" "$esc" "$esc"; }

# ── Segments, in reading order ─────────────────────────────
segs=()

case "$f_effort" in
    low)    stars='' ;;
    medium) stars='' ;;
    high)   stars='' ;;
    xhigh)  stars='' ;;
    max)    stars='' ;;
    *)      stars='' ;;
esac
seg="${c_gold}󰞇${reset} ${bold}${c_blue}${f_model}${reset}"
[ -n "$stars" ] && seg+=" ${c_gold}${stars}${reset}"
[ "$f_fast" = "true" ] && seg+=" ${c_amber}${reset}"
[ -n "$f_agent" ] && seg+=" ${dim}as${reset} ${c_purple}${f_agent}${reset}"
segs+=("$seg")

cwd=${f_cwd:-$PWD}
seg="${c_cyan} $(basename "$cwd")${reset}"
# One git call for branch and dirty: porcelain v2 heads its entries with `# branch.*` lines.
if git_status=$(git --no-optional-locks -C "$cwd" status --porcelain=v2 --branch 2>/dev/null); then
    branch="" oid="" dirty=""
    while IFS= read -r line; do
        case $line in
            '# branch.head '*) branch=${line#'# branch.head '} ;;
            '# branch.oid '*)  oid=${line#'# branch.oid '} ;;
            '#'*) ;;
            *) dirty="${c_red}"; break ;;
        esac
    done <<<"$git_status"
    [ "$branch" = "(detached)" ] && branch=${oid:0:7}
    seg+=" ${c_green} ${branch}${dirty}${reset}"
    # Lines not yet committed, against HEAD: ` 3 files changed, 93 insertions(+), 67 deletions(-)`.
    # Only a dirty tree is asked, and a repository with no commit yet has no HEAD to diff against.
    if [ -n "$dirty" ] && shortstat=$(git --no-optional-locks -C "$cwd" diff --shortstat HEAD 2>/dev/null); then
        added=0 removed=0
        [[ $shortstat =~ ([0-9]+)\ insertion ]] && added=${BASH_REMATCH[1]}
        [[ $shortstat =~ ([0-9]+)\ deletion ]] && removed=${BASH_REMATCH[1]}
        if [ "$added" -gt 0 ] || [ "$removed" -gt 0 ]; then
            seg+=" ${c_green}+${added}${reset} ${c_red}-${removed}${reset}"
        fi
    fi
fi
[ -n "$f_worktree" ] && seg+=" ${dim}${reset} ${c_frost}${f_worktree}${reset}"
if [ -n "$f_pr" ]; then
    case "$f_pr_state" in
        approved)          pr_color=$c_green ;;
        changes_requested) pr_color=$c_red ;;
        draft)             pr_color=$dim ;;
        *)                 pr_color=$c_amber ;;
    esac
    pr_text=" #${f_pr}"
    [ -n "$f_pr_url" ] && pr_text=$(link "$f_pr_url" "$pr_text")
    seg+=" ${pr_color}${pr_text}${reset}"
fi
segs+=("$seg")

# Resources, as what is LEFT. MP is the context window, the same MP as the
# rpg-hud hero panel; the limits are the account's, so they go by their window.
if [ "$cols" -lt 100 ]; then width=6; else width=10; fi
if [ -n "$f_ctx_left" ]; then
    tail=" ${dim}$(fmt_k "${f_ctx_tokens:-0}")/$(fmt_k "${f_ctx_size:-0}")${reset}"
    [ "$f_cache_warm" = "true" ] && [ -n "$f_cache_pct" ] &&
        tail+=" ${c_amber}♨ ${dim}cache${reset}${c_amber} ${f_cache_pct}%${reset}"
    segs+=("$(resource MP "$c_blue" "$f_ctx_left" "$f_ctx_level" "$width" "$tail")")
fi
if [ -n "$f_h5_left" ]; then
    reset_at=$(fmt_reset "$f_h5_reset")
    segs+=("$(resource ' 5h' "$c_gold" "$f_h5_left" "$f_h5_level" "$width" "${reset_at:+ ${dim}${reset} ${c_white}${reset_at}${reset}}")")
fi
if [ -n "$f_d7_left" ]; then
    reset_at=$(fmt_reset "$f_d7_reset")
    segs+=("$(resource ' 7d' "$c_purple" "$f_d7_left" "$f_d7_level" "$width" "${reset_at:+ ${dim}${reset} ${c_white}${reset_at}${reset}}")")
fi
if [ -n "$f_sp_left" ]; then
    tail=""
    [ -n "$f_sp_usd" ] && [ -n "$f_sp_limit" ] &&
        tail=" ${dim}$(awk -v u="$f_sp_usd" -v l="$f_sp_limit" 'BEGIN { printf "$%.0f/$%.0f", u, l }')${reset}"
    segs+=("$(resource ' cap' "$c_green" "$f_sp_left" "$f_sp_level" "$width" "$tail")")
fi

[ "${f_dur_ms:-0}" -gt 0 ] 2>/dev/null && segs+=("${c_white} $(fmt_duration "$f_dur_ms")${reset}")
[ -n "$f_vim" ] && segs+=("${c_purple}${f_vim}${reset}")

# ── Output: one line, wrapped between segments ─────────────
# Columns each segment takes on screen, in one perl pass: escapes dropped,
# East Asian wide / fullwidth glyphs (CJK) counted twice. Perl decodes
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
