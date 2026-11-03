#!/usr/bin/env node
// Bakes the pixelfx effects into GIFs and PNGs for the Herdr mods: the camp's (`camp`) and the sub's (`sub`).
//
//   node scripts/herdr-camp/bake.mjs            every asset
//   node scripts/herdr-camp/bake.mjs campfire   only the named ones
//
// Each asset: render the effect with pixelfx, crop it to a window in the effect's own coordinates (feet / base
// at 0, 0), bake the band's ground under the feet (`ground`), optionally vignette a big glow round its source, composite it over the band's background colour (GIF has no partial alpha, so glow is baked in),
// fade the edges into that colour so light never ends on a hard line, scale it up nearest-neighbour and encode
// it with ffmpeg. `alpha` keeps transparency instead (PNG, or a GIF with one transparent color). The mod shows each GIF at half its size: on a 2x screen that's 1:1, and on a 1x screen the
// even downscale keeps the pixels crisp.
//
// pixelfx (https://github.com/patch-gg/pixelfx, MIT) is cloned to $PIXELFX_DIR (default ~/.cache/pixelfx);
// the sources in fx/ are synced into it first.

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, relative } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "../..");
const MODS = join(REPO, "config/herdr-app/.config/herdr-app/mods");
const outOf = (a) => join(MODS, a.mod ?? "camp", "assets");
const PIXELFX = process.env.PIXELFX_DIR ?? join(homedir(), ".cache/pixelfx");

// The default background (the band's: the camp theme's `canvas`), the upscale factor, the edge fade in native px.
// An asset's `bg` overrides it: whatever the mod shows that GIF on.
const BG = "#151324", SCALE = 4, EDGE = 6;
const SLOT = "#1d1b2f", CHROME = "#221f38", PLAQUE = "#2e1c10";
// The band's ground: the rows below the feet (local y >= 1) are grass then soil, as the band draws them.
const GRASS = "#3f6e40", SOIL = "#1d3a24";
const CREST = [-18, -38, 18, -12];
const tent = (palette) => ({ fx: "camp/tent", crop: [-8, -14, 8, 2], bg: SLOT, edge: 0, opts: { palette } });
const icon = (kind) => ({ fx: "camp/quest-icon", crop: [-8, -14, 8, 2], bg: SLOT, edge: 0, opts: { kind } });
const MONKEY = [-30, -56, 30, 4];
const MERC = [-12, -24, 12, 4];
const BLUE_FIRE = ["#0e1a4a", "#14307a", "#1f4fb8", "#2f7cf0", "#4fa8ff", "#7fd0ff", "#b8ecff", "#e6faff", "#ffffff"];

// Nine-slice frame kits: corner PNGs into the mod's assets, each side's color profile into the shared kit/frames.js.
const FRAME_SETS = [
  { fx: "camp/frame", mod: "camp", kinds: ["plaque", "note", "book"] },
  { fx: "sub/frame", mod: "sub", kinds: ["brass", "steel", "bezel"] },
];

// The sub: everything sits on its own background (alpha), except the sea's opaque scenery strips and the hull.
const sub = (fx, crop, extra = {}) => ({ fx, crop, mod: "sub", alpha: true, edge: 0, ...extra });
const MINISUB = { claude: ["#a8502a", "#e8875a", "#ffb48a", "#ffe0c8"], codex: ["#5a5a6a", "#a8a8b8", "#d8d8e0", "#ffffff"], gemini: ["#3a50a8", "#6a90e8", "#a8c8ff", "#e0ecff"], other: ["#4a2a7a", "#8a5ad0", "#c0a0ff", "#ece0ff"] };
const SUB_ASSETS = {
  hull: { fx: "sub/hull", crop: [0, 0, 720, 450], mod: "sub", png: true, edge: 0 },
  ...Object.fromEntries(["idle", "alarm", "happy", "sleep"].map((mood) => [`captain-${mood}`, sub("sub/captain", [-46, -66, 52, 4], { opts: { mood } })])),
  ...Object.fromEntries(Object.entries(MINISUB).flatMap(([tool, palette]) => [
    [`minisub-${tool}`, sub("sub/minisub", [-14, -12, 12, 8], { opts: { palette } })],
    [`minisub-${tool}-loot`, sub("sub/minisub", [-14, -12, 12, 18], { opts: { palette, loot: true } })],
  ])),
  sonar: sub("sub/sonar", [-70, -70, 70, 70]),
  ...Object.fromEntries(["blocked", "done", "working", "idle", "focus"].map((kind) => [`blip-${kind}`, sub("sub/blip", [-10, -10, 10, 10], { opts: { kind } })])),
  ...Object.fromEntries(["blocked", "done", "working", "idle"].map((kind) => [`lamp-${kind}`, sub("sub/lamp", [-5, -5, 5, 5], { opts: { kind } })])),
  "sea-sky": { fx: "sub/sea", crop: [0, 0, 176, 64], mod: "sub", edge: 0, opts: { kind: "sky" } },
  "sea-surface": { fx: "sub/sea", crop: [0, 0, 176, 40], mod: "sub", edge: 0, opts: { kind: "surface" } },
  "sea-seabed": { fx: "sub/sea", crop: [0, 0, 176, 30], mod: "sub", edge: 0, opts: { kind: "seabed" } },
  fish: sub("sub/sea", [0, 0, 24, 16], { opts: { kind: "fish" } }),
  // the pane header's signals: a turning red beacon (blocked), rising bubbles (working)
  beacon: sub("sub/signal", [0, 0, 14, 16], { opts: { kind: "beacon" } }),
  bubbles: sub("sub/signal", [0, 0, 48, 16], { opts: { kind: "bubbles" }, fps: 12 }),
  jelly: sub("sub/sea", [0, 0, 20, 18], { opts: { kind: "jelly" } }),
};

