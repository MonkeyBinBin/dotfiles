import { build, grid, floorShadow, loopPhase, C, TAU } from "./_monkey.js";
import { lnoise } from "../critters/_lib.js";
import { cycle, seg } from "../../core/index.js";

export const meta = {
  name: "Monkey sleep",
  desc: "That Monkey dozes off sitting up: head nodding to one side, slow deep breaths, a nose bubble swelling and popping, Zs drifting up.",
  tags: ["camp", "character", "sleep", "loop"],
  size: [80, 80],
  origin: [36, 72],
  duration: 3.2,
  loop: true,
  fps: 12,
  bg: "dark",
  options: { seed: 1 },
};

const D = meta.duration, g = grid();

export function draw(p, t, o) {
  const ph = loopPhase(t, D), breath = Math.sin(ph * TAU);
  const head = build(g, {
    bob: breath > 0 ? 1 : 0,
    tilt: 1.5,
    droop: 1.5,
    eyes: "closed",
    mouth: "sleep",
    ears: [-1, -1],
    tail: 0.8 * lnoise(t, D, 1, 0.2, o.seed),
  });
  g.draw(p);
  // a nose bubble: swells with the breath, then pops into a few flecks
  const bx = head.hx - 3, by = head.hy + 4;
  if (ph < 0.8) {
    const r = 1 + 3.6 * seg(ph, 0.05, 0.8), cx = bx - r * 0.7, cy = by + r * 0.3;
    p.disc(cx, cy, r, C.sweat[1], 0.35);
    p.ring(cx, cy, r, 1, C.sweat[2], 1);
    p.px(cx - r * 0.45, cy - r * 0.5, C.white);
  } else if (ph < 0.88) {
    const k = seg(ph, 0.8, 0.88);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU + 0.4, d = 3 + 3 * k;
      p.px(bx - 3.2 + Math.cos(a) * d, by + 1.4 + Math.sin(a) * d, C.sweat[2]);
    }
  }
  // Zs rise from above his head, drifting right; solid pixels, dimming then gone
  cycle(t, D, 3, o.seed, D * 0.8, (age, L, r, i) => {
    const k = age / L;
    if (k > 0.9) return;
    const x = head.hx + 10 + k * 8 + Math.sin(age * 3 + i) * 1.5, y = head.hy - 10 - k * 18;
    p.text("Z", x, y, k < 0.6 ? C.fur[3] : C.fur[2], { font: i === 1 ? "big" : "mini", outline: C.fur[0] });
  });
}

export function drawBack(p) {
  floorShadow(p);
}
