// The sea column's wildlife (`kind`). Swimmers cross a lane as wide as the column (176 px) and back, turning
// round off-screen; `still` keeps one finning on the spot, facing `dir`, for the mod to move. The others stay put and
// the mod drifts them.
//   school   three little orange fish finning along together            (lane)
//   turtle   a sea turtle paddling slowly                                (lane)
//   puffer   a pufferfish that puffs up into a spiky ball now and then   (lane)
//   crab     a red crab scuttling on the spot (the mod walks it sideways along the seabed)
//   seahorse a seahorse bobbing upright, curled tail, a fluttering fin
//   shark    a shark, tail beating (still: the mod moves it)
//   angler   an anglerfish with a blinking lure (still)
//   humpback a humpback whale, its tail stock and flukes beating slowly (still, 120 px long)
//   garden   a colony of splendid garden eels (横帶園鰻) standing out of their burrows in the sand, swaying
// `offset` (0..1) shifts where a swimmer is in its loop, so lanes don't move in step.

import { hex, wrap, TAU } from "../../core/index.js";

export const meta = {
  name: "Sea critters",
  desc: "Sea life for the sub's sea column: a fish school, a turtle, a pufferfish crossing and turning, a crab, a seahorse, garden eels in the sand.",
  tags: ["sub", "character", "loop"],
  size: [176, 44],
  origin: [0, 0],
  duration: 16,
  loop: true,
  fps: 10,
  bg: "dark",
  options: { kind: "garden", offset: 0 },
};

const D = meta.duration, W = 176, INK = hex("#08141c"), WHITE = hex("#ffffff");
const R = (...c) => c.map(hex);

// a mirrored pen: draws in the swimmer's own frame (facing +x), flipped when it faces left
const pen = (p, cx, cy, dir) => ({
  px: (x, y, c) => p.px(Math.round(cx + dir * x), Math.round(cy + y), c),
  rect: (x, y, w, h, c) => { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) p.px(Math.round(cx + dir * (x + i)), Math.round(cy + y + j), c); },
  disc: (x, y, r, f) => { for (let j = -Math.ceil(r); j <= r; j++) for (let i = -Math.ceil(r); i <= r; i++) { const d = Math.hypot(i, j); if (d <= r + 0.2) p.px(Math.round(cx + dir * (x + i)), Math.round(cy + y + j), typeof f === "function" ? f(i / r, j / r, d / r) : f); } },
});

// where a swimmer is: across the lane and back once per loop (`laps` times), off-screen at both ends
function lane(t, o, margin, laps = 1) {
  if (o.still) return { x: 20, dir: o.dir ?? 1, ph: (wrap(t, D) / D) * laps };
  const u = (wrap(t, D) / D * laps + (o.offset ?? 0)) % 1, k = u < 0.5 ? u * 2 : 2 - u * 2;
  return { x: -margin + k * (W + 2 * margin), dir: u < 0.5 ? 1 : -1, ph: (wrap(t, D) / D) * laps };
}

function school(p, t, o) {
  const { x, dir, ph } = lane(t, o, 14, 2), FISH = R("#c86a1a", "#ffb84a", "#ffd25a");
  [[0, 12, 0], [-8, 7, 1], [-7, 16, 2]].forEach(([dx, y, i]) => {
    // 4.5: centres the three of them on the pivot, so turning round doesn't shift them sideways
    const q = pen(p, x + dir * (dx + 4.5), y + Math.round(Math.sin((ph * 6 + i * 0.3) * TAU) * 1), dir);
    const fin = Math.floor(ph * 40 + i) % 2;
    q.rect(-2, -1, 5, 3, FISH[1]); q.rect(-1, -2, 3, 1, FISH[2]); q.rect(-1, 1, 3, 1, FISH[0]);
    q.px(2, -1, FISH[2]); q.px(2, 0, INK);
    q.px(-3, -1 + fin, FISH[0]); q.px(-3, 1 - fin, FISH[0]); q.px(-4, -2 + fin, FISH[0]); q.px(-4, 2 - fin, FISH[0]);
  });
}