export const ASSETS = {
  sky: { fx: "camp/sky", crop: [0, -270, 480, 0], png: true, edge: 0 },
  // the adventure log's illustration: him cheering, drawn on the book's parchment
  "log-portrait": { fx: "camp/monkey-happy", crop: [-30, -52, 30, 4], bg: "#efe0bc", edge: 0 },
  // the stage's signpost: blank boards the band writes the tally on (BOARDS in camp/signpost.js)
  signpost: { fx: "camp/signpost", crop: [-10, -56, 30, 4], ground: true, glow: [4, -42] },
  // the stage's top edge, tiled: pines against the sky (alpha)
  treeline: { fx: "camp/treeline", crop: [0, -12, 64, 0], png: true, alpha: true, edge: 0 },
  // the lists' menu cursor, on any background (alpha)
  cursor: { fx: "camp/quest-icon", crop: [-6, -12, 4, -2], png: true, alpha: true, edge: 0, opts: { kind: "cursor" } },
  coin: { fx: "pickups/coin-spin", crop: [-10, -28, 10, -6], bg: PLAQUE, edge: 0, glow: [0, -17], fps: 15 },
  "monkey-idle": { fx: "camp/monkey-idle", crop: MONKEY, ground: true },
  "monkey-sleep": { fx: "camp/monkey-sleep", crop: MONKEY, ground: true },
  "monkey-alarm": { fx: "camp/monkey-alarm", crop: MONKEY, ground: true },
  "monkey-happy": { fx: "camp/monkey-happy", crop: MONKEY, ground: true },
  campfire: { fx: "fire/campfire", crop: [-28, -56, 28, 4], fps: 15, vignette: [0, -12], ground: true, opts: { height: 16 } },
  "campfire-blue": { fx: "fire/campfire", crop: [-28, -56, 28, 4], fps: 15, vignette: [0, -12], ground: true, opts: { height: 16, palette: BLUE_FIRE } },
  "crest-idle": { fx: "camp/monkey-idle", crop: CREST, bg: PLAQUE, edge: 0 },
  "crest-sleep": { fx: "camp/monkey-sleep", crop: CREST, bg: PLAQUE, edge: 0 },
  "crest-alarm": { fx: "camp/monkey-alarm", crop: CREST, bg: PLAQUE, edge: 0 },
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
  "merc-orange": { fx: "camp/merc", crop: MERC, ground: true, opts: { palette: ["#7a3414", "#c8622a", "#f0905a", "#ffc49a"] } },
  "merc-green": { fx: "camp/merc", crop: MERC, ground: true, opts: { palette: ["#1a5a36", "#2f9a5a", "#5ad08a", "#a8f0c4"] } },
  "merc-purple": { fx: "camp/merc", crop: MERC, ground: true, opts: { palette: ["#3c2a7a", "#6a4fc8", "#a98cff", "#d8ccff"] } },
  "merc-blue": { fx: "camp/merc", crop: MERC, ground: true, opts: { palette: ["#1d4a8a", "#2f7cd0", "#5cb6ff", "#b0e0ff"] } },
  ...SUB_ASSETS,
};

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { stdio: ["pipe", "inherit", "inherit"], maxBuffer: 1 << 30, ...opts });
  if (r.error || r.status !== 0) throw new Error(`${cmd} ${args.join(" ")} failed${r.error ? `: ${r.error.message}` : ""}`);
}

