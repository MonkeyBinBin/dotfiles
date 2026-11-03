// Window frames for the sub, one sample per material, sliced by bake.mjs into the shared nine-slice kit
// (four corner PNGs, each side's color profile). Kinds (`kind`):
//   brass   a polished brass plate: tabs, the shown compartment, the nameplate, buttons
//   steel   a dull steel plate: the other tabs and compartments
//   bezel   a riveted brass porthole frame round a dark glass: the sea and the sonar's housings
// Drawn from the top left (origin [0, 0]); every side keeps a fixed thickness so it can stretch.

import { hex } from "../../core/index.js";

export const meta = {
  name: "Sub frame",
  desc: "A sample frame for the sub's nine-slice kit: a brass plate, a steel plate, or a riveted brass porthole bezel.",
  tags: ["sub", "ui", "frame", "still"],
  size: [40, 40],
  origin: [0, 0],
  duration: 1,
  loop: true,
  fps: 1,
  bg: "dark",
  options: { kind: "brass" },
};

const W = 40, H = 40;
const C = (...c) => c.map(hex);
const BRASS = { o: hex("#1e1406"), lit: hex("#ffe8a0"), mid: hex("#c89c48"), dark: hex("#7a5a22"), deep: hex("#4a3410"), rivet: hex("#fff2b8") };
const STEEL = { o: hex("#030b0d"), lit: hex("#7a9c9c"), mid: hex("#36585a"), dark: hex("#1c3032"), deep: hex("#0a1618"), rivet: hex("#b8d8d4") };

export const KINDS = {
  brass: { cx: 3, cy: 3, fill: "#c89c48", plate: BRASS },
  steel: { cx: 3, cy: 3, fill: "#36585a", plate: STEEL },
  bezel: { cx: 9, cy: 9, fill: "#03150f", bezel: true },
};

// a plate: outline, a lit top-left bevel, a shaded bottom-right one, the corner pixel cut
function plate(p, m) {
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const dl = x, dt = y, dr = W - 1 - x, db = H - 1 - y, d = Math.min(dl, dt, dr, db);
      if (Math.min(dl, dr) === 0 && Math.min(dt, db) === 0) continue;
      if (d === 0) p.px(x, y, m.o);
      else if (d === 1) p.px(x, y, dt === 1 || dl === 1 ? (db === 1 || dr === 1 ? m.mid : m.lit) : m.dark);
      else p.px(x, y, m.mid);
    }
}

// the bezel: a rounded brass ring, lit from the top left, a rivet at each corner, a dark lip into the glass
function bezel(p) {
  const R = 7, glass = hex("#03150f");
  const ring = [BRASS.o, null, BRASS.mid, null, BRASS.mid, BRASS.deep, BRASS.o, hex("#0a2a1c"), hex("#062018")];
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      // distance in from a rounded rect's edge
      const qx = Math.max(R - x, x - (W - 1 - R), 0), qy = Math.max(R - y, y - (H - 1 - R), 0);
      const inCorner = qx > 0 && qy > 0;
      const d = inCorner ? R - Math.hypot(qx, qy) : Math.min(x, y, W - 1 - x, H - 1 - y);
      if (d < 0) continue;
      const k = Math.floor(d), tl = x + y < W - 1;
      let c = k >= ring.length ? glass : ring[k];
      if (k === 1) c = tl ? BRASS.lit : BRASS.dark;
      if (k === 3) c = tl ? BRASS.mid : BRASS.dark;
      p.px(x, y, c);
    }
  for (const [x, y] of [[3, 3], [W - 5, 3], [3, H - 5], [W - 5, H - 5]]) {
    p.px(x, y, BRASS.rivet); p.px(x + 1, y, BRASS.mid); p.px(x, y + 1, BRASS.mid); p.px(x + 1, y + 1, BRASS.deep);
  }
}

export function draw(p, _t, o) {
  const k = KINDS[o.kind];
  if (k.bezel) bezel(p);
  else plate(p, k.plate);
}
