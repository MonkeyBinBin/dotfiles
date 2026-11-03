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
  case "$name" in sub*) rsync -a --delete "$REPO/config/herdr-app/kit/" "$mod/kit/" ;; esac
  if [ -L "$DEST/mods/$name" ]; then rm "$DEST/mods/$name"; fi
  rsync -a --delete --exclude gpui-kit.d.ts --exclude jsconfig.json "$mod" "$DEST/mods/$name/"
  echo "copied mods/$name"
done

# The sub's 8-bit alerts (scripts/herdr-sub/sfx.mjs), unless settings.json already names other sounds.
node -e '
const fs = require("fs"), file = process.argv[1];
const s = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : {};
s.sounds ??= { enabled: true };
let changed = false;
for (const k of ["done", "blocked"]) {
  const want = `mods/sub/sounds/${k}.mp3`;
  if (!s.sounds[k] || /^mods\/(camp|sub)\//.test(s.sounds[k])) changed ||= s.sounds[k] !== want, (s.sounds[k] = want);
}
if (changed) fs.writeFileSync(file, JSON.stringify(s, null, 2) + "\n"), console.log("settings.json: sub sounds");
' "$DEST/settings.json"
