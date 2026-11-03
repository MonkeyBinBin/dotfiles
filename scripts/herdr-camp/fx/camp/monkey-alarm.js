import { build, grid, floorShadow, loopPhase, C, TAU } from "./_monkey.js";
import { hex, seg } from "../../core/index.js";

export const meta = {
  name: "Monkey alarm",
  desc: "That Monkey jolts awake: eyes wide, fur on end, ears up, hands flapping by his head, a bead of sweat, a hopping red !.",
  tags: ["camp", "character", "alarm", "blocked", "loop"],
  size: [88, 88],
  origin: [44, 78],
  duration: 1.2,
  loop: true,
  fps: 12,
  bg: "dark",
  options: { seed: 1 },
};

const D = meta.duration, g = grid(), BANG = hex("#ff4a3d"), BANG_HI = hex("#ffd23c"), INK = hex("#1a1830");

export function draw(p, t) {
  const ph = loopPhase(t, D), step = Math.floor(ph * D * 12);
  // a little hop every half loop, and a tremble in between
  const hop = Math.max(0, Math.sin(ph * TAU * 2)) ** 2 * 2.5;
  const dx = step % 2 ? 1 : 0;
  const head = build(g, {
    eyes: "wide",
    mouth: "o",
    arms: "flail",
    curl: "spike",
    ears: [2, 2],
    scarf: 1.5 + 1.5 * Math.sin(ph * TAU * 4),
    sweat: seg(ph, 0, 0.9),
    tail: step % 2 ? 2 : -2,
  });
  g.draw(p, 1, dx, -Math.round(hop));
  // a chunky ! beside his head, popping on each hop
  const pop = Math.round(Math.max(0, Math.sin(ph * TAU * 2)) * 2);
  const bx = Math.round(head.hx + 15 + dx), byy = Math.round(head.hy - 17 - pop - hop);
  p.rect(bx - 1, byy - 1, 5, 9, INK);
  p.rect(bx - 1, byy + 9, 5, 5, INK);
  p.rect(bx, byy, 3, 7, BANG);
  p.rect(bx, byy, 3, 2, BANG_HI);
  p.rect(bx, byy + 10, 3, 3, BANG);
  p.glow(bx + 1.5, byy + 6, 10, BANG, 0.35);
}

export function drawBack(p, t) {
  const hop = Math.max(0, Math.sin(loopPhase(t, D) * TAU * 2)) ** 2 * 2.5;
  floorShadow(p, 1, 1 - hop * 0.08);
}
