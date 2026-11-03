// A crew's mini-sub, one per agent: a stubby hull in its tool's livery, a porthole, a little tower with a mast,
// a propeller turning at the stern, bobbing gently. `loot` hangs a crate under it (back with the goods).
// Facing right; origin at the hull's center.

import { hex, wrap, TAU } from "../../core/index.js";

export const meta = {
  name: "Mini-sub",
  desc: "A small pixel submarine in a tool's livery, propeller turning, bobbing; optionally towing a loot crate.",
  tags: ["sub", "icon", "loop"],
  size: [32, 34],
  origin: [16, 13],
  duration: 1.2,
  loop: true,
  fps: 12,
  bg: "dark",
  options: { palette: ["#a8502a", "#e8875a", "#ffb48a", "#ffe0c8"], loot: false },
};

const D = meta.duration, INK = hex("#071214"), GLASS = [hex("#2a88aa"), hex("#7ad8e8"), hex("#d8f8ff")];
const MAST = hex("#8a8a9a"), CRATE = ["#4a2c10", "#8a5a2a", "#c8955a", "#ffd23c"].map(hex), ROPE = hex("#c8b088");

export function draw(p, t, o) {
  const ph = wrap(t, D) / D, bob = Math.sin(ph * TAU) > 0.3 ? -1 : 0, c = o.palette.map(hex);
  const y0 = bob;
  // hull: an ellipse lit from the top
  p.shade(-9, -5 + y0, 9, 5 + y0, (x, y) => {
    const dx = x / 8.5, dy = (y - y0) / 4.2;
    if (dx * dx + dy * dy > 1) return;
    return dy < -0.45 ? c[3] : dy < 0.1 ? c[2] : dy < 0.6 ? c[1] : c[0];
  });
  // tower and mast
  p.rect(-3, -8 + y0, 6, 4, c[2]); p.rect(-3, -8 + y0, 6, 1, c[3]); p.rect(2, -8 + y0, 1, 4, c[1]);
  p.rect(1, -11 + y0, 1, 3, MAST);
  // porthole
  p.rect(3, -1 + y0, 3, 2, GLASS[1]); p.px(3, -1 + y0, GLASS[2]); p.px(5, 0 + y0, GLASS[0]);
  // tail fins and the propeller, its blades turning
  p.rect(-11, -2 + y0, 2, 4, c[0]);
  const blade = Math.floor(ph * 8) % 2;
  p.rect(-13, (blade ? -3 : -1) + y0, 1, blade ? 6 : 2, MAST);
  // outline it
  const pts = [];
  for (let y = -12; y <= 7; y++) for (let x = -14; x <= 10; x++) if (!p.get(x, y + y0) && [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([a, b]) => p.get(x + a, y + y0 + b))) pts.push([x, y + y0]);
  for (const [x, y] of pts) p.px(x, y, INK);
  if (o.loot) {
    p.rect(0, 6 + y0, 1, 4, ROPE);
    p.rect(-4, 10 + y0, 9, 7, CRATE[0]);
    p.rect(-3, 11 + y0, 7, 5, CRATE[1]); p.rect(-3, 11 + y0, 7, 1, CRATE[2]);
    p.rect(0, 12 + y0, 1, 3, CRATE[3]);
  }
}
