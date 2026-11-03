// Effects round a mini-sub in the sea column (`kind`). Origin at the sub's center unless noted.
//   pressure  under too long: an amber warning ring of dashes turning round it, bubbles leaking from a crack
//   splash    surfacing: a burst of white water thrown up from the waterline, drops falling back (origin: the
//             waterline under the sub)
//   flare     surfacing with loot: a signal flare shooting up and bursting into gold sparks (origin: launch point)

import { hex, wrap, TAU } from "../../core/index.js";

export const meta = {
  name: "Sub alert",
  desc: "Effects round a mini-sub: a turning amber pressure-warning ring with leaking bubbles, a surfacing splash, a gold signal flare.",
  tags: ["sub", "fx", "loop"],
  size: [48, 64],
  origin: [24, 40],
  duration: 1.2,
  loop: true,
  fps: 12,
  bg: "dark",
  options: { kind: "pressure" },
};

const D = meta.duration;
const AMBER = ["#7a4a10", "#ffb055", "#ffe0a0"].map(hex), BUBBLE = [hex("#2a88aa"), hex("#8ad8ff"), hex("#e8fbff")];
const FOAM = [hex("#8ad8ff"), hex("#d8f4ff"), hex("#ffffff")], GOLD = ["#c8801c", "#ffd23c", "#fff6c0"].map(hex);

function pressure(p, ph) {
  // the ring: 16 bright dashes turning round the sub, pulsing
  const pulse = Math.sin(ph * TAU * 2) > 0;
  for (let i = 0; i < 16; i++) {
    if (i % 2) continue;
    for (let j = 0; j < 3; j++) {
      const a = ((i + j * 0.33) / 16) * TAU + ph * TAU / 2;
      p.px(Math.cos(a) * 16, Math.sin(a) * 11, j === 1 && pulse ? AMBER[2] : AMBER[1]);
    }
  }
  p.glow(0, 0, 20, AMBER[1], 0.18 + 0.1 * Math.sin(ph * TAU * 2));
  // bubbles leaking from a crack on the top of the hull, wobbling up
  for (let i = 0; i < 4; i++) {
    const k = (ph + i / 4) % 1, x = 3 + Math.sin((k + i) * TAU) * 1.5, y = -4 - k * 16;
    if (k < 0.15) continue;
    if (i % 2) p.px(x, y, BUBBLE[1]);
    else { p.ring(x, y, 1.6, 1, BUBBLE[1]); p.px(x - 0.5, y - 0.5, BUBBLE[2]); }
  }
  // the crack, flashing
  if (Math.floor(ph * 6) % 2) { p.px(2, -4, AMBER[2]); p.px(3, -5, AMBER[2]); p.px(4, -4, AMBER[2]); }
}

function splash(p, ph) {
  // a column of white water shoots up and falls, drops arcing out to both sides
  const h = Math.sin(Math.min(1, ph / 0.6) * Math.PI) * 18;
  for (let y = 0; y < h; y++) {
    const w = Math.max(1, 4 - y / 6);
    for (let x = -w; x <= w; x++) p.px(x, -y, FOAM[y > h - 3 ? 2 : Math.abs(x) > w - 1 ? 0 : 1]);
  }
  for (let i = 0; i < 8; i++) {
    const side = i % 2 ? 1 : -1, v = 6 + (i % 4) * 2.5, k = ph * 1.4;
    const x = side * (3 + v * k * 1.2), y = -(v * 2 * k - 14 * k * k * 1.6);
    if (y > 1) continue;
    p.px(x, y, FOAM[i % 3]);
  }
  // the ring of foam on the water
  const r = 4 + ph * 14;
  for (let x = -r; x <= r; x += 2) if (Math.abs(x) > r - 5) p.px(x, 1, FOAM[1]);
}

function flare(p, ph) {
  if (ph < 0.35) {
    // the streak going up, a red-gold head and a fading trail
    const y = -ph / 0.35 * 32;
    for (let i = 0; i < 8; i++) p.px(0, y + i * 1.5, i < 2 ? GOLD[2] : i < 5 ? GOLD[1] : GOLD[0]);
    p.glow(0, y, 6, GOLD[1], 0.5);
    return;
  }
  // the burst: sparks flying out and falling, twinkling out
  const k = (ph - 0.35) / 0.65;
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * TAU, d = 2 + k * 13, x = Math.cos(a) * d, y = -32 + Math.sin(a) * d + k * k * 8;
    if (k > 0.7 && (i + Math.floor(ph * 30)) % 2) continue;
    p.px(x, y, GOLD[k < 0.4 ? 2 : 1]);
    if (k < 0.5) p.px(x * 0.8, y + (Math.sin(a) * d) * -0.2, GOLD[0]);
  }
  p.glow(0, -32, 16 * (1 - k), GOLD[1], 0.45 * (1 - k));
}

export function draw(p, t, o) {
  const ph = wrap(t, D) / D;
  ({ pressure, splash, flare })[o.kind](p, ph);
}
