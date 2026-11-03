// A tile of pine silhouettes for the top edge of the campfire stage: the forest round the camp against the sky.
// Drawn in the stage's own night color with transparent sky above, and it tiles: no pine crosses the edges and
// the bottom two rows are solid, so copies side by side read as one treeline.

import { hex, Rng } from "../../core/index.js";

export const meta = {
  name: "Treeline tile",
  desc: "A tileable strip of pine silhouettes in the camp stage's night color, transparent above, for the stage's top edge.",
  tags: ["camp", "background", "still"],
  size: [64, 12],
  origin: [0, 12],
  duration: 1,
  loop: true,
  fps: 1,
  bg: "sky",
  options: { seed: 5 },
};

const W = 64, H = 12, NIGHT = hex("#151324");

export function draw(p, _t, o) {
  const R = new Rng(o.seed);
  p.rect(0, -2, W, 2, NIGHT);
  for (let x = 4; x < W - 4; x += 5 + Math.floor(R.range(0, 4))) {
    const h = 5 + Math.floor(R.range(0, 6));
    for (let k = 0; k < h; k++) {
      const half = Math.min(3, Math.floor((k / h) * 3.4) + (k % 3 === 2 ? 1 : 0));
      p.rect(x - half, -2 - h + k, half * 2 + 1, 1, NIGHT);
    }
  }
}
