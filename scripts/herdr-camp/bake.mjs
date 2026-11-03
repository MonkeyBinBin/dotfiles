#!/usr/bin/env node
// Bakes the camp's pixelfx effects into GIFs for the Herdr `camp` mod.
//
//   node scripts/herdr-camp/bake.mjs            every asset
//   node scripts/herdr-camp/bake.mjs campfire   only the named ones
//
// Each asset: render the effect with pixelfx, crop it to a window in the effect's own coordinates (feet / base
// at 0, 0), optionally vignette a big glow round its source, composite it over the band's background colour (GIF has no partial alpha, so glow is baked in),
// fade the edges into that colour so light never ends on a hard line, scale it up nearest-neighbour and encode
// it with ffmpeg. The mod shows each GIF at half its size: on a 2x screen that's 1:1, and on a 1x screen the
// even downscale keeps the pixels crisp.
//
// pixelfx (https://github.com/patch-gg/pixelfx, MIT) is cloned to $PIXELFX_DIR (default ~/.cache/pixelfx);
// the sources in fx/ are synced into it first.

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, relative } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "../..");
const OUT = join(REPO, "config/herdr-app/.config/herdr-app/mods/camp/assets");
const PIXELFX = process.env.PIXELFX_DIR ?? join(homedir(), ".cache/pixelfx");

// The default background (the band's: the camp theme's `canvas`), the upscale factor, the edge fade in native px.
// An asset's `bg` overrides it: whatever the mod shows that GIF on.
const BG = "#151324", SCALE = 4, EDGE = 6;
const SLOT = "#1d1b2f", CHROME = "#221f38";
const CREST = [-18, -38, 18, -12];
const tent = (palette) => ({ fx: "camp/tent", crop: [-8, -14, 8, 2], bg: SLOT, edge: 0, opts: { palette } });
const icon = (kind) => ({ fx: "camp/quest-icon", crop: [-8, -14, 8, 2], bg: SLOT, edge: 0, opts: { kind } });
const MONKEY = [-30, -56, 30, 4];
const BLUE_FIRE = ["#0e1a4a", "#14307a", "#1f4fb8", "#2f7cf0", "#4fa8ff", "#7fd0ff", "#b8ecff", "#e6faff", "#ffffff"];

export const ASSETS = {
  "monkey-idle": { fx: "camp/monkey-idle", crop: MONKEY },
  "monkey-sleep": { fx: "camp/monkey-sleep", crop: MONKEY },
  "monkey-alarm": { fx: "camp/monkey-alarm", crop: MONKEY },
  "monkey-happy": { fx: "camp/monkey-happy", crop: MONKEY },
  campfire: { fx: "fire/campfire", crop: [-28, -56, 28, 4], fps: 15, vignette: [0, -12], opts: { height: 16 } },
  "campfire-blue": { fx: "fire/campfire", crop: [-28, -56, 28, 4], fps: 15, vignette: [0, -12], opts: { height: 16, palette: BLUE_FIRE } },
  "crest-idle": { fx: "camp/monkey-idle", crop: CREST, bg: CHROME, edge: 0 },
  "crest-sleep": { fx: "camp/monkey-sleep", crop: CREST, bg: CHROME, edge: 0 },
  "crest-alarm": { fx: "camp/monkey-alarm", crop: CREST, bg: CHROME, edge: 0 },
  "icon-blocked": icon("blocked"),
  "icon-done": icon("done"),
  "icon-working": icon("working"),
  "icon-idle": icon("idle"),
  // one tent per space color (the spaces mod's palette: ansi6 3 4 5 2 1 in the camp theme)
  "tent-ansi6": tent(["#1f5a6a", "#3fa8b8", "#8fe0e8"]),
  "tent-ansi3": tent(["#7a5a14", "#d8a830", "#ffe08a"]),
  "tent-ansi4": tent(["#1d4a8a", "#3f8ad8", "#8ccdff"]),
  "tent-ansi5": tent(["#5a2a7a", "#a85ad0", "#e0a8ff"]),
  "tent-ansi2": tent(["#2a5a1e", "#5aa83a", "#aaf08c"]),
  "tent-ansi1": tent(["#6a1e1a", "#c8463a", "#ff8a7f"]),
  "merc-orange": { fx: "camp/merc", crop: [-12, -24, 12, 2], opts: { palette: ["#7a3414", "#c8622a", "#f0905a", "#ffc49a"] } },
  "merc-green": { fx: "camp/merc", crop: [-12, -24, 12, 2], opts: { palette: ["#1a5a36", "#2f9a5a", "#5ad08a", "#a8f0c4"] } },
  "merc-purple": { fx: "camp/merc", crop: [-12, -24, 12, 2], opts: { palette: ["#3c2a7a", "#6a4fc8", "#a98cff", "#d8ccff"] } },
  "merc-blue": { fx: "camp/merc", crop: [-12, -24, 12, 2], opts: { palette: ["#1d4a8a", "#2f7cd0", "#5cb6ff", "#b0e0ff"] } },
};

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { stdio: ["pipe", "inherit", "inherit"], maxBuffer: 1 << 30, ...opts });
  if (r.error || r.status !== 0) throw new Error(`${cmd} ${args.join(" ")} failed${r.error ? `: ${r.error.message}` : ""}`);
}

