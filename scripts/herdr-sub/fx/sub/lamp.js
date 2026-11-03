// A status lamp in a dark socket, for tab and compartment plates (`kind`): blocked red and blinking, done amber,
// working green, idle unlit. Origin at the center.

import { hex, wrap } from "../../core/index.js";

export const meta = {
  name: "Status lamp",
  desc: "A tiny round status lamp in a dark socket: blinking red, amber, green, or unlit.",
  tags: ["sub", "ui", "icon", "loop"],
  size: [10, 10],
  origin: [5, 5],
  duration: 1,
  loop: true,
  fps: 4,
  bg: "dark",
  options: { kind: "working" },
};

const LIT = { blocked: ["#ff5a4a", "#ffd0c0"], done: ["#ffc23d", "#fff3a6"], working: ["#5cff9a", "#d8ffe8"], idle: ["#123a2a", "#1c4a36"] };

export function draw(p, t, o) {
  const off = o.kind === "blocked" && wrap(t, 1) >= 0.5;
  const [c, hi] = (off ? ["#5a1410", "#7a2018"] : LIT[o.kind]).map(hex);
  p.shade(-3, -3, 3, 3, (x, y) => {
    const d = Math.hypot(x + 0.5, y + 0.5);
    if (d > 3.2) return;
    return d > 2.3 ? hex("#030b0d") : x < 0 && y < 0 && d < 1.6 ? hi : c;
  });
  if (!off && o.kind !== "idle") p.glow(0.5, 0.5, 4, hex(LIT[o.kind][0]), 0.35);
}
