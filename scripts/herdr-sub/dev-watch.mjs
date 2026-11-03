#!/usr/bin/env node
// Keeps Herdr hot-reloading while you edit the sub in dotfiles. Herdr only sees file events under
// ~/.config/herdr-app itself, so:
// - stowed files (layouts, themes, fonts): edits land on the symlink targets, so the matching symlink in the
//   Herdr home is `touch -h`ed;
// - mods: they're copies (Herdr won't load images through symlinks), so the changed mod is rsynced over.
//
//   node scripts/herdr-sub/dev-watch.mjs

import { spawnSync } from "node:child_process";
import { watch, lstatSync, lutimesSync } from "node:fs";
import { dirname, join, resolve, sep } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const pkg = join(repo, "config/herdr-app/.config/herdr-app");
const kit = join(repo, "config/herdr-app/kit");
const home = process.env.HERDR_APP_HOME ?? join(homedir(), ".config/herdr-app");
const SKIP = new Set(["gpui-kit.d.ts", "jsconfig.json"]);

// The nearest ancestor of `rel` that is a symlink in the Herdr home (stow folds whole folders).
function linkFor(rel) {
  const parts = rel.split(sep);
  for (let i = 1; i <= parts.length; i++) {
    const p = join(home, ...parts.slice(0, i));
    try {
      if (lstatSync(p).isSymbolicLink()) return p;
    } catch {
      return null;
    }
  }
  return null;
}

const links = new Set(), mods = new Set();
let timer = null;

function copyMod(name) {
  // the shared kit goes into every sub mod (mods can't import across folders), the source copy too
  if (name.startsWith("sub")) spawnSync("rsync", ["-a", "--delete", kit + "/", join(pkg, "mods", name, "kit") + "/"], { stdio: "inherit" });
  const r = spawnSync("rsync", ["-a", "--delete", "--exclude", "gpui-kit.d.ts", "--exclude", "jsconfig.json",
    join(pkg, "mods", name) + "/", join(home, "mods", name) + "/"], { stdio: "inherit" });
  console.log(r.status === 0 ? `copied mods/${name}` : `rsync failed for mods/${name}`);
}

// a kit change reaches every sub mod
watch(kit, (_event, file) => {
  if (!file || file.startsWith(".")) return;
  const subs = spawnSync("ls", [join(pkg, "mods")], { encoding: "utf8" }).stdout.split("\n").filter((n) => n.startsWith("sub"));
  for (const m of subs) mods.add(m);
  clearTimeout(timer);
  timer = setTimeout(flush, 150);
});

watch(pkg, { recursive: true }, (_event, file) => {
  if (!file) return;
  const parts = file.split(sep);
  if (parts.some((s) => s.startsWith(".")) || SKIP.has(parts.at(-1))) return;
  if (parts[0] === "mods" && parts[2] === "kit") return;
  if (parts[0] === "mods" && parts.length > 2) mods.add(parts[1]);
  else {
    const link = linkFor(file);
    if (link) links.add(link);
  }
  clearTimeout(timer);
  timer = setTimeout(flush, 150);
});

function flush() {
  const now = new Date();
  for (const l of links) {
    lutimesSync(l, now, now);
    console.log(`reload ${l.slice(home.length + 1)}`);
  }
  for (const m of mods) copyMod(m);
  links.clear();
  mods.clear();
}
console.log(`watching ${pkg.slice(repo.length + 1)} -> ${home}`);
