// The commuter EMU: three stainless-steel cars, a colour line over the windows and the status in the belt band,
// raked cabs at both ends, AC units on the roofs, a single-arm pantograph on the middle car.

import { GEAR, GLASS, LAMP, ROOF as ROOFC, bogie, doorway, fill, lamps, mix, H, pane, pantograph, parked, ramp, seat } from "./_kit.js";

const STEEL = ramp(["#4a535c", "#727e8a", "#9aa6b2", "#c2ccd5", "#e4eaef"]);
const CW = 40, GAP = 2;
const CARS = [{ x0: -61, kind: "tail" }, { x0: -61 + CW + GAP, kind: "mid" }, { x0: -61 + 2 * (CW + GAP), kind: "head" }];
const ROOF = -21, TOP = -19, WIN_T = -16, WIN_B = -11, BELT_T = -9, BELT_B = -7, SKIRT = -4;
// columns: | pillar, W window, D door, C cab side window, F the raked windscreen
const SIDE = {
  mid: "|WWW|DDDD|WWWW|WWWW|WWWW|WWWW|DDDD|WWW||",
  head: "|WWW|DDDD|WWWW|WWWW|WWWW|DDDD||CCC|FFFF",
  tail: "FFFF|CCC||DDDD|WWWW|WWWW|WWWW|DDDD|WWW|",
};

function car(p, { x0, kind }, s, c, frame) {
  const cols = SIDE[kind], steel = parked(s, STEEL), band = parked(s, c, 0.45);
  const rake = (y) => Math.max(0, Math.round((WIN_B - y) * 0.42));
  const inside = (x, y) => {
    const q = x - x0;
    if (y < TOP - 1) return false;
    if (y === TOP - 1) return q >= 2 && q <= CW - 3;
    if (y === TOP) return q >= 1 && q <= CW - 2;
    if (kind === "head" && q > CW - 1 - rake(y)) return false;
    if (kind === "tail" && q < rake(y)) return false;
    return y <= SKIRT;
  };
  for (const bc of [x0 + 6, x0 + CW - 7]) bogie(p, bc, SKIRT + 1, s, frame);
  fill(p, x0, TOP - 1, x0 + CW - 1, SKIRT, (x, y) => {
    if (!inside(x, y)) return;
    if (y === TOP - 1) return ROOFC[2];
    if (y === TOP) return steel[4];
    if (y === TOP + 1) return steel[3];
    if (y === WIN_T - 1) return band[2];
    if (y === BELT_T) return band[3];
    if (y === BELT_T + 1) return band[2];
    if (y === BELT_B) return band[1];
    if (y === SKIRT) return steel[0];
    if (y === SKIRT - 1) return steel[1];
    if (y > BELT_B) return (x - x0) % 3 === 0 ? steel[2] : steel[3];
    return steel[3];
  });
  for (let q = 0; q < CW; q++) {
    const at = cols[q], x = x0 + q;
    if (at === "W" || at === "C") {
      const who = at === "W" && seat(x0 * 7 + Math.floor(q / 5)) < 3 && (q % 5 === 2 || q % 5 === 3);
      for (let y = WIN_T; y <= WIN_B; y++) {
        const row = y - WIN_T;
        let col = pane(s, row, WIN_B - WIN_T + 1, { who, head: q % 5 === 2, glint: (q + row) % 9 === 0 });
        if (s !== "idle" && (q + row) % 9 === 0 && row < 2) col = mix(col, H("#ffffff"), 0.3);
        p.px(x, y, col);
      }
      p.px(x, WIN_B + 1, steel[1]);
    }
    if (at === "D") {
      const first = cols[q - 1] !== "D", last = cols[q + 1] !== "D", rows = SKIRT - WIN_T + 1;
      for (let y = WIN_T - 1; y <= SKIRT - 1; y++) {
        const row = y - WIN_T + 1;
        let col;
        if (s === "done") col = first || last ? steel[0] : doorway(row, rows);
        else if (first || last) col = steel[1];
        else col = y >= WIN_T && y <= WIN_B - 1 ? pane(s, y - WIN_T, 6) : steel[3];
        p.px(x, y, col);
      }
    }
    if (at === "F") {
      for (let y = TOP + 1; y <= WIN_B; y++) {
        if (!inside(x, y)) continue;
        const edge = !inside(x + (kind === "head" ? 1 : -1), y);
        p.px(x, y, edge ? steel[2] : (q + y) % 5 === 0 ? GLASS.glintHi : GLASS.deep);
      }
    }
  }
  const front = kind === "head" ? x0 + CW - 1 : kind === "tail" ? x0 : null;
  if (front !== null) {
    const inward = kind === "head" ? -1 : 1, isHead = kind === "head";
    for (let i = 1; i <= 4; i++) p.px(front + inward * (i + 2), TOP + 1, s === "idle" ? LAMP.destOff : LAMP.dest);
    lamps(p, front, BELT_B + 1, s, isHead, frame, inward);
    p.rect(isHead ? front - 2 : front, SKIRT + 1, 3, 1, GEAR[2]);
  }
  const ac = x0 + 13;
  p.rect(ac, ROOF - 1, 14, 2, ROOFC[1]);
  p.rect(ac, ROOF - 1, 14, 1, ROOFC[2]);
  for (let i = 1; i < 14; i += 2) p.px(ac + i, ROOF, ROOFC[0]);
  p.rect(x0 + 4, ROOF, 8, 1, ROOFC[0]);
  p.rect(x0 + CW - 12, ROOF, 8, 1, ROOFC[0]);
  p.rect(x0 + 12, SKIRT + 1, 16, 2, GEAR[1]);
  p.rect(x0 + 12, SKIRT + 1, 16, 1, GEAR[2]);
  p.rect(x0 + 15, SKIRT + 1, 1, 2, GEAR[3]);
  p.rect(x0 + 22, SKIRT + 1, 1, 2, GEAR[3]);
}

export function emu(p, s, c, frame) {
  for (const k of CARS) car(p, k, s, c, frame);
  for (const k of CARS.slice(1)) p.rect(k.x0 - GAP, TOP + 2, GAP, SKIRT - TOP - 2, GEAR[1]);
  pantograph(p, CARS[1].x0 + 8, ROOF, s, frame, parked(s, STEEL));
}
