// A camp tent for each space on the sidebar: an A-frame of colored cloth (`palette`: dark, mid, light), a dark
// doorway, a red pennant on the ridge pole snapping in the breeze.

import { hex, wrap, TAU } from "../../core/index.js";
import { Grid } from "../critters/_lib.js";

export const meta = {
  name: "Tent",
  desc: "A little A-frame camp tent in its own color, a dark doorway, a red pennant waving on the ridge pole.",
  tags: ["camp", "ui", "icon", "loop"],
  size: [16, 16],
  origin: [8, 14],
  duration: 1.2,
  loop: true,
  fps: 12,
  bg: "dark",
  options: { palette: ["#1f5a6a", "#3fa8b8", "#8fe0e8"], seed: 1 },
};

const D = meta.duration, g = new Grid(-8, -14, 16, 16);
const INK = hex("#14121f"), DOOR = hex("#0c0a14"), POLE = hex("#8a5a34"), FLAG = [hex("#c8303a"), hex("#ff5a4a")];

export function draw(p, t, o) {
  const C = o.palette.map(hex), ph = wrap(t, D) / D;
  g.clear();
  // pole and pennant
  g.line(0, -9, 0, -12, POLE);
  const flap = Math.sin(ph * TAU * 2);
  for (let i = 1; i <= 4; i++) {
    const y = -12 + Math.round(flap * i * 0.25);
    g.set(i, y, FLAG[i < 3 ? 1 : 0]);
    if (i < 3) g.set(i, y + 1, FLAG[0]);
  }
  // the A-frame: lit on the left slope, shaded on the right, a seam down the ridge
  g.shade(-7, -9, 6.99, -0.01, (x, y) => {
    const h = -y, half = (9.5 - h) * 0.75;
    if (Math.abs(x + 0.5) > half) return 0;
    if (Math.abs(x + 0.5) < (5 - h) * 0.42 && h < 5) return DOOR;
    return x < -0.5 ? (x < -half + 1.5 ? C[2] : C[1]) : x < 0.5 ? C[1] : C[0];
  });
  g.outline((x, y, nx, ny) => (ny < 0 && nx === 0 ? 0 : INK));
  g.draw(p);
}
