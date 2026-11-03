import { build, grid, floorShadow, loopPhase, C, TAU } from "./_monkey.js";
import { hex, sparkle } from "../../core/index.js";

export const meta = {
  name: "Monkey happy",
  desc: "That Monkey cheers: hops with both arms up, eyes squeezed into happy arcs, a big grin, tail wagging, sparkles twinkling round him.",
  tags: ["camp", "character", "happy", "done", "loop"],
  size: [88, 88],
  origin: [44, 80],
  duration: 1.2,
  loop: true,
  fps: 12,
  bg: "dark",
  options: { seed: 1 },
};

const D = meta.duration, g = grid(), GOLD = [hex("#ffd23c"), hex("#fff6c0")];

// in the air for the first 60% of the loop, a squash on landing
const air = (ph) => (ph < 0.6 ? Math.sin((ph / 0.6) * Math.PI) : 0);

export function draw(p, t) {
  const ph = loopPhase(t, D), h = air(ph), land = ph > 0.6 && ph < 0.75;
  const wag = Math.sin(ph * TAU * 3) * 2.5;
  build(g, {
    bob: land ? 1 : 0,
    eyes: "happy",
    mouth: "grin",
    arms: "up",
    ears: h > 0.3 ? [1, 1] : [0, 0],
    scarf: h * 3,
    tail: wag,
  });
  g.draw(p, 1, 0, -Math.round(h * 7));
  // sparkles twinkling round him, each on its own beat
  const spots = [[-17, -38], [18, -42], [-21, -16], [22, -20]];
  spots.forEach(([x, y], i) => {
    const k = Math.max(0, Math.sin((ph + i * 0.27) * TAU));
    if (k > 0.15) sparkle(p, x, y, Math.round(1 + k * 2.5), GOLD[0], GOLD[1], 0.5 * k);
  });
}

export function drawBack(p, t) {
  floorShadow(p, 1, 1 - air(loopPhase(t, D)) * 0.4);
}
