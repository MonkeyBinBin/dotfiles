// The sea column's scenery, in pieces the mod stacks (`kind`), all 176 px wide (the column's inside):
//   sky      the night over the surface: dithered bands, stars, a moon
//   surface  the waterline, waves rolling, and the first fathoms with light rays slanting down
//   seabed   sand, rocks and kelp along the bottom
//   fish     a little school of orange fish, finning in place (alpha)
//   jelly    a pink jellyfish, pulsing (alpha)
// Between surface and seabed the mod paints a plain gradient from WATER_TOP to WATER_DEEP.

import { hex, wrap, TAU } from "../../core/index.js";

export const meta = {
  name: "Sea column",
  desc: "Scenery for the sub's sea column: night sky, rolling surface with light rays, seabed with kelp, fish, a jellyfish.",
  tags: ["sub", "background", "loop"],
  size: [176, 64],
  origin: [0, 0],
  duration: 2.4,
  loop: true,
  fps: 10,
  bg: "dark",
  options: { kind: "sky" },
};

export const W = 176, SKY_H = 64, SURFACE_H = 40, SEABED_H = 30;
export const WATER_TOP = "#0c4a66", WATER_DEEP = "#03151f";
const D = meta.duration;
const SKY = ["#081028", "#0c1838", "#12244a"].map(hex), STAR = hex("#c8d8ff"), MOON = hex("#f0f4ff");
const WAVE = [hex("#d8f4ff"), hex("#8ad8ff"), hex("#2a88aa")], WATER = ["#0f5674", "#0e5270", "#0c4a66"].map(hex), RAY = hex("#1a6a88");

function sky(p, ph) {
  for (let y = 0; y < SKY_H; y++)
    for (let x = 0; x < W; x++) {
      const f = y / SKY_H, band = f < 0.4 ? 0 : f < 0.75 ? 1 : 2;
      const dith = (f > 0.33 && f < 0.43) || (f > 0.68 && f < 0.78);
      p.px(x, y, SKY[dith && (x + y) % 2 ? Math.max(0, band - 1) : band]);
    }
  // stars, two of them twinkling
  [[12, 6], [37, 14], [58, 4], [81, 19], [104, 8], [122, 24], [9, 28], [66, 31], [95, 36]].forEach(([x, y], i) => {
    if (i % 4 === 1 && Math.sin((ph + i * 0.3) * TAU) < 0) return;
    p.px(x, y, STAR);
  });
  // a crescent moon, high on the right
  p.shade(140, 4, 156, 20, (x, y) => {
    const a = (x - 148) ** 2 + (y - 12) ** 2 <= 49, b = (x - 151) ** 2 + (y - 10) ** 2 <= 30;
    if (a && !b) return MOON;
  });
  p.glow(146, 13, 14, MOON, 0.12);
}

function surface(p, ph) {
  for (let y = 0; y < SURFACE_H; y++)
    for (let x = 0; x < W; x++) {
      const wy = 2 + Math.round(Math.sin(x * 0.35 + ph * TAU) * 1);
      let c;
      if (y < wy) c = SKY[2];
      else if (y === wy) c = (x + Math.floor(ph * 20)) % 9 < 2 ? WAVE[0] : WAVE[1];
      else if (y === wy + 1) c = WAVE[2];
      else {
        const f = (y - wy) / (SURFACE_H - wy);
        c = WATER[f < 0.35 ? 0 : f < 0.7 ? 1 : 2];
        // light rays slanting down, drifting, dithered out with depth
        const ray = (x + y * 0.5 + ph * 46) % 46;
        if (ray < 5 && f < 0.9 && ((x + y) % 2 || f < 0.4)) c = RAY;
      }
      p.px(x, y, c);
    }
}