// a colony of splendid garden eels (横帶園鰻) in the sand: slim S-curved bodies, banded gold and white, rising out of
// their burrows and bowing their heads into the current; now and then one ducks down into its hole and rises again.
// [burrow x, loop offset, length, which way it faces, far back (dimmer, drawn first)]
const GARDEN = [[20, 0.62, 18, -1, true], [46, 0.29, 17, -1, true], [12, 0.0, 28, -1], [25, 0.37, 23, -1], [37, 0.71, 32, -1], [53, 0.18, 22, 1], [65, 0.55, 27, -1]];
function garden(p, t) {
  const ph = wrap(t, D) / D, SAND = R("#4a5a4e", "#6a7a6a", "#8a9a86");
  const NEAR = { gold: R("#b87a14", "#f0b428", "#ffdc64"), white: R("#c8c0b0", "#fff8ea", "#ffffff") };
  const FAR = { gold: R("#6a5a2a", "#8a7a3e", "#a8965a"), white: R("#6a7a78", "#8a9a98", "#a0aeac") };
  const BASE = 38;
  for (const [bx, off, full, dir, far] of GARDEN) {
    const { gold, white } = far ? FAR : NEAR;
    // how far out: mostly up, one dip into the burrow per loop, easing down and back
    const u = (ph + off) % 1, dip = u < 0.12 ? Math.sin((u / 0.12) * Math.PI) : 0;
    const h = full * (1 - dip * 0.95);
    // walk the spine from the burrow: leaning back a little low down, bending over more and more towards the head
    const sway = Math.sin(ph * TAU * 4 + off * 9);
    let x = bx, y = BASE, tx = 0, ty = -1;
    for (let s = 0; s < h; s += 0.4) {
      const k = s / full, bend = dir * (-0.22 + 1.15 * k ** 2.6) + sway * 0.14 * k;
      tx = Math.sin(bend);
      ty = -Math.cos(bend);
      x += tx * 0.4;
      y += ty * 0.4;
      // bands counted from the head, so they slide into the burrow with it: gold, then a thin white
      const C = (h - s) % 6 < 2 ? white : gold;
      for (const n of [-1, -0.5, 0, 0.5, 1]) p.px(Math.round(x - ty * n), Math.round(y + tx * n), C[n * dir < 0 ? 2 : n * dir > 0 ? 0 : 1]);
    }
    if (h > 3) {
      // the head: a rounded wedge along the spine's last heading, the eye on its upper side
      const up = tx >= 0 ? 1 : -1, ux = ty * up, uy = -tx * up;
      for (let a = 0; a <= 3; a += 0.3) {
        const cx = x + tx * a, cy = y + ty * a, r = 2.2 - a * 0.4;
        for (let i = Math.floor(cx - r); i <= cx + r; i++) for (let j = Math.floor(cy - r); j <= cy + r; j++) {
          if (Math.hypot(i - cx, j - cy) <= r) p.px(i, j, j < cy ? gold[2] : gold[1]);
        }
      }
      const ex = x + tx * 1.2 + ux * 0.4, ey = y + ty * 1.2 + uy * 0.4;
      if (!far) p.px(Math.round(ex - tx), Math.round(ey - ty), WHITE);
      p.px(Math.round(ex), Math.round(ey), INK);
    }
    // the burrow: a dark hole in a little sand mound
    p.px(bx - 3, BASE + 1, SAND[1]); p.px(bx + 3, BASE + 1, SAND[1]);
    for (let x = bx - 2; x <= bx + 2; x++) p.px(x, BASE + 1, Math.abs(x - bx) <= 1 ? INK : SAND[2]);
    for (let x = bx - 4; x <= bx + 4; x++) p.px(x, BASE + 2, SAND[1]);
  }
}

function turtle(p, t, o) {
  const { x, dir, ph } = lane(t, o, 20, 1), SHELL = R("#2a4a1e", "#4a7a2a", "#7aaa3a", "#a8d86a"), SKIN = R("#4a7a5a", "#7ab88a", "#b8e8c0");
  // -2: centres it on the pivot, head and all, so turning round doesn't shift it sideways
  const q = pen(p, x - dir * 2, 12 + Math.round(Math.sin(ph * TAU * 3)), dir), stroke = Math.sin(ph * TAU * 12);
  // flippers paddling, behind the shell
  q.rect(1 + Math.round(stroke * 2), 3, 4, 2, SKIN[0]); q.rect(-6, 3 - Math.round(stroke), 3, 2, SKIN[0]);
  q.rect(2 - Math.round(stroke * 2), -5, 4, 2, SKIN[1]);
  // head
  q.disc(8, -1, 2.4, (nx, ny) => (ny < -0.2 ? SKIN[2] : SKIN[1])); q.px(9, -2, INK);
  // shell: a dome with plates
  for (let j = -4; j <= 3; j++) for (let i = -7; i <= 6; i++) {
    const nx = (i + 0.5) / 7, ny = (j - 1) / 5;
    if (nx * nx + ny * ny > 1 || j > 3) continue;
    const plate = (i + 8) % 4 === 0 || j === 0;
    q.px(i, j, j === 3 ? SKIN[0] : plate ? SHELL[0] : ny < -0.5 ? SHELL[3] : ny < 0 ? SHELL[2] : SHELL[1]);
  }
}

