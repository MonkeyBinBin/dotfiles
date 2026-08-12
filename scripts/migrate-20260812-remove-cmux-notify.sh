#!/usr/bin/env bash
set -uo pipefail

# migrate-20260812-remove-cmux-notify.sh
#
# One-off migration for machines that deployed this repo before 2026-08-12.
#
# Background:
#   The dotfiles used to ship a `cmux-notify` script (the `bin` stow package)
#   plus a hand-written `~/.codex/hooks.json`. cmux now injects agent hooks
#   itself — Claude Code through the cmux Claude wrapper, other agents through
#   `cmux hooks setup` — so both were removed from the repo.
#
#   `git pull` cannot undo a deployment: stow symlinks, merged live settings and
#   cached hook state all survive it. This script cleans up what pull leaves
#   behind. It is idempotent — running it on an already-clean machine is a no-op.
#
# Usage:
#   ./scripts/migrate-20260812-remove-cmux-notify.sh [--dry-run]
#
# Note: if you have NOT pulled yet, prefer `./scripts/stow-wrap.sh -D bin`
# before pulling. This script covers the case where the package directory is
# already gone and `stow -D` can no longer work.

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
STAMP="$(date +%Y%m%d-%H%M%S)"

DRY_RUN=0
for arg in "$@"; do
  case "$arg" in
    --dry-run|-n) DRY_RUN=1 ;;
    -h|--help) sed -n '3,26p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "Unknown option: $arg" >&2; exit 2 ;;
  esac
done

BLOCKED=0
CHANGED=0

say()  { printf '%s\n' "$*"; }
step() { printf '\n== %s\n' "$*"; }
skip() { printf '   略過：%s\n' "$*"; }
did()  { printf '   已處理：%s\n' "$*"; CHANGED=$((CHANGED + 1)); }
warn() { printf '   ⚠ %s\n' "$*" >&2; }

run() {
  if [[ $DRY_RUN -eq 1 ]]; then
    printf '   [dry-run] %s\n' "$*"
  else
    "$@"
  fi
}

# ---------------------------------------------------------------------------
step "1/5 檢查 ~/.local 是否被 stow 折疊"
# 這是最嚴重的一項：若 ~/.local 是指向 repo 的 symlink，則 uv、Claude Code
# installer 等工具安裝的內容（可達數 GB）實際存放在 dotfiles 內。必須先搬回
# 家目錄再處理其他步驟，且因為涉及大量資料搬移，這裡只偵測不自動執行。
if [[ -L "$HOME/.local" ]]; then
  target="$(readlink "$HOME/.local")"
  warn "~/.local 是 symlink → $target"
  warn "請先手動搬回實體目錄，再重跑本腳本："
  warn "    mv \"\$(cd \"\$(dirname \"$HOME/.local\")\" && readlink -f ~/.local)\" /tmp/local-real"
  warn "    rm ~/.local && mv /tmp/local-real ~/.local"
  BLOCKED=1
else
  skip "~/.local 已是真實目錄"
fi

# ---------------------------------------------------------------------------
step "2/5 移除 cmux-notify 的 stow symlink"
if [[ -L "$HOME/.local/bin/cmux-notify" ]]; then
  run rm "$HOME/.local/bin/cmux-notify" && did "~/.local/bin/cmux-notify"
elif [[ -e "$HOME/.local/bin/cmux-notify" ]]; then
  warn "~/.local/bin/cmux-notify 存在但不是 symlink，未自動刪除；請自行確認來源"
else
  skip "~/.local/bin/cmux-notify 不存在"
fi

# ---------------------------------------------------------------------------
step "3/5 移除手寫的 Codex hooks.json symlink"
# cmux 會自行管理這個檔案（cmux hooks setup codex），不再由 dotfiles 提供
if [[ -L "$HOME/.codex/hooks.json" ]]; then
  link_target="$(readlink "$HOME/.codex/hooks.json")"
  case "$link_target" in
    *dotfiles/config/codex*)
      run rm "$HOME/.codex/hooks.json" && did "~/.codex/hooks.json（指向 dotfiles）"
      ;;
    *)
      skip "~/.codex/hooks.json 指向 $link_target，非本 repo 產生，保留"
      ;;
  esac
elif [[ -e "$HOME/.codex/hooks.json" ]]; then
  skip "~/.codex/hooks.json 是實體檔案（可能由 cmux hooks setup 產生），保留"
else
  skip "~/.codex/hooks.json 不存在"
fi

# ---------------------------------------------------------------------------
step "4/5 從 live ~/.claude/settings.json 移除 cmux-notify hooks"
# sync-ai-cli-settings.sh 只做合併（只增不減），因此從 settings.json.example
# 移除的項目不會自動從已部署的機器上消失，必須在此明確清除。
CLAUDE_SETTINGS="$HOME/.claude/settings.json"
if [[ ! -f "$CLAUDE_SETTINGS" ]]; then
  skip "$CLAUDE_SETTINGS 不存在"
