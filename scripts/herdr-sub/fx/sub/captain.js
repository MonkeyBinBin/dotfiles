// That Monkey as the sub's captain: up through the hatch of his surfaced submarine, in a white captain's cap,
// the periscope raised beside him, the hull riding the waterline. Moods (`mood`):
//   idle   watching the sea, blinking        alarm  a contact in trouble: wide eyes, flailing, a red !
//   happy  a sub surfaced with loot: cheering sleep  every crew busy: he dozes off in the hatch, Zs rising
// Origin: the waterline under the conning tower.

import { hex, seg, cycle } from "../../core/index.js";
import { build, grid, loopPhase, C, TAU } from "./_monkey.js";
import { lnoise } from "../critters/_lib.js";

export const meta = {
  name: "Sub captain",
  desc: "That Monkey up through his submarine's hatch in a captain's cap, periscope raised: idle, alarm, happy or asleep.",
  tags: ["sub", "character", "loop"],
  size: [108, 90],
  origin: [50, 82],
  duration: 2.4,
  loop: true,
  fps: 12,
  bg: "dark",
  options: { mood: "idle", seed: 1 },
};

const D = meta.duration, g = grid();
const R = (...c) => c.map(hex);
const HULL = R("#22484a", "#3c6a6c", "#5a8a8c", "#a8ccc8"), INK = hex("#071214");
const BRASS = R("#4a3410", "#b8903e", "#f0d07a"), GLASS = hex("#7ad8e8");
const CAP = R("#b8c4c4", "#e8ece8", "#ffffff"), NAVY = hex("#1c2c50"), PEAK = hex("#141a24"), GOLD = hex("#f0d07a");
const FOAM = hex("#d8f4ff"), WAKE = hex("#2a88aa"), BANG = hex("#ff4a3d"), BANG_HI = hex("#ffd23c");

const POSES = {
  idle: (ph, t, o) => ({ bob: Math.sin(ph * TAU * 2) > 0.35 ? 1 : 0, eyes: ph > 0.68 && ph < 0.73 ? "blink" : "open", tail: 1.4 * lnoise(t, D, 2, 0.7, o.seed), ears: [0, ph > 0.3 && ph < 0.36 ? 1 : 0] }),
  sleep: (ph) => ({ bob: Math.sin(ph * TAU) > 0 ? 1 : 0, tilt: 1.5, droop: 1.5, eyes: "closed", mouth: "sleep", ears: [-1, -1] }),
  alarm: (ph) => ({ eyes: "wide", mouth: "o", arms: "flail", curl: "spike", ears: [2, 2], scarf: 1.5 + 1.5 * Math.sin(ph * TAU * 8), sweat: seg((ph * 2) % 1, 0, 0.9) }),
  happy: (ph) => ({ eyes: "happy", mouth: "grin", arms: "up", ears: [1, 1], scarf: Math.max(0, Math.sin(ph * TAU * 2)) * 3 }),
};

// the hull at the waterline: a long low whale-back, its deck rivets, wake water lapping along it
function hull(p, ph) {
  const bob = Math.round(Math.sin(ph * TAU) * 0.6);
  p.shade(-40, -7, 44, 3, (x, y, o) => {
    const dx = (x - 2) / 42, dy = (y - 3 - bob) / 9;
    if (dx * dx + dy * dy > 1 || y > 1) return;
    o.c = y < -4 + bob ? HULL[3] : y < -2 + bob ? HULL[2] : HULL[1];
  });
  for (let x = -30; x < 36; x += 6) p.px(x, -3 + bob, HULL[3]);
  for (let x = -42; x < 47; x++) {
    const y = 1 + Math.round(Math.sin(x * 0.35 + ph * TAU * 2));
    p.px(x, y, WAKE);
    if ((x + Math.floor(ph * 12)) % 6 === 0) p.px(x, y - 1, FOAM);
  }
  return bob;
}

