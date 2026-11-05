#!/usr/bin/env node
// Bakes the sub's pixelfx effects into GIFs and PNGs for the Herdr `sub` mod.
//
//   node scripts/herdr-sub/bake.mjs            every asset
//   node scripts/herdr-sub/bake.mjs sonar      only the named ones
//
// Each asset: render the effect with pixelfx, crop it to a window in the effect's own coordinates, optionally
// vignette a big glow round its source, composite it over a background colour (`bg`; GIF has no partial alpha, so
// glow is baked in), fade the edges into that colour (`edge`), scale it up nearest-neighbour and encode it with
// ffmpeg. `alpha` keeps transparency instead (PNG, or a GIF with one transparent color). The mod shows each at
// half its size: on a 2x screen that's 1:1, and on a 1x screen the even downscale keeps the pixels crisp.
//
// `mirror` flips the crop left to right, for art drawn facing right that the mod shows facing left.
//
// Anything that must keep moving while the window is unfocused is a `sheet` instead of a GIF (GIFs only advance with
// focus): `count` frames, every `stride`th, side by side in one PNG, played there and back by kit/sprite.js. The
// frame count and period go into kit/sprites.js.
//
// pixelfx (https://github.com/patch-gg/pixelfx, MIT) is cloned to $PIXELFX_DIR (default ~/.cache/pixelfx);
// the sources in fx/ are synced into it first.

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, relative } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "../..");
const MODS = join(REPO, "config/herdr-app/.config/herdr-app/mods");
const outOf = (a) => join(MODS, a.mod ?? "sub", "assets");
const PIXELFX = process.env.PIXELFX_DIR ?? join(homedir(), ".cache/pixelfx");

// The default background (the sub's dark glass), the upscale factor, the default edge fade in native px.
const BG = "#03150f", SCALE = 4, EDGE = 6;

// Nine-slice frame kits: corner PNGs into the mod's assets, each side's color profile into the shared kit/frames.js.
const FRAME_SETS = [
  { fx: "sub/frame", mod: "sub", kinds: ["brass", "steel", "bezel", "panel", "key", "well"] },
];

