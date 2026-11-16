// The diesel railcar pair: two long cars in a two-tone livery (cream over the status colour), rounded roofs, a single
// headlight over each cab's windscreen, an exhaust stack puffing smoke while it runs, the engine and radiator under
// the floor. No pantograph: it runs under the wires on its own power.

import { GEAR, GLASS, LAMP, ROOF, bogie, doorway, fill, lamps, mix, pane, parked, ramp, seat, H } from "./_kit.js";

const CREAM = ramp(["#6e6248", "#a8966e", "#d4c298", "#ebdcb6", "#f8eed4"]);
const CW = 61;
const CARS = [{ x0: -62, kind: "tail" }, { x0: 2, kind: "head" }];
const TOP = -19, WIN_T = -16, WIN_B = -12, LOWER = -9, SKIRT = -4;
const SMOKE = [H("#6a6a68"), H("#4a4a4a"), H("#343434")];

function car(p, { x0, kind }, s, c, frame) {
  const cream = parked(s, CREAM), band = parked(s, c, 0.45), isHead = kind === "head";
  const front = isHead ? x0 + CW - 1 : x0, inward = isHead ? -1 : 1;
  const inside = (x, y) => {
    const q = x - x0, fromFront = isHead ? CW - 1 - q : q;
    if (y < TOP - 1) return false;
    if (y === TOP - 1) return q >= 3 && q <= CW - 4;
    if (y === TOP) return q >= 1 && q <= CW - 2;
    // a gently raked cab end
    if (fromFront === 0 && y < WIN_B) return false;
    return y <= SKIRT;
  };
  for (const bc of [x0 + 8, x0 + CW - 9]) bogie(p, bc, SKIRT + 1, s, frame);
  fill(p, x0, TOP - 1, x0 + CW - 1, SKIRT, (x, y) => {
    if (!inside(x, y)) return;
    if (y === TOP - 1) return ROOF[2];
    if (y === TOP) return cream[4];
    if (y < LOWER) return y === LOWER - 1 ? cream[2] : cream[3];
    if (y === LOWER) return band[3];
    if (y === SKIRT) return band[0];
    return y === SKIRT - 1 ? band[1] : band[2];
  });
  // windows: wide saloon windows between pillars, a cab side window, doors near the ends
  const doorAt = [x0 + (isHead ? 10 : CW - 14), x0 + (isHead ? CW - 14 : 10)];
  const doorCols = new Set(doorAt.flatMap((d) => [0, 1, 2, 3].map((k) => d + k)));
  for (let q = 0; q < CW; q++) {
    const x = x0 + q, fromFront = isHead ? CW - 1 - q : q;
    if (doorCols.has(x)) continue;
    const cab = fromFront >= 2 && fromFront <= 5, saloon = fromFront > 6 && (q % 7) < 5 && q > 1 && q < CW - 2;
    if (!cab && !saloon) continue;
    const who = saloon && seat(x0 + Math.floor(q / 7) * 3) < 3 && q % 7 === 2;
    for (let y = WIN_T; y <= WIN_B; y++) p.px(x, y, cab ? (s === "idle" ? GLASS.dark : mix(GLASS.dark, LIT_CAB, 0.3)) : pane(s, y - WIN_T, WIN_B - WIN_T + 1, { who: who || (saloon && seat(x0 + Math.floor(q / 7) * 3) < 3 && q % 7 === 3), head: who }));
    p.px(x, WIN_B + 1, cream[1]);
  }
  for (const d of doorAt) {
    for (let y = WIN_T - 1; y <= SKIRT - 1; y++)
      for (let k = 0; k < 4; k++) {
        const edge = k === 0 || k === 3;
        if (s === "done") p.px(d + k, y, edge ? cream[1] : doorway(y - WIN_T + 1, SKIRT - WIN_T + 1));
        else if (edge) p.px(d + k, y, cream[1]);
        else if (y >= WIN_T && y <= WIN_B - 1) p.px(d + k, y, pane(s, y - WIN_T, 5));
      }
  }
  // the cab end: windscreen glass on its edge, a headlight above it, markers low
  for (let y = WIN_T; y <= WIN_B; y++) p.px(front + inward, y, GLASS.deep);
  const headlight = s === "working" && isHead ? LAMP.head : s === "idle" ? LAMP.off : mix(LAMP.head, LAMP.off, 0.6);
  p.px(front + inward, TOP + 1, headlight);
  if (headlight === LAMP.head) p.glow(front + 2, TOP + 1, 3, LAMP.head, 0.45);
  lamps(p, front, LOWER + 1, s, isHead, frame, inward);
  p.rect(isHead ? front - 2 : front, SKIRT + 1, 3, 1, GEAR[2]);
  // under the floor: the engine with its radiator grille
  const eng = x0 + 20;
  p.rect(eng, SKIRT + 1, 22, 3, GEAR[1]);
  p.rect(eng, SKIRT + 1, 22, 1, GEAR[2]);
  for (let k = 2; k < 10; k += 2) p.rect(eng + k, SKIRT + 2, 1, 2, GEAR[3]);
  // the exhaust stack, puffing while it runs
  const stack = x0 + (isHead ? 22 : CW - 25);
  p.rect(stack, TOP - 4, 2, 3, GEAR[1]);
  p.px(stack, TOP - 4, GEAR[3]);
  if (s === "working" || s === "blocked") {
    const rise = frame % 4;
    for (let i = 0; i < 3; i++) {
      const y = TOP - 6 - i * 3 - rise, x = stack - i * 2 - rise; // drifting back as it runs
      p.circle(x, y, 1 + (i > 0 ? 0.5 : 0), SMOKE[Math.min(2, i)]);
    }
  }
}

const LIT_CAB = H("#8a7a5a");

export function dmu(p, s, c, frame) {
  for (const k of CARS) car(p, k, s, c, frame);
  p.rect(-1, TOP + 2, 3, SKIRT - TOP - 2, GEAR[1]);
}
