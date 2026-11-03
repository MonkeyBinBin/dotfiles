// The camp's signpost, planted in the grass at the right of the stage: a wooden post with a lantern hanging
// from its top and three arrow boards nailed on (SOS, Loot, Quest from the top). The boards are left blank: the
// mod writes each one's seal and count on them, so they stay put (BOARDS below is where they are).

import { hex, wrap, TAU } from "../../core/index.js";
import { Grid, shadow } from "../critters/_lib.js";

export const meta = {
  name: "Signpost",
  desc: "A wooden camp signpost in the grass: a flickering lantern on top, three blank arrow boards nailed to the post.",
  tags: ["camp", "prop", "loop"],
  size: [64, 72],
  origin: [20, 64],
  duration: 1.2,
  loop: true,
  fps: 12,
  bg: "ground",
  options: { seed: 1 },
};

// each board's top edge and the x span of its face (the arrow tip goes past x1), in local px
export const BOARDS = { tops: [-42, -31, -20], h: 9, x0: -6, x1: 20 };

const D = meta.duration, g = new Grid(-20, -64, 48, 66);
const C = (...c) => c.map(hex);
const INK = hex("#140c08"), POST = C("#3b2416", "#6a421e", "#8a5a34");
const BOARD = C("#6a421e", "#a8743e", "#c8955a", "#e8b878"), NAIL = hex("#3a3a48");
const LAMP = C("#3a3a48", "#7a8090"), GLASS = C("#c8601a", "#ffb347", "#ffe08a");

export function draw(p, t) {
  const ph = wrap(t, D) / D, flick = 0.5 + 0.5 * Math.sin(ph * TAU * 2) * Math.sin(ph * TAU * 3 + 1);
  g.clear();
  // the post: lit on its left, a darker right edge, a pointed cap
  g.shade(-2, -46, 1.99, -0.01, (x) => POST[x < -1 ? 2 : x < 1 ? 1 : 0]);
  g.set(-1, -47, POST[2]); g.set(0, -47, POST[1]);
  // the lantern on a hook off the cap
  g.line(1, -47, 4, -47, LAMP[1]);
  g.line(4, -47, 4, -46, LAMP[1]);
  g.shade(2, -45, 6.99, -39.01, (x, y) => (y < -44 || y > -40 ? LAMP[0] : x < 3 || x > 6 ? LAMP[0] : GLASS[flick > 0.6 ? 2 : 1]));
  // three arrow boards, pointing right: a plank with a lit top, a darker bottom, nails at the post
  for (const top of BOARDS.tops) {
    const { h, x0, x1 } = BOARDS;
    g.shade(x0, top, x1 + 4.99, top + h - 0.01, (x, y) => {
      const r = y - top, tip = x - x1;
      if (tip > 0 && Math.abs(r - (h - 1) / 2) > (h - 1) / 2 - tip * 1.1) return 0;
      return r < 1 ? BOARD[3] : r > h - 2 ? BOARD[0] : r > h - 3 ? BOARD[1] : BOARD[2];
    });
    g.set(-1, top + 2, NAIL); g.set(-1, top + h - 3, NAIL);
  }
  g.outline(INK);
  g.draw(p);
  // the lantern's warm light, flickering, and its pool on the ground
  p.glow(4.5, -42, 14, GLASS[1], 0.45 + 0.15 * flick);
  p.glow(4.5, -42, 5, GLASS[2], 0.4 + 0.2 * flick);
}

export function drawBack(p) {
  shadow(p, 0, 0.5, 9, 1.6, hex("#05040a"), 0.5);
}