// The sub: everything sits on its own background (alpha), except the sea's opaque scenery strips and the hull.
const sub = (fx, crop, extra = {}) => ({ fx, crop, mod: "sub", alpha: true, edge: 0, ...extra });
const still = { sheet: { count: 1, stride: 1 } }, sheet = (count, stride = 1) => ({ sheet: { count, stride } });
const MINISUB = { claude: ["#a8502a", "#e8875a", "#ffb48a", "#ffe0c8"], codex: ["#5a5a6a", "#a8a8b8", "#d8d8e0", "#ffffff"], gemini: ["#3a50a8", "#6a90e8", "#a8c8ff", "#e0ecff"], other: ["#4a2a7a", "#8a5ad0", "#c0a0ff", "#ece0ff"] };
const SUB_ASSETS = {
  hull: { fx: "sub/hull", crop: [0, 0, 720, 450], mod: "sub", png: true, edge: 0 },
  ...Object.fromEntries(["idle", "alarm", "happy", "sleep"].map((mood) => [`captain-${mood}`, sub("sub/captain", [-46, -66, 52, 4], { opts: { mood }, ...sheet(15, 2) })])),
  ...Object.fromEntries(Object.entries(MINISUB).flatMap(([tool, palette]) => [
    [`minisub-${tool}`, sub("sub/minisub", [-14, -12, 12, 8], { mirror: true, opts: { palette }, ...sheet(8) })],
    [`minisub-${tool}-loot`, sub("sub/minisub", [-14, -12, 12, 18], { mirror: true, opts: { palette, loot: true }, ...sheet(8) })],
    [`minisub-${tool}-moss`, sub("sub/minisub", [-14, -12, 12, 18], { mirror: true, opts: { palette, moss: true }, ...sheet(14) })],
    [`torpedo-${tool}`, sub("sub/torpedo", [-6, -3, 6, 4], { mirror: true, opts: { palette }, ...sheet(6) })],
  ])),
  // the pane header's sub, one sheet per mood (the surfaced one sits lower, showing the sea and its chest)
  ...Object.fromEntries([["dive", -52], ["sos", -52], ["idle", -52], ["surfaced", -48]].map(([state, top]) =>
    [`helm-sub-${state}`, sub("sub/helm-sub", [-56, top, 44, top + 48], { mirror: true, opts: { state, compact: true }, ...sheet(12, 3) })])),
  // the pane header's icons: the work, what a blocked agent is asking about, the loot of a sub that isn't Claude Code's, gauges
  ...Object.fromEntries(["edit", "bash", "read", "web", "agent", "gear", "ask", "chest", "o2", "fuel", "hull"].map((kind) =>
    [`helm-icon-${kind}`, sub("sub/helm-icons", [-8, -16, 8, 0], { opts: { kind }, ...sheet(12, 3) })])),
  ...Object.fromEntries(["o2", "fuel"].map((kind) =>
    [`helm-icon-${kind}-critical`, sub("sub/helm-icons", [-8, -16, 8, 0], { opts: { kind, critical: true }, ...sheet(12, 3) })])),
  // the scope without its sweep, the boat to lay over the sweep; the sweep itself is vector, see bakeSweep
  sonar: sub("sub/sonar", [-70, -70, 70, 70], { png: true, opts: { part: "scope" } }),
  "sonar-boat": sub("sub/sonar", [-5, -4, 5, 2], { png: true, mirror: true, opts: { part: "boat" } }),
  ...Object.fromEntries(["blocked", "done", "working", "idle", "focus"].map((kind) => [`blip-${kind}`, sub("sub/blip", [-10, -10, 10, 10], { opts: { kind }, ...(kind === "idle" ? still : sheet(14)) })])),
  ...Object.fromEntries(["blocked", "done", "working", "idle"].map((kind) => [`lamp-${kind}`, sub("sub/lamp", [-5, -5, 5, 5], { opts: { kind }, ...(kind === "blocked" ? sheet(2, 2) : still) })])),
  "sea-sky": { fx: "sub/sea", crop: [0, 0, 176, 64], mod: "sub", edge: 0, opts: { kind: "sky" }, ...sheet(4, 6) },
  "sea-water": { fx: "sub/sea", crop: [0, 0, 176, 40], mod: "sub", edge: 0, opts: { kind: "surface" }, ...sheet(12, 2) },
  ...Object.fromEntries([0, 1, 2, 3].map((n) => [`sea-ray-${n}`, sub("sub/sea", [0, 0, 176, 90], { png: true, opts: { kind: "ray", n } })])),
  "sea-seabed": { fx: "sub/sea", crop: [0, 0, 176, 30], mod: "sub", edge: 0, opts: { kind: "seabed" }, ...sheet(6, 4) },
  fish: sub("sub/sea", [0, 0, 24, 16], { opts: { kind: "fish" } }),
  // sea life: swimmers finning on the spot, one sheet per way they face (the mod moves them across their lanes);
  // crab and seahorse stay put too (the mod drifts them)
  ...Object.fromEntries([["shoal", "school", 14, 1], ["sea-turtle", "turtle", 14, 1], ["puffer", "puffer", 20, 2]].flatMap(([name, kind, count, stride]) => [["r", 1], ["l", -1]].map(([face, dir]) =>
    [`${name}-${face}`, sub("sub/critters", [0, 0, 40, 24], { opts: { kind, still: true, dir }, ...sheet(count, stride) })]))),
  // for the pane header's scenes
  ...Object.fromEntries([["r", 1], ["l", -1]].flatMap(([face, dir]) => [
    [`reef-shark-${face}`, sub("sub/critters", [0, 0, 44, 24], { opts: { kind: "shark", dir }, ...sheet(4, 2) })],
    [`angler-${face}`, sub("sub/critters", [0, 0, 40, 24], { opts: { kind: "angler", dir }, ...sheet(6, 2) })],
    [`great-whale-${face}`, sub("sub/critters", [0, 0, 120, 24], { opts: { kind: "humpback", dir }, ...sheet(8, 2) })],
  ])),
  "eel-colony": sub("sub/critters", [0, 0, 72, 42], { opts: { kind: "garden" }, ...sheet(14, 3) }),
  crab: sub("sub/critters", [0, 0, 24, 16], { opts: { kind: "crab" }, fps: 8, ...sheet(2) }),
  seahorse: sub("sub/critters", [0, 0, 16, 24], { opts: { kind: "seahorse" }, ...sheet(13, 2) }),
  // round a mini-sub: the pressure warning (under too long); the splash and the flare when it surfaces (the mod
  // shows them for one way of the sheet's there-and-back, so they play once)
  pressure: sub("sub/alert", [-20, -24, 20, 14], { opts: { kind: "pressure" }, ...sheet(14) }),
  splash: sub("sub/alert", [-20, -24, 20, 4], { opts: { kind: "splash" }, ...sheet(14) }),
  flare: sub("sub/alert", [-20, -40, 20, 4], { opts: { kind: "flare" }, ...sheet(14) }),
  // the pane header's signals: a turning red beacon (blocked), rising bubbles (working)
  beacon: sub("sub/signal", [0, 0, 14, 16], { opts: { kind: "beacon" }, ...sheet(14) }),
  bubbles: sub("sub/signal", [0, 0, 48, 16], { opts: { kind: "bubbles" }, fps: 12, ...sheet(14) }),
  // the control console: its brushed metal, a space's toggle switch, the engine order telegraph (emergency blinks)
  "metal-slab": { fx: "sub/metal", crop: [0, 0, 640, 48], mod: "sub", png: true, edge: 0, opts: { tone: "slab" } },
  "metal-panel": { fx: "sub/metal", crop: [0, 0, 640, 48], mod: "sub", png: true, edge: 0, opts: { tone: "panel" } },
  "log-badge": sub("sub/console", [0, 0, 18, 18], { png: true, opts: { kind: "log-badge" } }),
  "toggle-up": sub("sub/console", [0, 0, 7, 14], { png: true, opts: { kind: "toggle-up" } }),
  "toggle-down": sub("sub/console", [0, 0, 7, 14], { png: true, opts: { kind: "toggle-down" } }),
  ...Object.fromEntries(["stop", "ahead", "emergency"].map((order) => [`telegraph-${order}`, sub("sub/console", [0, 0, 36, 20], { opts: { kind: `telegraph-${order}` }, ...(order === "emergency" ? sheet(2, 2) : still) })])),
  // behind the conversation (layouts/sub.json): pixel art, enlarged here so the pixels stay square when it's stretched
  "window-view": { fx: "sub/viewport", crop: [0, 0, 1280, 480], mod: "sub", png: true, edge: 0, scale: 2 },
  jelly: sub("sub/sea", [0, 0, 20, 18], { opts: { kind: "jelly" }, ...sheet(12, 2) }),
};