if (!existsSync(PIXELFX)) run("git", ["clone", "--depth", "1", "https://github.com/patch-gg/pixelfx", PIXELFX]);
run("rsync", ["-a", join(HERE, "fx") + "/", join(PIXELFX, "src/fx") + "/"]);

const { loadEffect, renderFrames, upscale } = await import(pathToFileURL(join(PIXELFX, "tools/lib/fxlib.mjs")).href);
const { encodePNG } = await import(pathToFileURL(join(PIXELFX, "tools/lib/png.mjs")).href);
const { composite, hex } = await import(pathToFileURL(join(PIXELFX, "src/core/index.js")).href);

const rgb = (c) => [c & 255, (c >>> 8) & 255, (c >>> 16) & 255];

function bake(name, a) {
  const sky = hex(a.bg ?? BG), grass = hex(GRASS), soil = hex(SOIL), E = a.edge ?? EDGE;
  // the background at local row y: sky, or the band's ground under the feet
  const bgAt = (ly) => (a.ground && ly >= 2 ? soil : a.ground && ly >= 1 ? grass : sky);
  return loadEffect(a.fx).then((fx) => {
    const r = renderFrames(fx, { fps: a.fps, seed: a.seed, bg: "none", options: a.opts, actor: false });
    const [OX, OY] = fx.meta.origin, [x0, y0, x1, y1] = a.crop;
    const bgs = new Uint32Array(r.w * r.h);
    for (let y = 0; y < r.h; y++) bgs.fill(bgAt(y - OY), y * r.w, (y + 1) * r.w);
    const cx = OX + x0, cy = OY + y0, w = x1 - x0, h = y1 - y0;
    if (cx < 0 || cy < 0 || cx + w > r.w || cy + h > r.h) throw new Error(`${name}: crop ${a.crop} leaves the ${r.w}x${r.h} canvas`);
    const frames = r.frames.map((f) => {
      let light = f.light;
      if (a.glow) {
        // small glows: fade only the light on an ellipse round the source, so the thing itself keeps its colors
        const [vx, vy] = a.glow;
        light = f.light.slice();
        for (let py = 0; py < r.h; py++)
          for (let px = 0; px < r.w; px++) {
            const i = py * r.w + px, l = light[i];
            if (!(l & 0xffffff)) continue;
            const ex = (px - OX + 0.5 - vx) / (w / 2), ey = (py - OY + 0.5 - vy) / (h / 2);
            const k = Math.max(0, Math.min(1, (1 - Math.hypot(ex, ey)) / 0.6));
            light[i] = (l & 0xff000000) | Math.round((l & 255) * k) | (Math.round(((l >>> 8) & 255) * k) << 8) | (Math.round(((l >>> 16) & 255) * k) << 16);
          }
      }
      const full = a.alpha ? f.clear : composite({ w: r.w, h: r.h, color: f.raw, light }, new Uint8ClampedArray(r.w * r.h * 4), bgs);
      const out = new Uint8ClampedArray(w * h * 4);
      for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++) {
          const s = ((cy + y) * r.w + cx + x) * 4, d = (y * w + x) * 4, bgRGB = rgb(bgAt(y + y0));
          let k = E ? Math.min(1, (Math.min(x, y, w - 1 - x, h - 1 - y) + 0.5) / E) : 1;
          if (a.vignette) {
            // big glows: fade out on an ellipse round the source, reaching the background before the crop edge
            const [vx, vy] = a.vignette, ex = (x + x0 + 0.5 - vx) / (w / 2), ey = (y + y0 + 0.5 - vy) / (h * 0.62);
            k = Math.min(k, Math.max(0, Math.min(1, (1 - Math.hypot(ex, ey)) / 0.5)));
          }
          if (a.alpha) out.set(full.subarray(s, s + 4), d);
          else {
            for (let c = 0; c < 3; c++) out[d + c] = bgRGB[c] + (full[s + c] - bgRGB[c]) * k;
            out[d + 3] = 255;
          }
        }
      return Buffer.from(upscale(out, w, h, SCALE).buffer);
    });
    if (a.png) {
      const file = join(outOf(a), `${name}.png`);
      writeFileSync(file, encodePNG(w * SCALE, h * SCALE, new Uint8ClampedArray(frames[0].buffer, frames[0].byteOffset, frames[0].byteLength)));
      console.log(`${name.padEnd(14)}   1 frame   ${w}x${h} -> ${w * SCALE}x${h * SCALE}  ${(statSync(file).size / 1024).toFixed(0)} KB  ${relative(REPO, file)}`);
      return;
    }
    const file = join(outOf(a), `${name}.gif`);
    // with alpha: one palette slot for transparency, and every frame whole (no diffing against the last one,
    // which would leave stale pixels where a frame turns transparent)
    const vf = a.alpha
      ? "split[a][b];[a]palettegen=max_colors=255:reserve_transparent=1:stats_mode=full[p];[b][p]paletteuse=dither=none:alpha_threshold=128"
      : "split[a][b];[a]palettegen=max_colors=255:stats_mode=full[p];[b][p]paletteuse=dither=none";
    run("ffmpeg", ["-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "rgba", "-s", `${w * SCALE}x${h * SCALE}`, "-r", String(r.fps), "-i", "-",
      "-vf", vf, ...(a.alpha ? ["-gifflags", "-offsetting-transdiff"] : []), "-loop", "0", file],
      { input: Buffer.concat(frames) });
    console.log(`${name.padEnd(14)} ${String(r.n).padStart(3)} frames  ${w}x${h} -> ${w * SCALE}x${h * SCALE}  ${(statSync(file).size / 1024).toFixed(0)} KB  ${relative(REPO, file)}`);
  });
}

