// Window frames for the sub, one sample per material, sliced by bake.mjs into the shared nine-slice kit
// (four corner PNGs, each side's color profile). Kinds (`kind`):
//   brass   a polished brass plate: tabs, the shown compartment, the nameplate, buttons
//   steel   a dull steel plate: the other tabs and compartments
//   bezel   a riveted brass porthole frame round a dark glass: the sea and the sonar's housings
//   panel   a raised steel plate screwed down at its corners: the console's panels
//   key     a raised steel key: the console's buttons and unlit plates
//   well    a sunken window, shaded along its top left, catching light along its bottom right: dials, alarms
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

const PANEL = { o: hex("#05090b"), lit: hex("#7f9296"), mid: hex("#3a474b"), dark: hex("#1a2326") };
const KEY = { o: hex("#05090b"), lit: hex("#a8bcbe"), mid: hex("#566a6e"), dark: hex("#253033") };
const WELL = { o: hex("#05090b"), lit: hex("#010405"), mid: hex("#041012"), dark: hex("#65787c") };
const SCREW = C("#c0ced0", "#8a9a9c", "#39474a", "#0a1214");

export const KINDS = {
  panel: { cx: 6, cy: 6, fill: "#3a474b", plate: PANEL, screws: true },
  key: { cx: 3, cy: 3, fill: "#566a6e", plate: KEY },
  well: { cx: 2, cy: 2, fill: "#041012", plate: WELL },
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

// a slotted screw head set into the plate, lit from the top left
function screw(p, cx, cy) {
  for (const [x, y] of [[0, -1], [1, -1], [-1, 0], [0, 0], [1, 0], [2, 0], [-1, 1], [0, 1], [1, 1], [2, 1], [0, 2], [1, 2]])
    p.px(cx + x, cy + y, SCREW[x + y < 1 ? 0 : x + y < 2 ? 1 : 2]);
  for (const [x, y] of [[-1, 1], [0, 1], [1, 0], [2, 0]]) p.px(cx + x, cy + y, SCREW[3]);
}

export function draw(p, _t, o) {
  const k = KINDS[o.kind];
  if (k.bezel) bezel(p);
  else plate(p, k.plate);
  if (k.screws) for (const [x, y] of [[2, 2], [W - 4, 2], [2, H - 4], [W - 4, H - 4]]) screw(p, x, y);
}
