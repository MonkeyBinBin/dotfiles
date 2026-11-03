// The camp's night sky, behind every window: a banded night gradient, a scatter of stars (a few bright crosses),
// a crescent moon with a soft halo, two ranges of far mountains and a pine treeline. A still picture (one frame),
// baked to a PNG for the layout's background.

import { hex, Rng, clamp } from "../../core/index.js";

export const meta = {
  name: "Camp sky",
  desc: "A still night sky over the camp: banded gradient, stars and a few bright ones, a crescent moon, far mountains and a pine treeline.",
  tags: ["camp", "background", "night", "still"],
  size: [480, 270],
  origin: [0, 270],
  duration: 1,
  loop: true,
  fps: 1,
  bg: "black",
  options: { seed: 7 },
};

const W = 480, H = 270;
const BANDS = ["#0a0918", "#0d0b1f", "#110e27", "#151230", "#1a1638", "#201b42", "#272049"].map(hex);
const STAR = ["#5a5890", "#9a98d0", "#e6e8ff", "#ffffff"].map(hex), WARM = hex("#ffe6b0");
const MOON = ["#c8c0a0", "#f0e8c8", "#fffbe8"].map(hex), HALO = hex("#9a90d8");
const FAR = hex("#1c1838"), NEAR = hex("#141129"), TREES = hex("#0c0a1a");

// a 4x4 Bayer matrix, for dithering between gradient bands
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);

function ridge(x, base, amp, seed) {
  // a jagged mountain line: a few sines, quantized to whole pixels
  const v = Math.sin(x * 0.013 + seed) * 0.5 + Math.sin(x * 0.031 + seed * 2.1) * 0.3 + Math.sin(x * 0.071 + seed * 3.7) * 0.2;
  return Math.round(base - amp * (0.5 + 0.5 * v));
}

export function draw(p, _t, o) {
  const R = new Rng(o.seed);
  // the sky: bands from deep at the top to a lighter haze at the horizon, dithered at each step
  p.shade(0, -H, W, 0, (x, y) => {
    const v = clamp((y + H) / (H * 0.8)) * (BANDS.length - 1), i = Math.floor(v), f = v - i;
    const b = BAYER[(Math.floor(y) & 3) * 4 + (Math.floor(x) & 3)];
    return BANDS[Math.min(BANDS.length - 1, f > b ? i + 1 : i)];
  });
  // stars, denser and brighter high up
  for (let i = 0; i < 260; i++) {
    const x = Math.floor(R.range(0, W)), y = -H + Math.floor(R.range(0, H * 0.72) ** 1.15 / (H * 0.72) ** 0.15);
    const k = R.next();
    p.px(x, y, k > 0.93 ? STAR[3] : k > 0.7 ? STAR[2] : k > 0.35 ? STAR[1] : STAR[0]);
  }
  for (let i = 0; i < 9; i++) {
    const x = Math.floor(R.range(10, W - 10)), y = -H + Math.floor(R.range(8, H * 0.45));
    const c = i % 3 === 0 ? WARM : STAR[3];
    p.px(x, y, c);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) p.px(x + dx, y + dy, STAR[1]);
    p.glow(x, y, 5, STAR[2], 0.25);
  }
  // the moon: a crescent with a halo
  const mx = 392, my = -H + 52, r = 15;
  p.glow(mx, my, 60, HALO, 0.18);
  p.shade(mx - r - 1, my - r - 1, mx + r + 1, my + r + 1, (x, y) => {
    const d = Math.hypot(x - mx, y - my), bite = Math.hypot(x - mx - 7, y - my + 4);
    if (d > r || bite < r - 1) return 0;
    return d > r - 1.5 ? MOON[0] : x < mx - 5 ? MOON[2] : MOON[1];
  });
  // mountains, far then near, then the treeline
  for (let x = 0; x < W; x++) {
    const far = ridge(x, -48, 70, 1.3), near = ridge(x, -22, 46, 4.2);
    p.rect(x, far, 1, -far, FAR);
    p.rect(x, near, 1, -near, NEAR);
  }
  for (let x = 4; x < W - 4; x += 7 + Math.floor(R.range(0, 6))) {
    const h = 10 + Math.floor(R.range(0, 12));
    for (let k = 0; k < h; k++) {
      const half = Math.floor((k / h) * 4) + (k % 3 === 2 ? 1 : 0);
      p.rect(x - half, -k - 1, half * 2 + 1, 1, TREES);
    }
  }
  p.rect(0, -6, W, 6, TREES);
}
