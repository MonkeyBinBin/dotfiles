// What's behind the conversation: the view out of a round porthole in the middle of the hull. The same sea as the sea
// column beside it, at the same pixel size (one art pixel, two on screen), with the same creatures, drawn by the same
// code: a humpback passing, a turtle, a pufferfish, fish, jellies, garden eels in the sand, a crab and a seahorse,
// over the column's water, light and seabed colors. Brass ring in the frames' colors, plain hull round it. A layout's
// background only shows a still, so it's one moment of them all. Graded a little darker (grade) so text stays
// readable over it. The pane header covers the top 25 px, so the porthole sits low to look centered. Origin at the top left.

import { hex, red, green, blue, rgb } from "../../core/index.js";
import { draw as critter } from "./critters.js";
import { draw as seaPiece, WATER_TOP, WATER_DEEP } from "./sea.js";
import { plating } from "./hull.js";

export const meta = {
  name: "Viewport",
  desc: "The view out of a submarine's round brass porthole: the sea column's sea and creatures, in the same fine pixels.",
  tags: ["sub", "background", "still"],
  size: [1280, 480],
  origin: [0, 0],
  duration: 1,
  loop: true,
  fps: 1,
  bg: "dark",
  options: {},
};

const W = meta.size[0], H = meta.size[1];
const BAYER = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]];
const dither = (x, y) => (BAYER[y & 3][x & 3] + 0.5) / 16;

// The porthole: its glass, the brass ring round it and the steel flange the ring is bolted through.
const CX = 640, CY = 252, R = 112, RING = 11, FLANGE = 4;
const TOP = CY - R, BOTTOM = CY + R, SAND = BOTTOM - 34;
const dist = (x, y) => Math.hypot(x - CX, y - CY);
const onGlass = (x, y) => dist(x, y) <= R;

// One buffer, so the glass can tint what's already behind it.
const fb = new Int32Array(W * H);
const set = (x, y, c) => { if (x >= 0 && x < W && y >= 0 && y < H) fb[y * W + x] = c; };
const mix = (x, y, to, a) => {
  if (x < 0 || x >= W || y < 0 || y >= H) return;
  const c = fb[y * W + x], k = (f) => Math.round(f(c) + (f(to) - f(c)) * a);
  fb[y * W + x] = rgb(k(red), k(green), k(blue));
};
const plot = (x, y, c) => { if (onGlass(x, y)) set(x, y, c); };

// The painter the shared creatures draw on: their own coordinates, moved to (ox, oy), kept inside the glass.
const onto = (ox, oy, put = plot) => {
  const at = (x, y, c) => put(Math.round(x) + ox, Math.round(y) + oy, c);
  return {
    px: at,
    rect: (x, y, w, h, c) => { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) at(x + i, y + j, c); },
    shade: (x0, y0, x1, y1, fn) => { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) { const c = fn(x, y, {}); if (c) at(x, y, c); } },
    glow: () => {},
  };
};

function water() {
  const top = hex(WATER_TOP), deep = hex(WATER_DEEP), STEPS = 16;
  const shade = (f) => { const k = (g) => Math.round(g(top) + (g(deep) - g(top)) * f); return rgb(k(red), k(green), k(blue)); };
  for (let y = TOP; y <= BOTTOM; y++) {
    const f = ((y - TOP) / (BOTTOM - TOP)) * STEPS;
    for (let x = CX - R; x <= CX + R; x++) {
      const step = Math.floor(f) + (f - Math.floor(f) > dither(x, y) ? 1 : 0);
      plot(x, y, shade(Math.min(1, step / STEPS)));
    }
  }
  // the column's shafts of light, soft here as they are there when they fade
  for (const [ox, oy, n] of [[CX - 60, TOP - 6, 0], [CX + 4, TOP - 6, 1], [CX + 62, TOP - 6, 2], [CX + 118, TOP - 6, 3], [CX - 10, TOP + 80, 1], [CX + 70, TOP + 70, 3]])
    seaPiece(onto(ox, oy, (x, y, c) => { if (onGlass(x, y)) mix(x, y, c, 0.28); }), 0, { kind: "ray", n });
}

