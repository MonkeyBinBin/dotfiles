import { build, grid, floorShadow, loopPhase, TAU } from "./_monkey.js";
import { lnoise } from "../critters/_lib.js";

export const meta = {
  name: "Monkey idle",
  desc: "That Monkey sits by the fire doing nothing much: slow breaths, a blink, his tail swaying, an ear twitch.",
  tags: ["camp", "character", "idle", "loop"],
  size: [72, 72],
  origin: [36, 64],
  duration: 2.4,
  loop: true,
  fps: 12,
  bg: "dark",
  options: { seed: 1 },
};

const D = meta.duration, g = grid();

export function draw(p, t, o) {
  const ph = loopPhase(t, D);
  build(g, {
    bob: Math.sin(ph * TAU * 2) > 0.35 ? 1 : 0,
    eyes: ph > 0.68 && ph < 0.73 ? "blink" : "open",
    tail: 1.4 * lnoise(t, D, 2, 0.7, o.seed),
    ears: [0, ph > 0.3 && ph < 0.36 ? 1 : 0],
  });
  g.draw(p);
}

export function drawBack(p) {
  floorShadow(p);
}
