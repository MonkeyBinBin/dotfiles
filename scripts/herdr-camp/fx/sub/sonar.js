// The sonar scope: a round phosphor screen in a riveted brass ring, range rings and a cross, the sweep arm turning
// with a fading green trail. Contacts are not drawn here: the mod puts each agent's blip on top.
// Origin at the center; the ring's outside radius is R + 9.

import { hex, wrap } from "../../core/index.js";

export const meta = {
  name: "Sonar scope",
  desc: "A round green sonar screen in a riveted brass ring: range rings, a cross, and a sweep arm with a fading trail.",
  tags: ["sub", "ui", "loop"],
  size: [144, 144],
  origin: [72, 72],
  duration: 3,
  loop: true,
  fps: 15,
  bg: "dark",
  options: {},
};

export const R = 60;
const D = meta.duration;
const TRAIL = ["#04301c", "#0a5030", "#138046", "#36d07a"].map(hex);
const SCREEN = hex("#021c11"), EDGE = hex("#01120a"), RING = hex("#0b4a2c"), CROSS = hex("#0b3a24"), TICK = hex("#1f7a50");
const ARM = hex("#c8ffe0"), RIM = hex("#2f9a62");
const BRASS = ["#1e1406", "#3a2a0e", "#7a5a22", "#b8903e", "#f0d07a", "#8a6a2a", "#fff2b8", "#4a3410"].map(hex);

export function draw(p, t) {
  const sweep = (wrap(t, D) / D) * 360;
  const r1 = R / 3, r2 = (2 * R) / 3;
  p.shade(-R - 10, -R - 10, R + 10, R + 10, (x, y) => {
    const dx = x + 0.5, dy = y + 0.5, d = Math.hypot(dx, dy);
    if (d > R + 9) return;
    if (d > R) {
      // the brass ring, lit from the top left
      const k = d - R, tl = dx + dy < 0;
      return k < 1 ? BRASS[1] : k < 2.5 ? (tl ? BRASS[2] : BRASS[3]) : k < 6 ? (tl ? BRASS[4] : BRASS[5]) : k < 8 ? BRASS[3] : BRASS[0];
    }
    const ring = Math.abs(d - r1) < 0.5 || Math.abs(d - r2) < 0.5;
    let c = d > R - 6 ? EDGE : SCREEN;
    if (ring) c = RING;
    if ((Math.abs(dx) < 0.6 || Math.abs(dy) < 0.6) && (Math.floor(x) + Math.floor(y)) % 2 === 0) c = CROSS;
    const ang = ((Math.atan2(dx, -dy) * 180) / Math.PI + 360) % 360;
    if (d > R - 4 && d < R - 1 && Math.abs(((ang + 7.5) % 15) - 7.5) < 1.2) c = TICK;
    const diff = (sweep - ang + 360) % 360;
    if (diff < 100) {
      const lv = diff < 5 ? 3 : diff < 22 ? 2 : diff < 52 ? 1 : 0, dith = (Math.floor(x) + Math.floor(y)) % 2 === 0;
      const edge = (lv === 0 && diff > 80) || (lv === 1 && diff > 45) || (lv === 2 && diff > 17);
      c = edge && dith ? (lv ? TRAIL[lv - 1] : c) : TRAIL[lv];
      if (ring) c = lv >= 2 ? hex("#5cefa0") : hex("#14703f");
    }
    if (diff < 1.4 || diff > 359.4) c = ARM;
    if (d > R - 1) c = RIM;
    return c;
  });
  // rivets round the ring, and the boat at the center
  for (let a = 0; a < 360; a += 30) {
    const q = (a * Math.PI) / 180, x = Math.round(Math.sin(q) * (R + 4.5)), y = Math.round(-Math.cos(q) * (R + 4.5));
    p.px(x, y, BRASS[6]); p.px(x + 1, y + 1, BRASS[7]);
  }
  p.rect(-4, -1, 8, 3, ARM); p.rect(-1, -3, 3, 2, ARM); p.px(4, 0, ARM);
}
