#!/usr/bin/env bash
set -euo pipefail

# Installs the sub into the Herdr app home: layouts, themes and fonts are stowed (symlinks), mods are copied,
# because Herdr won't load a mod's images through a symlink, each sub mod with the shared kit/ inside. Re-run after editing a mod, or keep
# scripts/herdr-sub/dev-watch.mjs running while you work.

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SRC="$REPO/config/herdr-app/.config/herdr-app"
DEST="${HERDR_APP_HOME:-$HOME/.config/herdr-app}"

"$REPO/scripts/stow-wrap.sh" herdr-app
for mod in "$SRC"/mods/*/; do
  name="$(basename "$mod")"
  # the kit also goes into the source copy (gitignored), so a Herdr still loading the mod from dotfiles (it
  # remembers where a once-symlinked mod really lived) and `herdr-app check` on the repo both resolve it
  case "$name" in sub*|dispatch*) rsync -a --delete "$REPO/config/herdr-app/kit/" "$mod/kit/" ;; esac
  if [ -L "$DEST/mods/$name" ]; then rm "$DEST/mods/$name"; fi
  rsync -a --delete --exclude gpui-kit.d.ts --exclude jsconfig.json "$mod" "$DEST/mods/$name/"
  echo "copied mods/$name"
done
