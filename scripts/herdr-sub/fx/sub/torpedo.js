// A sub's escort: a tiny steel torpedo with its warhead, band and fins in its tool's livery, propeller turning.
// Drawn facing right (bake.mjs mirrors it to face left); origin at the body's center.

import { hex, wrap } from "../../core/index.js";

export const meta = {
  name: "Torpedo",
  desc: "A tiny pixel torpedo in a tool's livery, its propeller turning.",
  tags: ["sub", "icon", "loop"],
  size: [16, 9],
  origin: [8, 4],
  duration: 0.5,
  loop: true,
  fps: 12,
  bg: "dark",
  options: { palette: ["#a8502a", "#e8875a", "#ffb48a", "#ffe0c8"] },
};

const D = meta.duration, INK = hex("#071214"), STEEL = ["#4a5660", "#8a98a4", "#c8d4dc"].map(hex);

export function draw(p, t, o) {
  const c = o.palette.map(hex), blade = Math.floor((wrap(t, D) / D) * 6) % 2;
  // the body, lit from the top
  p.rect(-3, -1, 6, 1, STEEL[2]); p.rect(-3, 0, 6, 1, STEEL[1]); p.rect(-3, 1, 6, 1, STEEL[0]);
  // the warhead tapering to its nose, and a band round the body
  p.rect(2, -1, 2, 1, c[3]); p.rect(2, 0, 2, 1, c[2]); p.rect(2, 1, 2, 1, c[1]); p.px(4, 0, c[2]);
  p.rect(-1, -1, 1, 3, c[1]);
  // the fins and the propeller
  p.rect(-4, -2, 1, 5, c[1]); p.px(-4, -2, c[2]);
  p.rect(-5, blade ? -1 : 0, 1, blade ? 3 : 1, STEEL[2]);
  // outline it
  const pts = [];
  for (let y = -3; y <= 3; y++) for (let x = -6; x <= 5; x++) if (!p.get(x, y) && [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([a, b]) => p.get(x + a, y + b))) pts.push([x, y]);
  for (const [x, y] of pts) p.px(x, y, INK);
}