// Far reef, two rows, barely lighter than the water they stand in.
function reef() {
  for (const [base, amp, freq, phase, fill, lip] of [[SAND - 26, 9, 0.052, 0.6, "#0a2c3c", "#0e3848"], [SAND - 10, 6, 0.09, 2.3, "#07202c", "#0a2a38"]]) {
    for (let x = CX - R; x <= CX + R; x++) {
      const h = Math.round(base + Math.sin(x * freq + phase) * amp + Math.sin(x * freq * 2.7 + phase) * amp * 0.3);
      plot(x, h, hex(lip));
      for (let y = h + 1; y <= SAND + 4; y++) plot(x, y, hex(fill));
    }
  }
}

// The column's seabed, wider: sand in its colors, rocks and kelp the way it draws them.
function seabed() {
  const COLORS = ["#6a7a6a", "#3e4e46", "#2a3a36"].map(hex), ROCK = ["#3a4a5a", "#24303c", "#141c24"].map(hex);
  const surface = (x) => SAND + Math.round(2 * Math.sin(x * 0.08) + Math.sin(x * 0.27));
  for (const [rx, ry, a, b] of [[CX - 62, SAND + 2, 15, 9], [CX + 72, SAND + 1, 12, 8], [CX + 30, SAND + 12, 7, 4]])
    for (let y = ry - b; y <= ry; y++) for (let x = rx - a; x <= rx + a; x++) {
      const dx = (x - rx) / a, dy = (y - ry) / b;
      if (dx * dx + dy * dy <= 1) plot(x, y, dy < -0.45 ? ROCK[0] : dx > 0.3 ? ROCK[2] : ROCK[1]);
    }
  for (let x = CX - R; x <= CX + R; x++) {
    const h = surface(x);
    for (let y = h; y <= BOTTOM; y++) plot(x, y, y === h ? COLORS[0] : (x * 7 + y * 3) % 11 === 0 ? COLORS[2] : COLORS[1]);
  }
  for (const [rx, ry, a, b] of [[CX + 30, SAND + 12, 7, 4], [CX - 38, SAND + 22, 5, 3]])
    for (let y = ry - b; y <= ry; y++) for (let x = rx - a; x <= rx + a; x++) {
      const dx = (x - rx) / a, dy = (y - ry) / b;
      if (dx * dx + dy * dy <= 1) plot(x, y, dy < -0.45 ? ROCK[0] : dx > 0.3 ? ROCK[2] : ROCK[1]);
    }
  const KELP = [["#1a6a3a", "#2a8a4a"], ["#16583a", "#22784a"]].map((r) => r.map(hex));
  for (const [kx, kh, k] of [[CX - 84, 40, 0], [CX - 76, 26, 1], [CX - 68, 48, 0], [CX + 62, 34, 1], [CX + 70, 46, 0], [CX + 80, 28, 1], [CX - 8, 12, 1]])
    for (let i = 0; i < kh; i++) {
      const y = surface(kx) - i, x = kx + Math.round(2 * Math.sin(i * 0.2 + kx));
      plot(x, y, KELP[k][0]); plot(x + 1, y, KELP[k][1]);
      if (i % 7 === 3) { plot(x + 2, y, KELP[k][1]); plot(x + 3, y - 1, KELP[k][1]); }
    }
}

function bubbles() {
  for (const [x, y, r] of [[CX - 94, CY - 8, 2], [CX + 92, CY - 26, 3], [CX + 44, CY - 62, 2], [CX - 44, CY + 26, 2], [CX + 14, CY + 40, 1.5], [CX - 20, CY - 88, 2]])
    for (let a = 0; a < 6.3; a += 0.25) plot(Math.round(x + Math.cos(a) * r), Math.round(y + Math.sin(a) * r), hex("#8ad8ff"));
}

function life() {
  const beast = (x, y, kind, t, more = {}) => critter(onto(x, y), t, { kind, ...more });
  // top to bottom, the same order of things as the column
  beast(CX - 60, CY - 88, "humpback", 2.4, { dir: 1 });
  seaPiece(onto(CX - 84, CY - 40), 0.4, { kind: "jelly" });
  seaPiece(onto(CX + 56, CY - 72), 1.3, { kind: "jelly" });
  beast(CX - 28, CY - 40, "school", 3.2, { still: true, dir: 1 });
  beast(CX + 42, CY - 26, "school", 7.9, { still: true, dir: -1 });
  beast(CX - 6, CY - 2, "turtle", 5.1, { still: true, dir: -1 });
  beast(CX - 74, CY + 8, "puffer", 1.2, { still: true, dir: 1 });
  beast(CX - 36, SAND - 40, "garden", 6.2);
  beast(CX + 42, SAND - 22, "seahorse", 2);
  beast(CX + 6, SAND + 6, "crab", 1.1);
}