const hex8 = (rgba, i) => "#" + [0, 1, 2, 3].map((c) => rgba[i + c].toString(16).padStart(2, "0")).join("");

// One sample frame per kind, sliced: corners to PNG (with alpha), sides to color profiles in screen order.
async function bakeFrames() {
  const kits = {};
  for (const set of FRAME_SETS) {
  const fx = await loadEffect(set.fx), OUT = join(MODS, set.mod, "assets");
  for (const kind of set.kinds) {
    const k = fx.mod.KINDS[kind], r = renderFrames(fx, { bg: "none", options: { kind }, actor: false });
    const px = r.frames[0].clear, W = r.w, H = r.h, { cx, cy } = k;
    const at = (x, y) => hex8(px, (y * W + x) * 4);
    const corner = (x0, y0) => {
      const out = new Uint8ClampedArray(cx * cy * 4);
      for (let y = 0; y < cy; y++) for (let x = 0; x < cx; x++) out.set(px.subarray(((y0 + y) * W + x0 + x) * 4, ((y0 + y) * W + x0 + x) * 4 + 4), (y * cx + x) * 4);
      return encodePNG(cx * SCALE, cy * SCALE, upscale(out, cx, cy, SCALE));
    };
    for (const [n, x0, y0] of [["tl", 0, 0], ["tr", W - cx, 0], ["bl", 0, H - cy], ["br", W - cx, H - cy]])
      writeFileSync(join(OUT, `frame-${kind}-${n}.png`), corner(x0, y0));
    const mx = W >> 1, my = H >> 1, range = (a, n) => Array.from({ length: n }, (_, i) => a + i);
    kits[kind] = {
      art: `mods/${set.mod}/assets`, cx, cy, fill: k.fill,
      top: range(0, cy).map((y) => at(mx, y)),
      bottom: range(H - cy, cy).map((y) => at(mx, y)),
      left: range(0, cx).map((x) => at(x, my)),
      right: range(W - cx, cx).map((x) => at(x, my)),
    };
    console.log(`frame-${kind.padEnd(8)} corners ${cx}x${cy} -> 4 PNGs, sides -> frames.js`);
  }
  }
  writeFileSync(join(REPO, "config/herdr-app/kit/frames.js"),
    "// Generated by scripts/herdr-camp/bake.mjs from the camp/frame and sub/frame effects: don't edit, re-bake.\n" +
    "// Per kind: where its corner PNGs are (art), side thickness in native px (cx left/right, cy top/bottom), the fill, and each side's colors in\n" +
    "// screen order (top: outside to inside, bottom: inside to outside, left: outside in, right: inside out).\n" +
    `export const FRAMES = ${JSON.stringify(kits, null, 2)};\n`);
}

for (const m of ["camp", "sub"]) mkdirSync(join(MODS, m, "assets"), { recursive: true });
const pick = process.argv.slice(2);
for (const [name, a] of Object.entries(ASSETS)) if (!pick.length || pick.includes(name)) await bake(name, a);
if (!pick.length || pick.includes("frames")) await bakeFrames();
