// The locomotive-hauled train: a boxy electric locomotive painted in the status colour at the head (cab windows at both
// ends, side grilles, two pantographs, three-axle bogies), hauling two dark navy coaches with a status stripe, a row of
// small lit windows and end doors; red tail lamps on the last coach.

import { GEAR, GLASS, ROOF, bogie, doorway, fill, lamps, parked, ramp, seat, pantograph } from "./_kit.js";

const NAVY = ramp(["#10151e", "#1a2130", "#253044", "#34425c", "#4a5a78"]);
const STEEL = ramp(["#4a535c", "#727e8a", "#9aa6b2", "#c2ccd5", "#e4eaef"]);
const COACHES = [{ x0: -62, w: 40 }, { x0: -20, w: 40 }];
const LOCO = { x0: 22, w: 41 };
const TOP = -19, WIN_T = -15, WIN_B = -13, STRIPE = -10, SKIRT = -4, LTOP = -20;

function coach(p, { x0, w }, s, c, frame, last) {
  const navy = parked(s, NAVY), band = parked(s, c, 0.45);
  for (const bc of [x0 + 7, x0 + w - 8]) bogie(p, bc, SKIRT + 1, s, frame);
  fill(p, x0, TOP - 1, x0 + w - 1, SKIRT, (x, y) => {
    const q = x - x0;
    if (y === TOP - 1) return q >= 2 && q <= w - 3 ? ROOF[1] : undefined;
    if (y === TOP) return q >= 1 && q <= w - 2 ? navy[4] : undefined;
    if (y === STRIPE) return band[2];
    if (y === STRIPE + 1) return band[1];
    if (y === SKIRT) return navy[0];
    return y > STRIPE ? navy[2] : navy[3];
  });
  // a row of small windows, end doors with drop lights
  for (let x = x0 + 6; x < x0 + w - 7; x += 4) {
    const who = seat(x * 3) < 3;
    for (let y = WIN_T; y <= WIN_B; y++) for (let k = 0; k < 3; k++) p.px(x + k, y, pane(s, y, k, who));
  }
  for (const d of [x0 + 1, x0 + w - 5]) {
    for (let y = WIN_T - 1; y <= SKIRT - 1; y++)
      for (let k = 0; k < 4; k++) {
        const edge = k === 0 || k === 3;
        if (s === "done") p.px(d + k, y, edge ? navy[1] : doorway(y - WIN_T + 1, SKIRT - WIN_T + 1));
        else if (edge) p.px(d + k, y, navy[1]);
      }
  }
  if (last) lamps(p, x0, STRIPE + 2, s, false, frame, 1);
}

function pane(s, y, k, who) {
  // the window's own little rows: top lit brighter, a passenger in some
  const row = y - WIN_T;
  if (s === "idle") return row === 0 ? GLASS.deep : GLASS.dark;
  return paneKit(s, row, 3, { who: who && k === 1 && row >= 1 });
}
import { pane as paneKit } from "./_kit.js";

function loco(p, s, c, frame) {
  const { x0, w } = LOCO, body = parked(s, c, 0.45), steel = parked(s, STEEL);
  for (const bc of [x0 + 9, x0 + w - 10]) bogie(p, bc, SKIRT + 1, s, frame, { axles: 3, gap: 5 });
  // the body: bevelled at the roof's corners, a light line along the top, a darker skirt
  fill(p, x0, LTOP - 1, x0 + w - 1, SKIRT, (x, y) => {
    const q = x - x0, bevel = Math.max(0, LTOP + 2 - y);
    if (q < bevel || q > w - 1 - bevel) return;
    if (y === LTOP - 1) return ROOF[1];
    if (y === LTOP) return body[3];
    if (y === SKIRT) return GEAR[2];
    if (y >= SKIRT - 3) return body[1];
    return body[2];
  });
  // cab windows at both ends, side grilles between, a cream stripe under them
  for (const at of [x0 + 2, x0 + w - 6]) for (let y = LTOP + 3; y <= LTOP + 6; y++) for (let k = 0; k < 4; k++) p.px(at + k, y, (k + y) % 5 === 0 ? GLASS.glintHi : GLASS.deep);
  for (let x = x0 + 9; x < x0 + w - 9; x += 2) for (let y = LTOP + 3; y <= LTOP + 9; y++) p.px(x, y, body[0]);
  p.rect(x0 + 1, SKIRT - 4, w - 2, 1, parked(s, ramp(["#e8dcc0"]))[0]);
  // the head's lamps and buffer beam
  lamps(p, x0 + w - 1, SKIRT - 3, s, true, frame, -1);
  p.rect(x0 + w - 2, SKIRT + 1, 2, 1, GEAR[3]);
  // roof gear: insulators and the two pantographs, the leading one raised while it runs
  p.rect(x0 + 14, LTOP - 2, 12, 1, ROOF[0]);
  pantograph(p, x0 + 6, LTOP - 1, s === "working" ? "idle" : s, frame, steel);
  pantograph(p, x0 + w - 16, LTOP - 1, s, frame, steel);
}

export function locoTrain(p, s, c, frame) {
  coach(p, COACHES[0], s, c, frame, true);
  coach(p, COACHES[1], s, c, frame, false);
  loco(p, s, c, frame);
  p.rect(-22, TOP + 3, 2, SKIRT - TOP - 3, GEAR[1]);
  p.rect(20, TOP + 3, 2, SKIRT - TOP - 3, GEAR[1]);
}
