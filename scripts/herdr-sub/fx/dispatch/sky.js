// The night above the track map's lanes: the column's empty top, so the lanes stacked at its foot read as one yard
// under one sky. Its bottom row meets the top of scene.js's `back` (the darkest band of its sky), and the stars thin
// out toward that horizon. A crescent moon hangs low over the yard. The strip is wider than any lane and gets cut.
// Origin: the bottom-left corner, where the sky meets the top of `back`.

import { hex } from "../../core/index.js";

const SKY_H = 720, W = 640;

export const meta = {
  name: "Dispatch sky",
  desc: "The night sky over the dispatch track map: stars thinning toward the horizon and a crescent moon.",
  tags: ["dispatch", "scenery"],
  size: [660, SKY_H + 20],
  origin: [10, SKY_H + 10],
  duration: 1,
  loop: true,
  fps: 1,
  bg: "dark",
};

const H = (s) => hex(s);
const mix = (a, b, k) => [0, 8, 16].reduce((o, s) => o | (Math.round(((a >>> s) & 255) * (1 - k) + ((b >>> s) & 255) * k) << s), a & 0xff000000);
const noise = (x, y, k = 0) => (((x * 73856093) ^ (y * 19349663) ^ (k * 83492791)) >>> 0) % 1000 / 1000;

export function draw(p) {
  const NIGHT = H("#05080e");
  p.rect(0, -SKY_H, W, SKY_H, NIGHT);
  for (let i = 0; i < 900; i++) {
    const x = Math.floor(noise(i, 11, 5) * W), k = noise(i, 12, 5);
    // more stars high up than near the horizon
    const y = -SKY_H + Math.floor(k * k * (SKY_H - 4));
    const r = noise(i, 13, 5);
    p.px(x, y, r > 0.96 ? H("#c8d4e4") : r > 0.82 ? H("#8a9ab0") : r > 0.45 ? H("#3a4658") : H("#1e2633"));
  }
  // the moon: a crescent with a faint halo
  const mx = 300, my = -170, R = 9;
  p.shade(mx - R * 3, my - R * 3, mx + R * 3, my + R * 3, (cx, cy) => {
    const x = Math.floor(cx), y = Math.floor(cy), d = Math.hypot(x - mx, y - my);
    if (d <= R) {
      if (Math.hypot(x - (mx - 4), y - (my - 2)) > R - 1) return d > R - 1.2 ? H("#d8cfa8") : H("#f2ead0");
      return H("#0b1018");
    }
    if (d <= R * 3) return mix(NIGHT, H("#1a2230"), (1 - (d - R) / (R * 2)) ** 2 * 0.6);
  });
}
