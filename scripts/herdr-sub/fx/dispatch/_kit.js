// Shared parts for the dispatch trains (train.js and its _<model>.js files): palettes, how glass looks in each state,
// lamps, bogies, a single-arm pantograph that reaches the scenery's contact wire, and a body filler on whole pixels.
// Every train is drawn facing right in the same box: x -62..62, the rail top at y = 0 (wheels stand on it).

import { hex } from "../../core/index.js";

export const H = (s) => hex(s);
export const mix = (a, b, k) => [0, 8, 16].reduce((o, s) => o | (Math.round(((a >>> s) & 255) * (1 - k) + ((b >>> s) & 255) * k) << s), a & 0xff000000);
export const ramp = (list) => list.map(H);

export const NIGHT = H("#0c1014");
export const GEAR = ramp(["#15181c", "#24292f", "#363d45", "#58616b", "#8a949e"]);
export const ROOF = ramp(["#3a4048", "#5a636c", "#7a848e"]);
export const GLASS = { dark: H("#16202a"), deep: H("#0e151c"), glint: H("#4c6474"), glintHi: H("#7a94a4") };
export const LIT = { top: H("#fff4d0"), mid: H("#f0d898"), low: H("#c8b07a"), person: H("#5a4a34"), personHi: H("#7a6648") };
export const OPEN = { ceil: H("#ffe8b0"), wall: H("#7a6440"), floor: H("#3a2c1a") };
export const LAMP = { head: H("#fffbe8"), headDim: H("#8a8670"), off: H("#3a3e44"), red: H("#ff3a2a"), redHi: H("#ffb0a0"), redOff: H("#4a1a16"), dest: H("#ffb03a"), destOff: H("#2a2620") };
export const SPARK = [H("#e8f4ff"), H("#8ac8ff")];
export const CONTACT = -31; // where a raised pantograph's head meets the wire (scene.js draws it at -32)

/** A train's colours whatever it's doing: its status shows in its lamps, windows and doors, never in its paint
 *  (a train doesn't change colour). Kept as a hook so the models read the same. */
export const parked = (_s, list) => list;

/** Fill a box on whole pixels: fn(x, y) returns a colour or nothing (pixelfx's shade hands over pixel centres). */
export function fill(p, x0, y0, x1, y1, fn) {
  p.shade(x0, y0, x1, y1, (cx, cy) => fn(Math.floor(cx), Math.floor(cy)));
}

// a stable little random, for who sits where
export const seat = (n) => ((n * 2654435761) >>> 0) % 7;

/** A window pixel: lit saloon (with a passenger's head and shoulders where `who`), dimmed when held, dark when parked;
 *  `row` counts from the window's top, `rows` its height, `glint` puts a reflection streak on dark glass. */
export function pane(s, row, rows, { who = false, head = false, glint = false } = {}) {
  if (s === "idle") return glint ? GLASS.glint : row === 0 ? GLASS.deep : GLASS.dark;
  let col = row === 0 ? LIT.top : row >= rows - 2 ? LIT.low : LIT.mid;
  if (who && row >= 2) col = head && row === 2 ? LIT.personHi : LIT.person;
  if (s === "blocked") col = mix(col, GLASS.dark, 0.45);
  return col;
}

/** An open doorway at a platform: the lit saloon, its floor. */
export const doorway = (row, rows) => (row === 0 ? OPEN.ceil : row < 3 ? mix(OPEN.ceil, OPEN.wall, 0.5) : row > rows - 3 ? OPEN.floor : OPEN.wall);

/** The lamp colour at one end: headlights lead and red tail lights trail while running; red markers blink when held. */
export function lampColor(s, isHead, frame) {
  if (s === "working") return isHead ? LAMP.head : LAMP.red;
  if (s === "blocked") return frame % 2 === 0 ? LAMP.redHi : isHead ? LAMP.headDim : LAMP.redOff;
  if (s === "done") return isHead ? LAMP.off : LAMP.redOff;
  return LAMP.off;
}

/** Two lamp pixels stacked at (x, y) and their glow. `inward`: +1 when the end faces left. */
export function lamps(p, x, y, s, isHead, frame, inward) {
  const col = lampColor(s, isHead, frame);
  p.px(x, y, col);
  p.px(x, y + 1, col === LAMP.redHi ? LAMP.red : col);
  if (col === LAMP.head) p.glow(x - 2 * inward, y, 4, LAMP.head, 0.5);
  if (col === LAMP.redHi || (col === LAMP.red && s === "working")) p.glow(x - 2 * inward, y, 3, LAMP.red, 0.45);
}

/** A bogie centred at bc: a frame over `axles` wheels `gap` apart, springs; the spokes turn while it runs. */
export function bogie(p, bc, top, s, frame, { axles = 2, gap = 6, r = 2 } = {}) {
  const span = (axles - 1) * gap;
  p.rect(bc - span / 2 - 2, top, span + 5, 1, GEAR[2]);
  for (let i = 0; i < axles; i++) {
    const ax = Math.round(bc - span / 2 + i * gap);
    p.circle(ax, -r, r, GEAR[1]);
    if (r >= 2) p.ring(ax, -r, r, 1, GEAR[3]);
    p.px(ax, -Math.round(r), GEAR[4]);
    const spin = s === "working" ? frame % 2 : 0;
    if (r >= 2) p.px(ax + (spin ? 1 : 0), -r + (spin ? 0 : -1), GEAR[4]);
    if (i < axles - 1) p.px(ax + Math.round(gap / 2), top + 1, GEAR[4]);
  }
}

/** A single-arm pantograph standing on a roof at y `roof`: raised to the contact wire, folded when parked. */
export function pantograph(p, x, roof, s, frame, steel) {
  p.rect(x - 2, roof - 1, 6, 1, GEAR[3]);
  p.px(x - 1, roof, H("#c8c0a8"));
  p.px(x + 3, roof, H("#c8c0a8"));
  if (s === "idle") {
    p.line(x, roof - 2, x + 10, roof - 2, steel[1]);
    p.rect(x + 9, roof - 3, 4, 1, steel[2]);
    return;
  }
  const knee = Math.round((roof - 2 + CONTACT) / 2);
  p.line(x, roof - 2, x + 7, knee, steel[2]);
  p.line(x + 7, knee, x + 2, CONTACT + 1, steel[3]);
  p.rect(x - 1, CONTACT, 7, 1, steel[4]);
  p.px(x - 2, CONTACT + 1, steel[2]);
  p.px(x + 6, CONTACT + 1, steel[2]);
  if (s === "working" && frame === 3) {
    p.px(x + 2, CONTACT - 1, SPARK[0]);
    p.px(x + 3, CONTACT - 2, SPARK[1]);
    p.glow(x + 2, CONTACT - 1, 3, SPARK[1], 0.6);
  }
}
