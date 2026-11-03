// The quest board's status seals, 12 x 12: a red ! seal that jolts (blocked), a little chest with a glint
// (done), a torch flame (working), a crescent moon bobbing (idle). Pick with `kind`.

import { hex, wrap, TAU, tileNoise } from "../../core/index.js";
import { Grid } from "../critters/_lib.js";

export const meta = {
  name: "Quest icon",
  desc: "A tiny status seal for the camp's quest board: a jolting red ! (blocked), a glinting chest (done), a flickering torch flame (working), a bobbing moon (idle).",
  tags: ["camp", "ui", "icon", "loop"],
  size: [16, 16],
  origin: [8, 14],
  duration: 1.2,
  loop: true,
  fps: 12,
  bg: "dark",
  options: { kind: "working", seed: 1 },
};

const D = meta.duration, g = new Grid(-8, -14, 16, 16);
const ramp = (...c) => c.map(hex);
const RED = ramp("#5e0f14", "#c8303a", "#ff5a4a", "#ffb0a0"), GOLD = ramp("#5a3a0c", "#b8801c", "#ffd23c", "#fff6c0");
const WOOD = ramp("#2e1a0c", "#6a421e", "#a8703a"), FIRE = ramp("#8a1f17", "#f2561d", "#ffc23d", "#fff3a6");
const MOON = ramp("#3a4a7a", "#9ab0e0", "#e6eeff"), INK = hex("#14121f"), WHITE = hex("#ffffff");

function seal(ph) {
  // a round red seal with a white !, jolting up on the beat
  const up = ph < 0.15 ? 1 : 0, dx = ph < 0.15 ? (Math.floor(ph * 40) % 2 ? 1 : -1) : 0;
  g.ellipse(dx, -6 - up, 5.4, 5.4, (nx, ny) => RED[ny < -0.45 && nx < 0.2 ? 3 : nx + ny > 0.9 ? 1 : 2]);
  for (let y = -9; y <= -6; y++) g.set(dx, y - up, WHITE);
  g.set(dx, -4 - up, WHITE);
  g.outline(INK);
  return { dx, up };
}

function chest(ph) {
  // a little chest, its lid ajar, gold light spilling, a glint winking on the lid
  g.shade(-5, -6, 4.99, -0.01, (x, y) => (y < -4.5 ? WOOD[1] : Math.abs(x) < 1 && y < -3 ? GOLD[2] : x > 2.5 ? WOOD[0] : WOOD[2]));
  g.shade(-5, -9, 4.99, -6.01, (x, y) => (y < -8 ? WOOD[2] : WOOD[1]));
  g.line(-4, -6.5, 4, -6.5, GOLD[2]);
  g.outline(INK);
  const k = Math.max(0, Math.sin(ph * TAU));
  return k;
}

function flame(t) {
  // a torch: a short stick and a flame that licks and leans
  g.shade(-1, -4, 0.99, -0.01, (x) => (x < 0 ? WOOD[2] : WOOD[1]));
  const ph = wrap(t, D) / D;
  g.shade(-4, -13, 3.99, -4.01, (x, y) => {
    const h = -4 - y, lean = 0.8 * Math.sin(ph * TAU + h * 0.5), w = 3.2 * (1 - h / 9.5) ** 0.8 * (1 + 0.15 * Math.sin(ph * TAU * 2));
    const n = tileNoise(ph * 4 + h * 0.4, 0.3, 4, 0, 7);
    const d = Math.abs(x - lean * h / 8) / Math.max(0.01, w);
    if (h > 9 + n * 1.5 || d > 1) return 0;
    return d < 0.35 && h < 6 ? FIRE[3] : d < 0.7 ? FIRE[2] : FIRE[h > 6 ? 0 : 1];
  });
  g.outline((x, y, nx, ny) => (ny > 0 ? INK : 0));
}

function moon(ph) {
  // a crescent, bobbing
  const b = Math.round(Math.sin(ph * TAU));
  g.shade(-6, -13, 5.99, -0.01, (x, y) => {
    const a = ((x + 0.5) ** 2 + (y + 6.5 + b) ** 2) <= 25, c = ((x - 2) ** 2 + (y + 8 + b) ** 2) <= 16;
    if (!a || c) return 0;
    return x < -2.5 ? MOON[2] : MOON[1];
  });
  g.outline((x, y, nx, ny) => MOON[0]);
}

export function draw(p, t, o) {
  const ph = wrap(t, D) / D;
  g.clear();
  if (o.kind === "blocked") {
    const s = seal(ph);
    g.draw(p);
    if (s.up) p.glow(s.dx, -7, 9, RED[2], 0.4);
  } else if (o.kind === "done") {
    const k = chest(ph);
    g.draw(p);
    p.glow(0, -7, 8, GOLD[2], 0.25 + 0.2 * k);
    if (k > 0.6) (p.px(3, -11, GOLD[3]), p.px(2, -11, GOLD[2]), p.px(4, -11, GOLD[2]), p.px(3, -12, GOLD[2]), p.px(3, -10, GOLD[2]));
  } else if (o.kind === "idle") {
    moon(ph);
    g.draw(p);
  } else {
    flame(t);
    g.draw(p);
    p.glow(0, -8, 9, FIRE[2], 0.35 + 0.1 * Math.sin(ph * TAU * 3));
  }
}
