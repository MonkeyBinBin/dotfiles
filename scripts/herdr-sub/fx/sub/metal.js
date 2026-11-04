// Brushed metal for the control console (`tone`): `slab` the dark gunmetal it's built on, `panel` the lighter plates
// bolted to it. Horizontal grain, its streaks repeating every 640 px so the mod can tile it across any width.
// Origin at the top left.

import { hex } from "../../core/index.js";

export const meta = {
  name: "Brushed metal",
  desc: "A tileable strip of brushed metal: dark gunmetal or a lighter steel plate.",
  tags: ["sub", "background", "still"],
  size: [640, 48],
  origin: [0, 0],
  duration: 1,
  loop: true,
  fps: 1,
  bg: "dark",
  options: { tone: "panel" },
};

const TONES = { slab: [26, 35, 39, 5], panel: [58, 71, 75, 6] };
const W = meta.size[0], H = meta.size[1], TAU = Math.PI * 2;
const noise = (n) => { const s = Math.sin(n * 127.1) * 43758.5453; return s - Math.floor(s); };
const shade = (v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0");

export function draw(p, _t, o) {
  const [r, g, b, amount] = TONES[o.tone];
  for (let y = 0; y < H; y++) {
    const row = noise(y + 1) - 0.5, a = noise(y * 3.1 + 7), c = noise(y * 5.7 + 2) * TAU;
    for (let x = 0; x < W; x++) {
      // each row's grain: its own level, plus long streaks in whole cycles of the width so the tile has no seam
      const streak = Math.sin((x / W) * TAU * (3 + Math.floor(a * 9)) + c) * 0.35 + Math.sin((x / W) * TAU * (17 + Math.floor(a * 23)) - c) * 0.2;
      const k = (row + streak * 0.6) * amount;
      p.px(x, y, hex(`#${shade(r + k)}${shade(g + k)}${shade(b + k)}`));
    }
  }
}