elif ! command -v jq >/dev/null 2>&1; then
  warn "找不到 jq，略過此步（brew install jq 後重跑）"
  BLOCKED=1
elif ! grep -q "cmux-notify" "$CLAUDE_SETTINGS"; then
  skip "settings.json 內已無 cmux-notify"
else
  tmp="$(mktemp)"
  if jq '.hooks |= with_entries(
           .value |= (map(.hooks |= map(select((.command // "") | test("cmux-notify") | not))
                          | select((.hooks | length) > 0)))
           | select((.value | length) > 0))' "$CLAUDE_SETTINGS" > "$tmp"; then
    if [[ $DRY_RUN -eq 1 ]]; then
      say "   [dry-run] 將套用以下變更："
      diff <(jq -S . "$CLAUDE_SETTINGS") <(jq -S . "$tmp") | sed 's/^/     /'
      rm -f "$tmp"
    else
      cp -p "$CLAUDE_SETTINGS" "$CLAUDE_SETTINGS.bak-$STAMP"
      cat "$tmp" > "$CLAUDE_SETTINGS"   # 用 cat 覆寫以保留原檔權限
      rm -f "$tmp"
      did "settings.json（備份：settings.json.bak-${STAMP}）"
    fi
  else
    warn "jq 處理失敗，settings.json 未變更"
    rm -f "$tmp"
    BLOCKED=1
  fi
fi

# ---------------------------------------------------------------------------
step "5/5 清除 ~/.codex/config.toml 中的孤兒 hooks.state"
# 指向已刪除 hooks.json 的 trusted_hash 記錄。留著不影響功能，但若日後該路徑
# 重新出現且內容不同，雜湊對不上會擋下 hook。
CODEX_CONFIG="$HOME/.codex/config.toml"
if [[ ! -f "$CODEX_CONFIG" ]]; then
  skip "$CODEX_CONFIG 不存在"
elif ! grep -q 'hooks\.json:' "$CODEX_CONFIG"; then
  skip "config.toml 內已無孤兒 hooks.state"
else
  tmp="$(mktemp)"
  awk '
    /^\[hooks\.state\."[^"]*\/\.codex\/hooks\.json:[^"]*"\]$/ { skip = 1; next }
    skip && /^\[/ { skip = 0 }
    skip { next }
    { print }
  ' "$CODEX_CONFIG" > "$tmp"
  if [[ $DRY_RUN -eq 1 ]]; then
    say "   [dry-run] 將移除以下行："
    diff "$CODEX_CONFIG" "$tmp" | sed 's/^/     /'
    rm -f "$tmp"
  else
    cp -p "$CODEX_CONFIG" "$CODEX_CONFIG.bak-$STAMP"
    cat "$tmp" > "$CODEX_CONFIG"
    rm -f "$tmp"
    did "config.toml（備份：config.toml.bak-${STAMP}）"
  fi
fi

# ---------------------------------------------------------------------------
step "驗證"
broken=0
# dry-run 尚未實際刪除任何 symlink，此時檢查必然誤報，直接略過
if [[ $DRY_RUN -eq 1 ]]; then
  skip "dry-run 模式不檢查 broken symlink"
fi
for d in "$HOME/.local/bin" "$HOME/.codex" "$HOME/.claude" "$HOME/.config/claude"; do
  [[ $DRY_RUN -eq 1 ]] && break
  [[ -d "$d" ]] || continue
  while IFS= read -r link; do
    [[ -n "$link" ]] || continue
    warn "broken symlink: $link"
    broken=$((broken + 1))
  done < <(find "$d" -maxdepth 1 -type l ! -exec test -e {} \; -print 2>/dev/null)
done
[[ $DRY_RUN -eq 0 && $broken -eq 0 ]] && say "   無 broken symlink"

say ""
if [[ $DRY_RUN -eq 1 ]]; then
  say "dry-run 結束，未變更任何檔案。"
elif [[ $BLOCKED -ne 0 ]]; then
  say "完成 $CHANGED 項，但有步驟被跳過（見上方 ⚠），請處理後重跑。"
  exit 1
else
  say "完成，共處理 $CHANGED 項。"
fi

if [[ $broken -ne 0 ]]; then
  exit 1
fi

say ""
say "後續："
say "  - Claude Code 的 cmux 通知由 cmux Claude wrapper 自動注入，無須設定"
say "  - 其他 agent 需要時執行：cmux hooks setup <agent>（例如 codex）"
say "  - Telegram 完成通知（cc-notify.sh）不受影響，仍由 dotfiles 管理"
