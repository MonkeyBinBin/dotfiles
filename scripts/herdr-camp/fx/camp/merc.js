// A camp mercenary: one of the little plush dolls That Monkey sends out to do the work, marching right with a
// bindle over his shoulder. One per working agent; `palette` (dark to light, 4 colors) tells them apart.

import { hex, wrap, TAU } from "../../core/index.js";
import { Grid, shadow } from "../critters/_lib.js";

export const meta = {
  name: "Mercenary",
  desc: "A little plush mercenary marches to the right, bobbing on each step, a bindle over his shoulder swinging.",
  tags: ["camp", "character", "walk", "loop"],
  size: [40, 36],
  origin: [20, 30],
  duration: 0.6,
  loop: true,
  fps: 12,
  bg: "dark",
  options: { palette: ["#3c2a7a", "#6a4fc8", "#a98cff", "#d8ccff"], seed: 1 },
};

const D = meta.duration, g = new Grid(-14, -28, 28, 30);
const INK = hex("#1a1830"), CREAM = [hex("#c4875e"), hex("#ffe4c4")], STICK = hex("#8a5a34"), BUNDLE = [hex("#7a1622"), hex("#f0505a")], PINK = hex("#ffa6c6");
const ell = (x, y, cx, cy, rx, ry) => ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2;
const tone = (nx, ny) => { const l = -0.62 * nx - 0.78 * ny; return l > 0.5 ? 3 : l > -0.35 ? 2 : 1; };

export function draw(p, t, o) {
  const C = o.palette.map(hex), ph = wrap(t, D) / D, step = Math.sin(ph * TAU);
  const bob = Math.abs(step) > 0.5 ? 0 : 1;
  g.clear();
  // the bindle: a stick over the back shoulder, a red bundle swinging at its end
  const sw = Math.round(step);
  g.line(-1, -9 + bob, -6, -15 + bob, STICK);
  g.ellipse(-7 + sw * 0.5, -16 + bob, 2.2, 2, (nx, ny) => BUNDLE[tone(nx, ny) > 1 ? 1 : 0]);
  // legs, stepping
  for (const k of [-1, 1]) {
    const lx = k * 1.6 + step * k * 1.4;
    g.ellipse(lx, -1.4, 1.5, 1.6, (nx, ny) => C[tone(nx, ny) - 1]);
  }
  // body and head
  g.ellipse(0, -6 + bob, 3.6, 3.6, (nx, ny) => C[tone(nx, ny)]);
  for (const ex of [-3.4, 3.8]) g.ellipse(ex, -18.5 + bob, 1.8, 1.8, (nx, ny) => C[tone(nx, ny)]);
  g.ellipse(0.5, -13.5 + bob, 5.4, 5, (nx, ny) => C[tone(nx, ny)]);
  // a cream muzzle on the side he faces, button eyes, a blush
  g.ellipse(3, -12 + bob, 2.6, 2, CREAM[1]);
  g.set(2, -15 + bob, INK);
  g.set(4.6, -15 + bob, INK);
  g.set(5, -12.6 + bob, INK);
  g.set(-0.4, -12.6 + bob, PINK);
  // a stitch across the tummy
  g.set(-1, -6 + bob, C[0]);
  g.set(1, -6 + bob, C[0]);
  g.outline((x, y, nx, ny) => (ny < 0 ? C[0] : INK));
  g.draw(p);
}

export function drawBack(p) {
  shadow(p, 0, 0.5, 6, 1.4, hex("#05040a"), 0.5);
}