function puffer(p, t, o) {
  const { x, dir, ph } = lane(t, o, 14, 1), BODY = R("#a8801c", "#e8c040", "#ffe880", "#fff8d0"), SPOT = hex("#7a5a14");
  const puff = Math.max(0, Math.sin(((ph * 4) % 1) * Math.PI) - 0.4) / 0.6, r = 3.5 + puff * 3;
  const q = pen(p, x, 12 + Math.round(Math.sin(ph * TAU * 5)), dir);
  if (puff > 0.3) for (let a = 0; a < 12; a++) { const ang = (a / 12) * TAU; q.px(Math.cos(ang) * (r + 1.4), Math.sin(ang) * (r + 1.4), BODY[0]); }
  q.disc(0, 0, r, (nx, ny) => (nx * -0.6 + ny * -0.8 > 0.4 ? BODY[3] : ny > 0.4 ? BODY[0] : ny > -0.1 ? BODY[1] : BODY[2]));
  q.px(-1, 1, SPOT); q.px(1, 2, SPOT); q.px(-2, -1, SPOT);
  q.disc(r * 0.45, -r * 0.3, 1.2, WHITE); q.px(r * 0.45 + 0.5, -r * 0.3, INK);
  const fin = Math.floor(ph * 60) % 2;
  q.px(-r - 1, -1 + fin, BODY[0]); q.px(-r - 1, 1 - fin, BODY[0]); q.px(-r - 2, -2 + fin, BODY[1]); q.px(-r - 2, 2 - fin, BODY[1]);
  q.px(r, 1, SPOT);
}

function crab(p, t) {
  const ph = wrap(t, D) / D, step = Math.floor(ph * 160) % 2, C = R("#7a1e14", "#c8402a", "#ff7a5a", "#ffc0a8");
  const q = pen(p, 12, 10, 1);
  for (const k of [-1, 1]) for (let l = 0; l < 3; l++) {
    const lx = k * (4 + l), ly = 2 + ((l + step) % 2);
    q.px(lx, ly, C[0]); q.px(lx + k, ly + 1, C[0]);
  }
  // claws up, snapping
  for (const k of [-1, 1]) { q.px(k * 6, -3, C[1]); q.disc(k * 7, -5, 1.6, C[2]); if (step) q.px(k * 7, -6, C[0]); }
  q.disc(0, 0, 4.2, (nx, ny) => (ny < -0.4 ? C[3] : ny > 0.4 ? C[0] : C[1]));
  for (const k of [-1, 1]) { q.px(k * 2, -5, C[1]); q.disc(k * 2, -6, 1, WHITE); q.px(k * 2, -6, INK); }
}

function seahorse(p, t) {
  const ph = wrap(t, D) / D, C = R("#7a3a8a", "#c86ad8", "#f0a8ff", "#ffe0ff"), bob = Math.round(Math.sin(ph * TAU * 6) * 1);
  const q = pen(p, 8, 12 + bob, 1);
  // snout, head, body, the curled tail
  q.rect(3, -9, 3, 1, C[1]);
  q.disc(1, -9, 2.4, (nx, ny) => (ny < -0.3 ? C[3] : C[2]));
  q.px(1, -10, INK); q.px(0, -12, C[1]); q.px(-1, -11, C[1]);
  for (let i = 0; i < 9; i++) q.disc(-0.5 + Math.sin(i * 0.4) * 1.2, -6 + i, 2.4 - i * 0.16, (nx) => (nx > 0.3 ? C[0] : C[1]));
  [[-1, 4], [-2, 5], [-2, 6], [-1, 7], [0, 7], [1, 6], [0, 5]].forEach(([x, y]) => q.px(x, y, C[0]));
  const fin = Math.floor(ph * 120) % 2;
  q.px(-3, -4, C[3]); q.px(-4, -3 + fin, C[2]); q.px(-3, -2, C[2]);
}

function shark(p, t, o) {
  // tail to snout is -20..15: centred in its 44 px frame, so turning round doesn't shift it sideways
  const dir = o.dir ?? 1, q = pen(p, 22 + dir * 2.5, 12, dir), C = R("#2a3a44", "#54707e", "#8aa4ae", "#dce8ea"), wag = Math.floor(t * 8) % 2 ? 2 : -2;
  for (let i = -15; i <= 12; i++) {
    const k = (i + 15) / 27, half = Math.max(1, 5 * Math.sin(Math.PI * k ** 0.7));
    for (let j = -half; j <= half; j++) q.px(-i, j, j > half * 0.35 ? C[3] : j < -half * 0.3 ? C[1] : C[2]);
  }
  // the dorsal fin, the pectoral fin, a beating tail; eye and gills up front
  [[0, -6], [1, -6], [-1, -6], [0, -7], [1, -7], [1, -8], [1, -9]].forEach(([x, y]) => q.px(x, y, C[0]));
  [[5, 4], [4, 5], [3, 6], [4, 6]].forEach(([x, y]) => q.px(x, y, C[0]));
  for (let i = 0; i < 6; i++) { q.px(-15 - i, -1 - i + wag * 0.5, C[1]); q.px(-15 - i, 1 + Math.round(i * 0.5) + wag * 0.5, C[0]); }
  q.px(11, -2, INK); q.px(7, -1, C[0]); q.px(6, 0, C[0]);
  for (let x = 9; x <= 13; x += 2) q.px(x, 2, WHITE);
}