function glass() {
  for (let y = TOP; y <= BOTTOM; y++)
    for (let x = CX - R; x <= CX + R; x++) {
      if (!onGlass(x, y)) continue;
      // the ring's shadow on the glass, heaviest under the top of it
      const edge = R - dist(x, y), reach = y < CY ? 14 : 8;
      if (edge < reach && dither(x, y) > edge / reach) mix(x, y, hex("#020a10"), 0.55);
      // a thin highlight curving along the upper left, a faint streak across
      const a = Math.atan2(y - CY, x - CX);
      if (edge > 7 && edge < 9 && a > -2.75 && a < -1.95) mix(x, y, hex("#e8f8ff"), 0.3);
      const u = x - CX + (y - CY) * 0.7;
      if ((u > -74 && u < -68) || (u > -60 && u < -36)) mix(x, y, hex("#c8e8f0"), 0.035);
    }
}

// In the frames' brass and steel, lit from the upper left.
function porthole() {
  const O = hex("#1e1406"), LIT = hex("#ffe8a0"), MID = hex("#c89c48"), DARK = hex("#7a5a22"), DEEP = hex("#4a3410");
  const S_LIT = hex("#7a9c9c"), S_MID = hex("#36585a"), S_DARK = hex("#1c3032"), S_O = hex("#030b0d");
  const outer = R + RING + FLANGE;
  for (let y = CY - outer - 6; y <= CY + outer + 6; y++)
    for (let x = CX - outer - 6; x <= CX + outer + 6; x++) {
      const d = dist(x, y) - R, facing = ((CX - x) + (CY - y)) / (Math.SQRT2 * (R + d));
      if (d <= 0) continue;
      if (d > RING + FLANGE) {
        // its shadow on the hull, falling down and right
        if (d < RING + FLANGE + 6 && facing < 0.2 && dither(x, y) > (d - RING - FLANGE) / 6) mix(x, y, hex("#020809"), 0.6);
        continue;
      }
      if (d > RING) { set(x, y, d > RING + FLANGE - 1 ? S_O : facing > 0.35 ? S_LIT : facing < -0.35 ? S_DARK : S_MID); continue; }
      let c;
      if (d <= 1.2) c = O;
      else if (d <= 2.4) c = DEEP;
      else if (d > RING - 1) c = O;
      else if (d > RING - 3) c = facing > 0.3 ? LIT : facing < -0.45 ? DARK : MID;
      else c = facing > 0.55 ? MID : facing < -0.2 ? DARK : (dither(x, y) > (facing + 0.2) / 0.75 ? DARK : MID);
      set(x, y, c);
    }
  // bolts through the ring
  for (let k = 0; k < 16; k++) {
    const a = (k / 16) * Math.PI * 2 + Math.PI / 16, x = Math.round(CX + Math.cos(a) * (R + 6.5)), y = Math.round(CY + Math.sin(a) * (R + 6.5));
    for (const [i, j, c] of [[-1, -2, O], [0, -2, O], [1, -2, O], [-2, -1, O], [-1, -1, LIT], [0, -1, MID], [1, -1, MID], [2, -1, O], [-2, 0, O], [-1, 0, MID], [0, 0, MID], [1, 0, DARK], [2, 0, O], [-2, 1, O], [-1, 1, MID], [0, 1, DARK], [1, 1, DARK], [2, 1, O], [-1, 2, O], [0, 2, O], [1, 2, O]]) set(x + i, y + j, c);
  }
}

// Text sits right on top of this: dim it a little, and press the brightest colors down harder, keeping their hue.
const DIM = 0.86, KNEE = 0.36, ABOVE = 0.35;
function grade(c) {
  const lum = (0.3 * red(c) + 0.59 * green(c) + 0.11 * blue(c)) / 255;
  if (!lum) return c;
  const dim = lum * DIM, to = dim > KNEE ? KNEE + (dim - KNEE) * ABOVE : dim, k = (v) => Math.round(Math.min(255, (v * to) / lum));
  return rgb(k(red(c)), k(green(c)), k(blue(c)));
}

export function draw(p) {
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) fb[y * W + x] = plating(x, y);
  water();
  reef();
  seabed();
  bubbles();
  life();
  glass();
  porthole();
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) p.px(x, y, grade(fb[y * W + x]));
}