function seabed(p, ph) {
  const deep = hex(WATER_DEEP), SAND = ["#6a7a6a", "#3e4e46", "#2a3a36"].map(hex), ROCK = ["#3a4a5a", "#24303c", "#141c24"].map(hex);
  for (let y = 0; y < SEABED_H; y++) for (let x = 0; x < W; x++) p.px(x, y, deep);
  for (let x = 0; x < W; x++) {
    const h = SEABED_H - 10 + Math.round(2 * Math.sin(x * 0.08) + Math.sin(x * 0.27));
    for (let y = h; y < SEABED_H; y++) p.px(x, y, y === h ? SAND[0] : (x * 7 + y * 3) % 11 === 0 ? SAND[2] : SAND[1]);
  }
  p.shade(120, SEABED_H - 18, 146, SEABED_H - 6, (x, y) => {
    const dx = (x - 133) / 12, dy = (y - (SEABED_H - 9)) / 7;
    if (dx * dx + dy * dy > 1 || y > SEABED_H - 7) return;
    return dy < -0.4 ? ROCK[0] : dx > 0.3 ? ROCK[2] : ROCK[1];
  });
  const KELP = [["#1a6a3a", "#2a8a4a"], ["#16583a", "#22784a"]].map((r) => r.map(hex));
  for (const [kx, kh, k] of [[154, 26, 0], [161, 16, 1], [167, 29, 0], [22, 14, 1]])
    for (let i = 0; i < kh; i++) {
      const y = SEABED_H - 9 - i, x = kx + Math.round(2 * Math.sin(i * 0.2 + ph * TAU + kx));
      p.px(x, y, KELP[k][0]); p.px(x + 1, y, KELP[k][1]);
      if (i % 7 === 3) { p.px(x + 2, y, KELP[k][1]); p.px(x + 3, y - 1, KELP[k][1]); }
    }
}

function fish(p, ph) {
  const one = (x, y, c, cs, k) => {
    const fin = Math.floor((ph * 6 + k) % 2), dy = Math.round(Math.sin((ph + k * 0.3) * TAU));
    y += dy;
    p.rect(x, y, 5, 3, c); p.rect(x + 1, y - 1, 3, 1, c); p.px(x + 4, y + 1, hex("#14121f"));
    p.px(x - 1, y + fin, c); p.px(x - 1, y + 2 - fin, c); p.px(x - 2, y - 1 + fin, cs); p.px(x - 2, y + 3 - fin, cs);
  };
  one(4, 6, hex("#ffb84a"), hex("#c86a1a"), 0);
  one(14, 2, hex("#ffd25a"), hex("#c8901a"), 1);
  one(16, 10, hex("#ffb84a"), hex("#c86a1a"), 2);
}

function jelly(p, ph) {
  // centered at (10, 6) in its 20 x 18 crop. One pulse: the bell squeezes narrow and the whole jelly rises,
  // then the bell relaxes wide and it drifts back down; the tentacles hang from the bell's rim and trail
  // behind the motion (short and bunched on the push, long and loose while drifting).
  const s = Math.sin(ph * TAU), bob = Math.round(-s * 1.5), X = 10, Y = 6 + bob;
  const w = 6 - Math.round(s), h = 4 + Math.round(s * 0.6);
  const BELL = [hex("#ffe0f0"), hex("#ffc8e8"), hex("#ff8ac8"), hex("#c8509a")], TENT = [hex("#e070b8"), hex("#a8508a")];
  p.shade(X - w, Y - h, X + w, Y, (x, y) => {
    const dx = (x - X) / (w + 0.5), dy = (y - Y + 0.5) / (h + 0.5);
    if (dx * dx + dy * dy > 1) return;
    if (dx * dx + dy * dy > 0.7) return BELL[3];
    return y < Y - h + 2 && x < X ? BELL[0] : y < Y - 1 ? BELL[1] : BELL[2];
  });
  // the frilly rim under the bell
  for (let x = X - w + 1; x <= X + w - 1; x += 2) p.px(x, Y + 1, BELL[2]);
  // tentacles from the rim, longer when the bell is relaxed, waving down their length
  const len = 7 + Math.round((1 - s) * 1.5);
  [-4, -1, 2, 5].forEach((tx, k) => {
    const root = X + Math.round(tx * w / 6);
    for (let i = 0; i < len; i++) {
      const sway = Math.round(Math.sin(ph * TAU - i * 0.5 + k) * Math.min(1.5, i * 0.25));
      p.px(root + sway, Y + 2 + i, TENT[i < len - 3 ? 0 : 1]);
    }
  });
}

export function draw(p, t, o) {
  const ph = wrap(t, D) / D;
  ({ sky, surface, seabed, fish, jelly })[o.kind](p, ph);
}
