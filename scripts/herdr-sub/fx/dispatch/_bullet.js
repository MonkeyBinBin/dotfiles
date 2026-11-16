// The high-speed train: a long, low aerodynamic nose at each end, a white body with the status in a long stripe under
// small windows, full skirts over the bogies (only the wheel rims show), a shrouded pantograph on the middle car.

import { GEAR, GLASS, LAMP, bogie, doorway, fill, lamps, pane, pantograph, parked, ramp, seat } from "./_kit.js";

const WHITE = ramp(["#5a646c", "#8e98a0", "#bcc6cd", "#dfe5ea", "#f6f8fa"]);
const CARS = [{ x0: -62, w: 42, nose: "l" }, { x0: -18, w: 36, nose: null }, { x0: 20, w: 43, nose: "r" }];
const TOP = -18, BOT = -3, WIN_T = -14, WIN_B = -12, STRIPE = -8, NOSE = 22;

function car(p, { x0, w, nose }, s, c, frame) {
  const white = parked(s, WHITE), band = parked(s, c, 0.45);
  // u: 0 at the nose's tip .. 1 where it meets the full body
  const along = (x) => {
    const q = x - x0;
    if (nose === "r") return Math.min(1, (w - 1 - q) / NOSE);
    if (nose === "l") return Math.min(1, q / NOSE);
    return 1;
  };
  const topAt = (x) => {
    const u = along(x);
    return Math.round(BOT - 3 - (BOT - 3 - TOP) * Math.sqrt(u));
  };
  for (const bc of [x0 + 7, x0 + w - 8]) bogie(p, bc, BOT, s, frame);
  fill(p, x0, TOP - 1, x0 + w - 1, BOT, (x, y) => {
    const top = topAt(x), u = along(x);
    if (y < top - (u === 1 ? 1 : 0)) return;
    if (u === 1 && y === TOP - 1) return x - x0 >= 2 && x - x0 <= w - 3 ? white[2] : undefined;
    if (y === top) return white[4];
    if (y === STRIPE || y === STRIPE + 1) return y === STRIPE ? band[2] : band[1];
    if (y === BOT) return white[0];
    if (y >= BOT - 2) return white[1];
    return y > STRIPE ? white[2] : white[3];
  });
  // the cockpit glass on the nose's slope
  if (nose) {
    for (let x = x0; x < x0 + w; x++) {
      const u = along(x);
      if (u < 0.22 || u > 0.6) continue;
      const top = topAt(x);
      for (let y = top + 1; y <= top + 2; y++) p.px(x, y, (x + y) % 4 === 0 ? GLASS.glintHi : GLASS.deep);
    }
  }
  // small windows down the side, a door near each end
  const from = nose === "l" ? x0 + NOSE + 2 : x0 + 3, to = nose === "r" ? x0 + w - NOSE - 3 : x0 + w - 3;
  const doors = [from, to - 3];
  for (let x = from + 4; x < to - 4; x += 3) {
    const who = seat(x * 5) < 3;
    for (let y = WIN_T; y <= WIN_B; y++) for (let k = 0; k < 2; k++) p.px(x + k, y, pane(s, y - WIN_T + (y === WIN_B ? 2 : 0), 4, { who: who && y === WIN_B }));
  }
  for (const d of doors) {
    for (let y = WIN_T - 1; y <= BOT - 2; y++) {
      const edge = (k) => k === 0 || k === 3;
      for (let k = 0; k < 4; k++) {
        if (s === "done") p.px(d + k, y, edge(k) ? white[1] : doorway(y - WIN_T + 1, BOT - WIN_T));
        else if (edge(k)) p.px(d + k, y, white[1]);
      }
    }
  }
  // the lamps low on the nose's tip, and the coupler cover
  if (nose) {
    const tip = nose === "r" ? x0 + w - 3 : x0 + 2, inward = nose === "r" ? -1 : 1;
    lamps(p, tip, BOT - 4, s, nose === "r", frame, inward);
    p.px(tip + inward, BOT - 4, s === "idle" ? LAMP.off : white[4]);
  }
}

export function bullet(p, s, c, frame) {
  for (const k of CARS) car(p, k, s, c, frame);
  // the gangways' rubber, flush with the body
  for (const k of CARS.slice(1)) p.rect(k.x0 - 2, TOP + 1, 2, BOT - TOP - 1, GEAR[1]);
  // a low fairing round the pantograph
  const x = CARS[1].x0 + 14;
  p.rect(x - 5, TOP - 2, 16, 2, parked(s, WHITE)[2]);
  p.rect(x - 5, TOP - 2, 16, 1, parked(s, WHITE)[3]);
  pantograph(p, x, TOP - 2, s, frame, parked(s, ramp(["#4a535c", "#727e8a", "#9aa6b2", "#c2ccd5", "#e4eaef"])));
}
