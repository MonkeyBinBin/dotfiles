// The light-rail tram: three articulated sections on a low floor, rounded cab ends with big curved windscreens, a
// white body over a status-coloured skirt band and a matching roof fairing, wide windows, double doors down to the
// floor, small wheels tucked behind the skirt, a pantograph on the middle section.

import { GEAR, GLASS, ROOF, bogie, doorway, fill, lamps, pane, pantograph, parked, ramp, seat } from "./_kit.js";

const WHITE = ramp(["#5a646c", "#8e98a0", "#bcc6cd", "#dfe5ea", "#f6f8fa"]);
const STEEL = ramp(["#4a535c", "#727e8a", "#9aa6b2", "#c2ccd5", "#e4eaef"]);
const SECTIONS = [{ x0: -62, w: 38, cab: "l" }, { x0: -21, w: 40, cab: null }, { x0: 22, w: 41, cab: "r" }];
const TOP = -19, WIN_T = -16, WIN_B = -9, BAND = -6, BOT = -2;

function section(p, { x0, w, cab }, s, c, frame) {
  const white = parked(s, WHITE), band = parked(s, c, 0.45);
  // rounded cab ends: cut more at the top and a little at the foot
  const cutAt = (y) => (y <= TOP + 3 ? [5, 3, 2, 1][y - TOP] ?? 0 : y >= BOT - 1 ? (y === BOT ? 2 : 1) : 0);
  const inside = (x, y) => {
    const q = x - x0, cut = cutAt(y);
    if (y < TOP - 2 || y > BOT) return false;
    if (y < TOP) return q >= 6 && q <= w - 7; // the roof fairing
    if (cab === "r" && q > w - 1 - cut) return false;
    if (cab === "l" && q < cut) return false;
    if (!cab && (y === TOP || y === BOT) && (q === 0 || q === w - 1)) return false;
    return true;
  };
  for (const bc of cab ? [x0 + (cab === "l" ? 10 : w - 11)] : [x0 + w / 2]) bogie(p, Math.round(bc), BOT, s, frame, { gap: 5, r: 1.5 });
  fill(p, x0, TOP - 2, x0 + w - 1, BOT, (x, y) => {
    if (!inside(x, y)) return;
    if (y < TOP) return y === TOP - 2 ? band[2] : band[1];
    if (y === TOP) return white[4];
    if (y >= BAND && y < BOT) return y === BAND ? band[3] : band[2];
    if (y === BOT) return band[0];
    return white[3];
  });
  // wide windows between thin pillars, double doors to the floor
  const doorAt = cab ? [x0 + (cab === "l" ? 16 : w - 22)] : [x0 + 6, x0 + w - 12];
  const doorCols = new Set(doorAt.flatMap((d) => [0, 1, 2, 3, 4, 5].map((k) => d + k)));
  for (let q = 0; q < w; q++) {
    const x = x0 + q, fromCab = cab === "r" ? w - 1 - q : cab === "l" ? q : 99;
    if (doorCols.has(x) || q % 7 === 0) continue;
    if (fromCab < 7) {
      // the curved windscreen wrapping round the cab
      for (let y = TOP + 1; y <= WIN_B; y++) if (inside(x, y) && fromCab > 0) p.px(x, y, (x + y) % 6 === 0 ? GLASS.glintHi : GLASS.deep);
      continue;
    }
    const who = seat(x0 + Math.floor(q / 7)) < 3 && q % 7 >= 2 && q % 7 <= 4;
    for (let y = WIN_T; y <= WIN_B; y++) p.px(x, y, pane(s, y - WIN_T, WIN_B - WIN_T + 1, { who: who && y > WIN_T + 2, head: q % 7 === 3 && y === WIN_T + 3 }));
  }
  for (const d of doorAt) {
    for (let y = WIN_T; y <= BOT - 1; y++)
      for (let k = 0; k < 6; k++) {
        const edge = k === 0 || k === 5, mid = k === 2 || k === 3;
        if (s === "done") p.px(d + k, y, edge ? white[1] : doorway(y - WIN_T, BOT - WIN_T));
        else if (edge) p.px(d + k, y, white[1]);
        else if (y <= WIN_B - 1 && !mid) p.px(d + k, y, pane(s, y - WIN_T, 6));
        else if (mid && k === 2) p.px(d + k, y, white[1]);
      }
  }
  if (cab) {
    const nose = cab === "r" ? x0 + w - 1 : x0, inward = cab === "r" ? -1 : 1;
    lamps(p, nose, BAND - 1, s, cab === "r", frame, inward);
  }
}

export function tram(p, s, c, frame) {
  for (const k of SECTIONS) section(p, k, s, c, frame);
  // the articulation bellows
  for (const x of [-24, 19]) p.rect(x, TOP + 2, 3, BOT - TOP - 3, GEAR[1]);
  p.rect(-14, TOP - 3, 26, 1, ROOF[1]);
  pantograph(p, -4, TOP - 3, s, frame, parked(s, STEEL));
}
