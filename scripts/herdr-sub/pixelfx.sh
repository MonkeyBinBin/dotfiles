#!/usr/bin/env bash
set -euo pipefail

# Runs a pixelfx tool on the sub effects. pixelfx's tools only see effects inside its own checkout, so the
# sources in fx/ are synced into $PIXELFX_DIR/src/fx/ first (cloned on first use).
#
#   scripts/herdr-sub/pixelfx.sh render "sub/*" --gif --zoom 6
#   scripts/herdr-sub/pixelfx.sh check sub/captain

PIXELFX_DIR="${PIXELFX_DIR:-$HOME/.cache/pixelfx}"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

[ $# -ge 1 ] || { echo "usage: $0 <render|check|act|list|...> [args]" >&2; exit 1; }
[ -d "$PIXELFX_DIR" ] || git clone --depth 1 https://github.com/patch-gg/pixelfx "$PIXELFX_DIR"
rsync -a "$HERE/fx/" "$PIXELFX_DIR/src/fx/"
cd "$PIXELFX_DIR"
exec node "tools/$1.mjs" "${@:2}"
