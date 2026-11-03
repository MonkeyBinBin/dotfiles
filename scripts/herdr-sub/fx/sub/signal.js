// Little signals for a pane's porthole header (`kind`):
//   beacon   a red emergency beacon turning: a dome with a light sweeping round, flashing on each pass (blocked)
//   bubbles  a stream of air bubbles rising and drifting right, out of a working sub (working)
// Origin at the top left.

import { hex, wrap, TAU } from "../../core/index.js";

export const meta = {
  name: "Header signal",
  desc: "A tiny turning red emergency beacon, or a stream of rising air bubbles, for a pane header.",
  tags: ["sub", "ui", "icon", "loop"],
  size: [48, 16],
  origin: [0, 0],
  duration: 1.2,
  loop: true,
  fps: 12,
  bg: "dark",
  options: { kind: "beacon" },
};

const D = meta.duration;
const RED = ["#5a1410", "#c8303a", "#ff5a4a", "#ffd0c0"].map(hex), STEEL = ["#1c3032", "#4a6a6c", "#8aacac"].map(hex);
const BUBBLE = [hex("#2a88aa"), hex("#8ad8ff"), hex("#e8fbff")];

function beacon(p, ph) {
  // base plate
  p.rect(1, 12, 12, 2, STEEL[1]); p.rect(1, 12, 12, 1, STEEL[2]); p.rect(1, 14, 12, 1, STEEL[0]);
  // the dome: lit on the side the lamp is turned to
  const face = Math.sin(ph * TAU), lit = Math.abs(face) > 0.7;
  p.shade(2, 3, 11, 11, (x, y) => {
    const dx = (x - 6.5) / 4.6, dy = (y - 11) / 7.5;
    if (dx * dx + dy * dy > 1 || y > 11) return;
    const near = Math.abs(dx - face * 0.6) < 0.35;
    return near ? (lit ? RED[3] : RED[2]) : dy < -0.6 && dx < 0 ? RED[2] : RED[1];
  });
  p.rect(5, 2, 3, 1, STEEL[1]);
  if (lit) p.glow(6.5 + face * 3, 7, 10, RED[2], 0.55);
}

function bubbles(p, ph) {
  // a few bubbles leaving the left edge low and rising as they drift right, each on its own beat
  for (let i = 0; i < 6; i++) {
    const k = (ph + i / 6) % 1, x = 2 + k * 42 + Math.sin((k + i) * TAU) * 1.2, y = 13 - k * 10 - (i % 2);
    const r = 0.8 + (i % 3) * 0.6 + k * 0.6;
    if (r < 1.2) { p.px(x, y, BUBBLE[1]); continue; }
    p.ring(x, y, r + 0.5, 1, BUBBLE[k > 0.8 ? 0 : 1]);
    p.px(x - r * 0.4, y - r * 0.4, BUBBLE[2]);
  }
}

export function draw(p, t, o) {
  const ph = wrap(t, D) / D;
  (o.kind === "beacon" ? beacon : bubbles)(p, ph);
}