// the conning tower he stands in, its brass hatch rim, and the periscope to his right
function tower(p, bob) {
  p.rect(-13, -21 + bob, 24, 16, HULL[1]);
  p.rect(-13, -21 + bob, 24, 2, HULL[2]);
  p.rect(-13, -21 + bob, 2, 16, HULL[2]);
  p.rect(9, -21 + bob, 2, 16, HULL[0]);
  for (const y of [-16, -11]) p.rect(-9, y + bob, 15, 1, HULL[0]);
  p.rect(-15, -23 + bob, 28, 3, BRASS[1]);
  p.rect(-15, -23 + bob, 28, 1, BRASS[2]);
  p.rect(-15, -21 + bob, 28, 1, BRASS[0]);
  // the periscope: a mast with a brass collar, its head looking out to the left
  p.rect(24, -52 + bob, 3, 47, HULL[2]);
  p.rect(24, -52 + bob, 1, 47, HULL[3]);
  p.rect(23, -30 + bob, 5, 2, BRASS[1]);
  p.rect(17, -56 + bob, 10, 5, HULL[2]);
  p.rect(17, -56 + bob, 10, 1, HULL[3]);
  p.rect(16, -55 + bob, 1, 3, GLASS);
}

// the cap: white crown, navy band, a gold badge, a dark peak over the eyes
function cap(p, hx, top) {
  const x0 = Math.round(hx) - 10, y0 = Math.round(top) - 4;
  [[3, 17], [1, 19], [0, 20], [0, 20]].forEach(([a, b], y) => { for (let x = a; x <= b; x++) p.px(x0 + x, y0 + y, CAP[x < 7 ? 2 : x < 15 ? 1 : 0]); });
  p.rect(x0, y0 + 4, 21, 2, NAVY);
  p.px(x0 + 10, y0 + 2, GOLD); p.px(x0 + 11, y0 + 2, GOLD); p.px(x0 + 10, y0 + 3, GOLD);
  p.rect(x0 + 2, y0 + 6, 18, 1, PEAK);
  // outline
  for (let x = 2; x <= 18; x++) p.px(x0 + x, y0 - 1, INK);
  p.px(x0, y0, INK); p.px(x0 - 1, y0 + 1, INK); p.px(x0 + 20, y0, INK); p.px(x0 + 21, y0 + 1, INK);
  for (let y = 2; y <= 6; y++) { p.px(x0 - 1, y0 + y, INK); p.px(x0 + 21, y0 + y, INK); }
}

export function draw(p, t, o) {
  const ph = loopPhase(t, D), mood = o.mood;
  const hop = mood === "happy" ? Math.round(Math.max(0, Math.sin(ph * TAU * 2)) * 3) : mood === "alarm" && Math.floor(ph * 24) % 2 ? 1 : 0;
  const head = build(g, POSES[mood](ph, t, o));
  const bob = Math.round(Math.sin(ph * TAU) * 0.6);
  // he stands down in the tower: feet 12 px below its rim
  g.draw(p, 1, -1, -10 + bob - hop);
  cap(p, head.hx - 1, head.hy - 10 + bob - hop - 11 + 1);
  tower(p, bob);
  hull(p, ph);
  if (mood === "alarm") {
    const pop = Math.round(Math.max(0, Math.sin(ph * TAU * 4)) * 2), bx = -26, by = -54 - pop;
    p.rect(bx - 1, by - 1, 5, 9, INK); p.rect(bx - 1, by + 9, 5, 5, INK);
    p.rect(bx, by, 3, 7, BANG); p.rect(bx, by, 3, 2, BANG_HI); p.rect(bx, by + 10, 3, 3, BANG);
  }
  if (mood === "sleep")
    cycle(t, D, 3, o.seed, D * 0.8, (age, L, r, i) => {
      const k = age / L;
      if (k > 0.9) return;
      p.text("Z", head.hx - 30 - k * 6 + Math.sin(age * 3 + i) * 1.5, head.hy - 18 - k * 16, k < 0.6 ? C.fur[3] : C.fur[2], { font: i === 1 ? "big" : "mini", outline: C.fur[0] });
    });
}