export const ASSETS = {
  ...SUB_ASSETS,
};

// What kit/sprite.js needs per sheet; a partial bake keeps the rest.
const SPRITES_FILE = join(REPO, "config/herdr-app/kit/sprites.js");
const sprites = existsSync(SPRITES_FILE) ? JSON.parse(readFileSync(SPRITES_FILE, "utf8").match(/SPRITES = (\{[\s\S]*\});/)[1]) : {};

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
  const bg = hex(a.bg ?? BG), E = a.edge ?? EDGE;
  const bgAt = () => bg;
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
          const s = ((cy + y) * r.w + cx + (a.mirror ? w - 1 - x : x)) * 4, d = (y * w + x) * 4, bgRGB = rgb(bgAt(y + y0));
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
      return Buffer.from(upscale(out, w, h, a.scale ?? SCALE).buffer);
    });
    if (a.sheet) {
      const { count, stride } = a.sheet, W = w * SCALE, H = h * SCALE;
      if ((count - 1) * stride >= r.n) throw new Error(`${name}: wants frame ${(count - 1) * stride} of ${r.n}`);
      const out = new Uint8ClampedArray(W * count * H * 4);
      for (let i = 0; i < count; i++) {
        const f = frames[i * stride];
        for (let y = 0; y < H; y++) out.set(f.subarray(y * W * 4, (y + 1) * W * 4), (y * W * count + i * W) * 4);
      }
      const file = join(outOf(a), `${name}.png`);
      writeFileSync(file, encodePNG(W * count, H, out));
      sprites[name] = { n: count, period: Math.round((2000 * count * stride) / r.fps) };
      console.log(`${name.padEnd(20)} ${String(count).padStart(3)} sheet  ${W * count}x${H}  ${(statSync(file).size / 1024).toFixed(0)} KB`);
      return;
    }
    if (a.png) {
      const file = join(outOf(a), `${name}.png`);
      writeFileSync(file, encodePNG(w * (a.scale ?? SCALE), h * (a.scale ?? SCALE), new Uint8ClampedArray(frames[0].buffer, frames[0].byteOffset, frames[0].byteLength)));
      console.log(`${name.padEnd(14)}   1 frame   ${w}x${h} -> ${w * (a.scale ?? SCALE)}x${h * (a.scale ?? SCALE)}  ${(statSync(file).size / 1024).toFixed(0)} KB  ${relative(REPO, file)}`);
      return;
    }
    const file = join(outOf(a), `${name}.gif`);
    // with alpha: one palette slot for transparency, and every frame whole (no diffing against the last one,
    // which would leave stale pixels where a frame turns transparent)
    const vf = a.alpha
      ? "split[a][b];[a]palettegen=max_colors=255:reserve_transparent=1:stats_mode=full[p];[b][p]paletteuse=dither=none:alpha_threshold=128"
      : "split[a][b];[a]palettegen=max_colors=255:stats_mode=full[p];[b][p]paletteuse=dither=none";
    run("ffmpeg", ["-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "rgba", "-s", `${w * (a.scale ?? SCALE)}x${h * (a.scale ?? SCALE)}`, "-r", String(r.fps), "-i", "-",
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
    "// Generated by scripts/herdr-sub/bake.mjs from the sub/frame effect: don't edit, re-bake.\n" +
    "// Per kind: where its corner PNGs are (art), side thickness in native px (cx left/right, cy top/bottom), the fill, and each side's colors in\n" +
    "// screen order (top: outside to inside, bottom: inside to outside, left: outside in, right: inside out).\n" +
    `export const FRAMES = ${JSON.stringify(kits, null, 2)};\n`);
}

