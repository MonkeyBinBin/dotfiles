// A contact on the sonar scope, by its agent's status (`kind`): blocked rings pulsing red, done a gold ring with a
// chevron (surfacing), working a green dot that fades with the ping, idle a dim speck, and `focus` the lock-on
// brackets drawn round the focused one. Origin at the center.

import { hex, wrap, TAU } from "../../core/index.js";

export const meta = {
  name: "Sonar blip",
  desc: "A sonar contact: pulsing red rings (blocked), a gold surfacing ring (done), a green ping (working), a dim speck (idle), or lock-on brackets.",
  tags: ["sub", "ui", "icon", "loop"],
  size: [24, 24],
  origin: [12, 12],
  duration: 1.2,
  loop: true,
  fps: 12,
  bg: "dark",
  options: { kind: "working" },
};

const D = meta.duration;
const RED = ["#8a2018", "#ff5a4a", "#ffd0c0"].map(hex), GOLD = ["#8a6a1a", "#ffd25a", "#fff6c0"].map(hex);
const GREEN = ["#1f7a50", "#5cdc94", "#c8ffe0"].map(hex), LOCK = hex("#e8ffa0");

export function draw(p, t, o) {
  const ph = wrap(t, D) / D;
  if (o.kind === "blocked") {
    const r = 3 + ph * 8;
    p.ring(0, 0, r, 1, RED[ph < 0.5 ? 1 : 0]);
    if (ph < 0.6) p.ring(0, 0, r * 0.55, 1, RED[1]);
    p.rect(-1, -1, 3, 3, RED[1]); p.px(0, 0, RED[2]);
    p.glow(0.5, 0.5, 6, RED[1], 0.5);
  } else if (o.kind === "done") {
    p.ring(0.5, 0.5, 3.6, 1.2, GOLD[1]);
    const up = Math.floor(ph * 3);
    p.px(0, -6 - up, GOLD[1]); p.px(-1, -5 - up, GOLD[1]); p.px(1, -5 - up, GOLD[1]);
    p.glow(0.5, 0.5, 5, GOLD[1], 0.3);
  } else if (o.kind === "working") {
    const k = Math.sin(ph * TAU) > -0.2;
    p.rect(-1, -1, 3, 3, k ? GREEN[1] : GREEN[0]); if (k) p.px(0, 0, GREEN[2]);
  } else if (o.kind === "idle") {
    p.rect(0, 0, 2, 2, GREEN[0]);
  } else if (o.kind === "focus") {
    const s = ph < 0.5 ? 6 : 7;
    for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const x = sx * s, y = sy * s;
      p.px(x, y, LOCK); p.px(x - sx, y, LOCK); p.px(x, y - sy, LOCK);
    }
  }
}
