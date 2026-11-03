// The sea column's wildlife (`kind`). Swimmers cross a lane as wide as the column (176 px) and back, turning
// round off-screen, so the mod only stacks the lanes; the others stay put and the mod drifts them.
//   school   three little orange fish finning along together            (lane)
//   turtle   a sea turtle paddling slowly                                (lane)
//   puffer   a pufferfish that puffs up into a spiky ball now and then   (lane)
//   crab     a red crab scuttling on the spot (the mod walks it sideways along the seabed)
//   seahorse a seahorse bobbing upright, curled tail, a fluttering fin
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
  const u = (wrap(t, D) / D * laps + (o.offset ?? 0)) % 1, k = u < 0.5 ? u * 2 : 2 - u * 2;
  return { x: -margin + k * (W + 2 * margin), dir: u < 0.5 ? 1 : -1, ph: (wrap(t, D) / D) * laps };
}

function school(p, t, o) {
  const { x, dir, ph } = lane(t, o, 14, 2), FISH = R("#c86a1a", "#ffb84a", "#ffd25a");
  [[0, 12, 0], [-8, 7, 1], [-7, 16, 2]].forEach(([dx, y, i]) => {
    const q = pen(p, x + dir * dx, y + Math.round(Math.sin((ph * 6 + i * 0.3) * TAU) * 1), dir);
    const fin = Math.floor(ph * 40 + i) % 2;
    q.rect(-2, -1, 5, 3, FISH[1]); q.rect(-1, -2, 3, 1, FISH[2]); q.rect(-1, 1, 3, 1, FISH[0]);
    q.px(2, -1, FISH[2]); q.px(2, 0, INK);
    q.px(-3, -1 + fin, FISH[0]); q.px(-3, 1 - fin, FISH[0]); q.px(-4, -2 + fin, FISH[0]); q.px(-4, 2 - fin, FISH[0]);
  });
}

// a colony of splendid garden eels (横帶園鰻) in the sand: each pokes up out of its burrow, banded orange and
// white, leaning into the current and swaying with it; now and then one ducks down into its hole and rises again
const GARDEN = [[8, 0.0, 26], [19, 0.37, 22], [31, 0.71, 28], [44, 0.18, 20], [56, 0.55, 25], [66, 0.86, 23]];
function garden(p, t) {
  const ph = wrap(t, D) / D, ORANGE = R("#a8401a", "#f07a2a", "#ffb070"), WHITE_BAND = R("#c8b8a8", "#fff6e8"), SAND = R("#4a5a4e", "#6a7a6a", "#8a9a86");
  const BASE = 38;
  for (const [bx, off, full] of GARDEN) {
    // how far out: mostly up, one dip into the burrow per loop, easing down and back
    const u = (ph + off) % 1, dip = u < 0.12 ? Math.sin((u / 0.12) * Math.PI) : 0;
    const h = Math.round(full * (1 - dip * 0.95));
    const sway = (k) => Math.sin(ph * TAU * 4 + off * 9 - k * 2.2) * 2.4 * k ** 1.4 + k ** 2 * 2.5;
    for (let y = 0; y < h; y++) {
      const k = y / full, x = bx + sway(k), band = Math.floor((h - y) / 3) % 2;
      const C = band ? WHITE_BAND : ORANGE;
      p.px(Math.round(x) - 1, BASE - y, C[0]); p.px(Math.round(x), BASE - y, C[1]); p.px(Math.round(x) + 1, BASE - y, band ? C[1] : C[2]);
    }
    if (h > 3) {
      // the head, bent into the current: a round snout, a big eye
      const k = h / full, hx = Math.round(bx + sway(k)), hy = BASE - h;
      for (const [dx, dy, c] of [[-1, 0, ORANGE[1]], [0, 0, ORANGE[2]], [1, 0, ORANGE[1]], [2, 0, ORANGE[1]], [-1, -1, ORANGE[1]], [0, -1, ORANGE[2]], [1, -1, ORANGE[2]], [2, -1, ORANGE[1]], [3, 0, ORANGE[0]], [0, -2, ORANGE[1]], [1, -2, ORANGE[1]]]) p.px(hx + dx, hy + dy, c);
      p.px(1 + hx, hy - 1, WHITE); p.px(2 + hx, hy - 1, INK);
    }
    // the burrow: a dark hole in a little sand mound
    p.px(bx - 3, BASE + 1, SAND[1]); p.px(bx + 3, BASE + 1, SAND[1]);
    for (let x = bx - 2; x <= bx + 2; x++) p.px(x, BASE + 1, Math.abs(x - bx) <= 1 ? INK : SAND[2]);
    for (let x = bx - 4; x <= bx + 4; x++) p.px(x, BASE + 2, SAND[1]);
  }
}

function turtle(p, t, o) {
  const { x, dir, ph } = lane(t, o, 20, 1), SHELL = R("#2a4a1e", "#4a7a2a", "#7aaa3a", "#a8d86a"), SKIN = R("#4a7a5a", "#7ab88a", "#b8e8c0");
  const q = pen(p, x, 12 + Math.round(Math.sin(ph * TAU * 3)), dir), stroke = Math.sin(ph * TAU * 12);
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

export function draw(p, t, o) {
  ({ school, turtle, puffer, crab, seahorse, garden })[o.kind](p, t, o);
}