function angler(p, t, o) {
  const q = pen(p, 20, 13, o.dir ?? 1), C = R("#1e3e46", "#31606a", "#528a94"), lit = wrap(t, 1.2) < 0.6;
  q.disc(0, 0, 7, (nx, ny) => (ny < -0.3 ? C[2] : ny > 0.4 ? C[0] : C[1]));
  // a tail fin, a gaping jaw of teeth, a pale eye
  for (let i = 0; i < 4; i++) { q.px(-8 - i, -i, C[1]); q.px(-8 - i, i, C[1]); }
  for (let x = 2; x <= 7; x += 2) { q.px(x, 2, WHITE); q.px(x + 1, 4, WHITE); }
  q.rect(2, 3, 6, 1, INK);
  q.px(3, -3, hex("#d8f0a0")); q.px(4, -3, INK);
  // the lure on its stalk, arching forward
  [[1, -8], [2, -9], [3, -10], [5, -10], [7, -9], [8, -8]].forEach(([x, y]) => q.px(x, y, C[2]));
  q.disc(9, -7, 1.6, lit ? hex("#f8ffa0") : hex("#6a7a30"));
  if (lit) p.glow(20 + (o.dir ?? 1) * 9, 6, 6, hex("#f8ffa0"), 0.5);
}

function humpback(p, t, o) {
  const q = pen(p, 60, 11, o.dir ?? 1), C = R("#1e3448", "#34566e", "#5a84a0", "#8fb4c8"), PALE = R("#c4d6da", "#eef6f6"), LINE = hex("#14222e");
  // the tail bends more the further back, the rest of the body holds still
  const wave = Math.sin((t * TAU) / 3.2 - Math.PI / 2), bend = (x) => (x < -6 ? wave * ((-6 - x) / 44) ** 2 * 4 : 0);
  for (let x = -44; x <= 54; x++) {
    const k = (54 - x) / 98, half = 1.2 + 8 * Math.sin(Math.PI * k ** 0.62) * (1 - k * 0.2), mid = bend(x);
    for (let y = -half; y <= half; y++) {
      const ny = y / half, groove = Math.round(y) % 2 === 0, pale = 0.3 + Math.max(0, 12 - x) / 34; // the white belly narrows away toward the tail
      q.px(x, y + mid, ny < -0.62 ? C[0] : ny < -0.12 ? C[1] : ny < pale - 0.14 ? C[2] : ny < pale ? C[3] : PALE[groove ? 0 : 1]);
    }
  }
  // barnacles on the head, the mouth's long curve, the eye
  [[48, -3], [44, -5], [50, -1], [40, -5], [46, -2]].forEach(([x, y]) => q.px(x, y, C[3]));
  for (let x = 30; x <= 53; x++) q.px(x, 2 - (x - 30) * 0.04 + ((x - 30) / 23) ** 2, LINE);
  q.px(32, 0, WHITE); q.px(33, 0, INK);
  // the dorsal fin far back, the long pectoral fin swept down and back
  const backAt = (x) => { const k = (54 - x) / 98; return -(1.2 + 8 * Math.sin(Math.PI * k ** 0.62) * (1 - k * 0.2)); };
  for (let i = 0; i < 6; i++) for (let h = 0; h <= (6 - i) * 0.5; h++) q.px(-12 - i, backAt(-12 - i) - h + bend(-12 - i), C[0]);
  for (let i = 0; i < 13; i++) for (let w = 0; w < 6 - i * 0.34; w++) q.px(24 - i - w, 5 + i * 0.52, w < 1 ? C[3] : w < 3 ? C[1] : C[0]);
  // the flukes spread at the end of the tail stock
  const end = bend(-44);
  for (let i = 0; i < 14; i++) for (let w = 0; w <= i * 0.5; w++) {
    const c = w < 1 ? C[2] : C[0];
    q.px(-44 - i, end + wave * i * 0.35 - i * 0.72 + w, c);
    q.px(-44 - i, end + wave * i * 0.35 + i * 0.72 - w, c);
  }
}

export function draw(p, t, o) {
  ({ school, turtle, puffer, crab, seahorse, garden, shark, angler, humpback })[o.kind](p, t, o);
}
