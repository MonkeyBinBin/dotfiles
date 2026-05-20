#!/usr/bin/env bash
set -euo pipefail

# 同步 AI CLI 工具的 settings.json：
# - 目標檔不存在 → 直接從 .example 複製
# - 目標檔已存在 → 用 jq 智慧合併（permissions/hooks 取聯集，不覆蓋使用者自訂的 plugins、MCP servers）
#
# 用法：
#   scripts/sync-ai-cli-settings.sh [--dry-run] [--debug] [pkg ...]
#
# 預設處理 claude 套件，可指定子集合。
# 此腳本由 stow-wrap.sh 在部署完 AI CLI 套件後自動呼叫，亦可單獨執行。

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MERGE_FILTER="$REPO_ROOT/scripts/lib/merge-settings.jq"
DEFAULT_PKGS=(claude)

DRY_RUN=0
DEBUG=0
pkgs=()

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run|-n) DRY_RUN=1; shift ;;
    --debug)      DEBUG=1; shift ;;
    --help|-h)
      sed -n '3,12p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    -*)
      echo "[sync-ai-cli-settings] Unknown flag: $1" >&2
      exit 2
      ;;
    *)
      pkgs+=("$1"); shift
      ;;
  esac
done

if [[ ${#pkgs[@]} -eq 0 ]]; then
  pkgs=("${DEFAULT_PKGS[@]}")
fi

# jq 為必要相依：缺少時直接報錯，避免靜默降級
if ! command -v jq >/dev/null 2>&1; then
  cat >&2 <<'MSG'
Error: jq not found in PATH.

sync-ai-cli-settings.sh 需要 jq 進行 settings.json 合併。
請先安裝後再重試：

  brew install jq      # macOS
  sudo apt-get install jq   # Debian/Ubuntu
MSG
  exit 2
fi

if [[ ! -f "$MERGE_FILTER" ]]; then
  echo "[sync-ai-cli-settings] merge filter not found: $MERGE_FILTER" >&2
  exit 1
fi

log() { printf '[sync-ai-cli-settings] %s\n' "$*"; }
debug() { [[ $DEBUG -eq 1 ]] && printf '[sync-ai-cli-settings][debug] %s\n' "$*" >&2 || true; }

sync_pkg() {
  local pkg="$1"
  local example="$REPO_ROOT/config/$pkg/.$pkg/settings.json.example"
  local target="$HOME/.$pkg/settings.json"

  debug "pkg=$pkg example=$example target=$target"

  if [[ ! -f "$example" ]]; then
    log "skip ${pkg}: 範本不存在（${example}）"
    return 0
  fi

  if [[ ! -e "$target" ]]; then
    if [[ $DRY_RUN -eq 1 ]]; then
      log "[dry-run] ${pkg}: 將複製 ${example} → ${target}"
      return 0
    fi
    mkdir -p "$(dirname "$target")"
    cp "$example" "$target"
    log "$pkg: 已複製範本到 $target"
    return 0
  fi

  # 既存檔合併流程
  if [[ $DRY_RUN -eq 1 ]]; then
    log "[dry-run] ${pkg}: 將合併 ${example} → ${target}（jq 過濾器：${MERGE_FILTER}）"
    return 0
  fi

  local backup tmp
  backup="${target}.bak.$(date +%Y%m%d-%H%M%S)"
  tmp="$(mktemp "${target}.XXXXXX")"

  # 先嘗試合併到 tmp，成功再備份原檔並覆蓋
  if jq --slurpfile ex "$example" -f "$MERGE_FILTER" "$target" > "$tmp"; then
    cp "$target" "$backup"
    mv "$tmp" "$target"
    log "${pkg}: 已合併 settings.json（備份：${backup}）"
  else
    rm -f "$tmp"
    echo "[sync-ai-cli-settings] $pkg: jq 合併失敗，未變更原檔" >&2
    return 1
  fi
}

exit_code=0
for pkg in "${pkgs[@]}"; do
  if ! sync_pkg "$pkg"; then
    exit_code=1
  fi
done

exit $exit_code