if (!existsSync(PIXELFX)) run("git", ["clone", "--depth", "1", "https://github.com/patch-gg/pixelfx", PIXELFX]);
run("rsync", ["-a", join(HERE, "fx") + "/", join(PIXELFX, "src/fx") + "/"]);

const { loadEffect, renderFrames, upscale } = await import(pathToFileURL(join(PIXELFX, "tools/lib/fxlib.mjs")).href);
const { composite, hex } = await import(pathToFileURL(join(PIXELFX, "src/core/index.js")).href);

function bake(name, a) {
  const bg = hex(a.bg ?? BG), bgRGB = [bg & 255, (bg >>> 8) & 255, (bg >>> 16) & 255], E = a.edge ?? EDGE;
  return loadEffect(a.fx).then((fx) => {
    const r = renderFrames(fx, { fps: a.fps, seed: a.seed, bg: "none", options: a.opts, actor: false });
    const [OX, OY] = fx.meta.origin, [x0, y0, x1, y1] = a.crop;
    const cx = OX + x0, cy = OY + y0, w = x1 - x0, h = y1 - y0;
    if (cx < 0 || cy < 0 || cx + w > r.w || cy + h > r.h) throw new Error(`${name}: crop ${a.crop} leaves the ${r.w}x${r.h} canvas`);
    const frames = r.frames.map((f) => {
      const full = composite({ w: r.w, h: r.h, color: f.raw, light: f.light }, new Uint8ClampedArray(r.w * r.h * 4), bg);
      const out = new Uint8ClampedArray(w * h * 4);
      for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++) {
          const s = ((cy + y) * r.w + cx + x) * 4, d = (y * w + x) * 4;
          let k = E ? Math.min(1, (Math.min(x, y, w - 1 - x, h - 1 - y) + 0.5) / E) : 1;
          if (a.vignette) {
            // big glows: fade out on an ellipse round the source, reaching the background before the crop edge
            const [vx, vy] = a.vignette, ex = (x + x0 + 0.5 - vx) / (w / 2), ey = (y + y0 + 0.5 - vy) / (h * 0.62);
            k = Math.min(k, Math.max(0, Math.min(1, (1 - Math.hypot(ex, ey)) / 0.5)));
          }
          for (let c = 0; c < 3; c++) out[d + c] = bgRGB[c] + (full[s + c] - bgRGB[c]) * k;
          out[d + 3] = 255;
        }
      return Buffer.from(upscale(out, w, h, SCALE).buffer);
    });
    const file = join(OUT, `${name}.gif`);
    run("ffmpeg", ["-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "rgba", "-s", `${w * SCALE}x${h * SCALE}`, "-r", String(r.fps), "-i", "-",
      "-vf", "split[a][b];[a]palettegen=max_colors=255:stats_mode=full[p];[b][p]paletteuse=dither=none", "-loop", "0", file],
      { input: Buffer.concat(frames) });
    console.log(`${name.padEnd(14)} ${String(r.n).padStart(3)} frames  ${w}x${h} -> ${w * SCALE}x${h * SCALE}  ${(statSync(file).size / 1024).toFixed(0)} KB  ${relative(REPO, file)}`);
  });
}

mkdirSync(OUT, { recursive: true });
const pick = process.argv.slice(2);
for (const [name, a] of Object.entries(ASSETS)) if (!pick.length || pick.includes(name)) await bake(name, a);
