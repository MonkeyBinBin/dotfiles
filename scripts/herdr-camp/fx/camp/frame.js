// Window frames for the camp, drawn as one sample frame per material and sliced by bake.mjs into a nine-slice
// kit: four corner PNGs and, for each side, its color profile (outside to inside) that the mod stretches.
// Kinds (`kind`):
//   plaque  a wooden plaque: dark outline, beveled planks lit from the top left, an iron rivet in each corner
//   note    a parchment note: a red pin in its top left corner, a dog-ear at the bottom right
// The frame is drawn in local pixels from the top left (origin [0, 0]); every side has a fixed thickness
// (cx at the left and right, cy at the top and bottom), and nothing along a side varies, so it can stretch.

import { hex } from "../../core/index.js";

export const meta = {
  name: "Camp frame",
  desc: "A sample window frame for the camp's nine-slice kit: a riveted wooden plaque, or a pinned parchment note.",
  tags: ["camp", "ui", "frame", "still"],
  size: [40, 40],
  origin: [0, 0],
  duration: 1,
  loop: true,
  fps: 1,
  bg: "dark",
  options: { kind: "plaque" },
};

const W = 40, H = 40;
const C = (...c) => c.map(hex);
const INK = hex("#140c08"), IRON = C("#3a3a48", "#7a8090", "#c8ccd8");

export const KINDS = {
  plaque: {
    cx: 6, cy: 6, fill: "#2e1c10",
    // per depth (0 = outside): [lit side (top/left), shaded side (bottom/right)]
    rings: [[INK, INK], ...[["#c8955a", "#6a421e"], ["#a8743e", "#5a3520"], ["#8a5a34", "#4a2c14"], ["#6a421e", "#3b2416"]].map(([a, b]) => [hex(a), hex(b)]), [INK, INK]],
    rivet: true,
  },
  note: {
    cx: 5, cy: 5, fill: "#efe0bc",
    rings: [[hex("#5a3e22"), hex("#3e2a16")], [hex("#fff6dc"), hex("#c8b088")], [hex("#f6ead0"), hex("#dcc8a0")], [hex("#efe0bc"), hex("#efe0bc")], [hex("#efe0bc"), hex("#efe0bc")]],
    note: true,
  },
};

function noteExtras(p) {
  // the pin, in the top left corner: a red head with a highlight, its shadow down-right
  const PIN = C("#5e0f14", "#c8303a", "#ff6a5a", "#ffd0c8");
  p.px(3, 3, hex("#a89070")); p.px(4, 4, hex("#a89070"));
  for (const [x, y, c] of [[1, 1, 0], [2, 1, 1], [3, 1, 0], [1, 2, 1], [2, 2, 2], [3, 2, 1], [1, 3, 0], [2, 3, 1], [3, 3, 0]]) p.px(x, y, PIN[c]);
  p.px(1, 1, PIN[3]);
  // the dog-ear: the bottom right corner folded back
  const FOLD = C("#5a3e22", "#c8b088", "#e6d4ac");
  for (let i = 0; i < 4; i++)
    for (let j = 0; j <= i; j++) {
      const x = W - 4 + i, y = H - 1 - j;
      p.px(x, y, j === i ? FOLD[0] : i - j === 1 ? FOLD[1] : FOLD[2]);
    }
}

function ringFrame(p, k) {
  // depth d from the nearest edge picks the ring; the nearest edge picks lit or shaded
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const dl = x, dt = y, dr = W - 1 - x, db = H - 1 - y, d = Math.min(dl, dt, dr, db);
      if (d >= k.rings.length) continue;
      // the outermost corner pixel stays empty: a softly rounded frame
      if (Math.min(dl, dr) === 0 && Math.min(dt, db) === 0) continue;
      // top and left are lit, bottom and right shaded; the corners split on the diagonal
      const lit = (dt === d && dt <= dr) || (dl === d && dl < db);
      p.px(x, y, k.rings[d][lit ? 0 : 1]);
    }
  if (k.rivet)
    for (const [x, y] of [[2, 2], [W - 4, 2], [2, H - 4], [W - 4, H - 4]]) {
      p.px(x, y, IRON[2]); p.px(x + 1, y, IRON[1]); p.px(x, y + 1, IRON[1]); p.px(x + 1, y + 1, IRON[0]);
    }
}

export function draw(p, _t, o) {
  const k = KINDS[o.kind];
  ringFrame(p, k);
  if (k.note) noteExtras(p);
}