// The sonar sweep: masks the mod tints and turns (only an svg can spin), pointing straight up at rest. SVG has no
// conic gradient, and side by side slices show their seams, so the trail is a stack of faint wedges that all start at
// the arm and reach back further and further: the layers add up to `fade` with nothing between them to see. It starts
// clear of the boat at the center: a spinning svg paints over the mod's images whatever their order.
function bakeSweep() {
  const R = 60, BOAT = 7, SPAN = 100, at = (r, deg) => `${(Math.sin((deg * Math.PI) / 180) * r).toFixed(2)} ${(-Math.cos((deg * Math.PI) / 180) * r).toFixed(2)}`;
  const fade = (deg) => 0.8 * (1 - deg / SPAN) ** 1.8;
  const wedge = (to, o) => `<path d="M${at(BOAT, 0)}L${at(R, 0)}A${R} ${R} 0 0 0 ${at(R, -to)}L${at(BOAT, -to)}A${BOAT} ${BOAT} 0 0 1 ${at(BOAT, 0)}Z" fill="#fff" fill-opacity="${o.toFixed(4)}"/>`;
  let trail = "";
  for (let deg = SPAN; deg > 0; deg--) trail += wedge(deg, 1 - (1 - fade(deg - 1)) / (1 - fade(deg)));
  const svg = (body) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-70 -70 140 140" width="280" height="280">${body}</svg>\n`;
  writeFileSync(join(MODS, "sub/assets/sonar-trail.svg"), svg(trail));
  writeFileSync(join(MODS, "sub/assets/sonar-arm.svg"), svg(`<path d="M${at(BOAT, 1.2)}L${at(R, 1.2)}L${at(R, -1.2)}L${at(BOAT, -1.2)}Z" fill="#fff"/>`));
}

mkdirSync(join(MODS, "sub", "assets"), { recursive: true });
const pick = process.argv.slice(2);
for (const [name, a] of Object.entries(ASSETS)) if (!pick.length || pick.includes(name)) await bake(name, a);
if (!pick.length || pick.includes("frames")) await bakeFrames();
if (!pick.length || pick.includes("sonar")) bakeSweep();
writeFileSync(SPRITES_FILE, "// Generated by scripts/herdr-sub/bake.mjs: don't edit, re-bake.\n// Per sprite sheet: its frame count and the milliseconds for there and back.\n" +
  `export const SPRITES = ${JSON.stringify(sprites, null, 2)};\n`);
