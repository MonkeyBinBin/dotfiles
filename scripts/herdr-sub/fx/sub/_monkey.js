// "That Monkey" (那個猴子): a chibi sky-blue monkey in a red adventurer's scarf, captain of the sub.
// Round head with a heart-shaped cream face, big shiny eyes, pink inner ears, a curl on top, a curly tail,
// sitting with his feet out. Built the critter way: shaded parts in a Grid, lit from the top-left, outlined
// in each part's own darkest tone so he reads on a dark night. One build(), posed per frame by `st`.

import { hex, wrap, TAU } from "../../core/index.js";
import { Grid, shadow } from "../critters/_lib.js";

const ramp = (...c) => c.map(hex);
export const C = {
  fur: ramp("#2b5f9c", "#4a9ae0", "#7cc8f5", "#c4ecff"),
  face: ramp("#c4875e", "#f0c49a", "#ffe4c4", "#fff6e6"),
  pink: ramp("#c45478", "#f27aa6", "#ffa6c6", "#ffd2e2"),
  scarf: ramp("#7a1622", "#c8303a", "#f0505a", "#ff9090"),
  eye: hex("#1a1830"),
  white: hex("#ffffff"),
  mouth: hex("#6a1e30"),
  sweat: ramp("#2b5f9c", "#8fd8ff", "#e8f8ff"),
};
const darkest = new Map();
for (const r of [C.fur, C.face, C.pink, C.scarf]) for (const c of r) darkest.set(c, r[0]);
for (const c of C.sweat) darkest.set(c, C.sweat[0]);
darkest.set(C.eye, C.eye).set(C.mouth, C.mouth).set(C.white, C.eye);

// light from the top-left: 3 lit, 2 base, 1 shade, 0 deep shade
function tone(nx, ny, soft = false) {
  const l = -0.62 * nx - 0.78 * ny;
  if (soft) return l > 0.45 ? 3 : l > -0.55 ? 2 : 1;
  return l > 0.5 ? 3 : l > -0.3 ? 2 : l > -0.78 ? 1 : 0;
}
const ell = (x, y, cx, cy, rx, ry) => ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2;

/** A pose: what differs from sitting easy. */
export const REST = {
  bob: 0, // body sinks this many px (breathing)
  tilt: 0, // head shifts sideways (dozing off)
  droop: 0, // head sinks onto the chest
  eyes: "open", // open | blink | closed (asleep) | happy (^ ^) | wide (startled)
  mouth: "smile", // smile | sleep | o (gasp) | grin
  arms: "rest", // rest | up (cheering) | flail (panic, hands by the head)
  curl: "curl", // curl | spike (fur on end)
  ears: [0, 0], // each ear raised by px
  tail: 0, // tail tip sways by px
  scarf: 0, // the scarf's end lifts by px
  sweat: 0, // 0 none, else the drop's slide 0..1
};

function arm(g, k, sh, mid, hand, s) {
  g.tube([sh, mid, hand], 1.9 * s, (u, d) => C.fur[d < 0.45 && u < 0.8 ? 3 : 2]);
  g.ellipse(hand[0], hand[1], 1.9 * s, 1.8 * s, (nx, ny) => C.face[tone(nx, ny, true)]);
}

/** Draws the monkey into g, feet at y = 0. */
export function build(g, st0, s = 1) {
  const st = { ...REST, ...st0 }, b = st.bob * s;
  g.clear();
  const hx = st.tilt * s, hy = -24 * s + b + st.droop * s, hrx = 12.5 * s, hry = 11 * s;
  const by = -8 * s + b * 0.5;

  // the tail, behind everything: out to the right and curling up into a loop
  const tw = st.tail * s;
  g.tube([[4 * s, -4 * s], [10 * s, -5 * s + tw * 0.3], [13.5 * s + tw * 0.4, -10 * s], [13 * s + tw, -15 * s], [10.5 * s + tw, -16.5 * s], [9 * s + tw, -14.5 * s], [10.4 * s + tw, -13 * s]],
    1.35 * s, (u, d) => C.fur[d < 0.45 && u < 0.85 ? 3 : 2]);

  // ears: big, round, pink inside
  for (const [i, k] of [-1, 1].entries()) {
    const ex = hx + k * 13.2 * s, ey = hy + 0.5 * s - st.ears[i] * s, er = 4.6 * s;
    g.ellipse(ex, ey, er, er, (nx, ny) => C.fur[tone(nx, ny)]);
    g.ellipse(ex + k * 0.5 * s, ey + 0.3 * s, er * 0.58, er * 0.62, (nx, ny) => C.pink[tone(nx, ny, true)]);
  }

  // body: a round sitting body, cream belly, feet out front showing their soles; arms resting on it
  g.shade(-17 * s, -18 * s, 17 * s, 0, (x, y) => {
    for (const k of [-1, 1]) {
      const fx = k * 7.6 * s, fy = -2.4 * s;
      if (ell(x, y, fx, fy, 2.3 * s, 2.5 * s) <= 1) return C.face[tone((x - fx) / (2.3 * s), (y - fy) / (2.5 * s), true)];
    }
    if (st.arms === "rest") {
      for (const k of [-1, 1]) {
        const px = k * 7 * s, py = by + 2.6 * s;
        if (ell(x, y, px, py, 1.9 * s, 1.8 * s) <= 1) return C.face[tone((x - px) / (1.9 * s), (y - py) / (1.8 * s), true)];
      }
      for (const k of [-1, 1]) {
        const ax = k * 7.2 * s, ay = by - 1 * s, nx = (x - ax) / (2.3 * s), ny = (y - ay) / (3.8 * s);
        if (nx * nx + ny * ny <= 1) return C.fur[nx * k < -0.55 ? 0 : tone(nx, ny)];
      }
    }
    if (y <= 0 && ell(x, y, 0, by, 7.6 * s, 7.8 * s) <= 1) {
      if (ell(x, y, 0, by + 1 * s, 4.4 * s, 5 * s) <= 1) return C.face[tone(x / (4.4 * s), (y - by - s) / (5 * s), true)];
      return C.fur[tone(x / (7.6 * s), (y - by) / (7.8 * s))];
    }
    for (const k of [-1, 1]) {
      const lx = k * 4.8 * s, ly = -2.5 * s;
      if (ell(x, y, lx, ly, 3.8 * s, 2.6 * s) <= 1) return C.fur[Math.min(2, tone((x - lx) / (3.8 * s), (y - ly) / (2.6 * s)))];
    }
    return 0;
  });

  // the head
  g.ellipse(hx, hy, hrx, hry, (nx, ny) => C.fur[tone(nx, ny)]);
  // a heart-shaped face: two lobes round the eyes over a wide muzzle
  g.shade(hx - hrx, hy - hry, hx + hrx, hy + hry, (x, y) => {
    const lobe = [-1, 1].some((k) => ell(x, y, hx + k * 4.4 * s, hy - 1.2 * s, 5 * s, 5.2 * s) <= 1);
    const muzzle = ell(x, y, hx, hy + 4.4 * s, 7.8 * s, 4.9 * s) <= 1;
    if (!lobe && !muzzle) return 0;
    return C.face[tone((x - hx) / hrx, (y - hy - 2 * s) / (hry * 0.8), true)];
  });

  // eyes
  for (const k of [-1, 1]) {
    const ex = hx + k * 4.3 * s, ey = hy - 0.6 * s;
    switch (st.eyes) {
      case "blink":
        g.line(ex - 2 * s, ey + 0.6 * s, ex + 2 * s, ey + 0.6 * s, C.eye);
        g.set(ex - 2.2 * s, ey - 0.2 * s, C.eye);
        g.set(ex + 2.2 * s, ey - 0.2 * s, C.eye);
        break;
      case "closed": // asleep: a soft downward curve
        g.line(ex - 1.5 * s, ey + 1.4 * s, ex + 1.5 * s, ey + 1.4 * s, C.eye);
        g.set(ex - 2.4 * s, ey + 0.4 * s, C.eye);
        g.set(ex + 2.4 * s, ey + 0.4 * s, C.eye);
        break;
      case "happy": // ^ ^
        g.line(ex - 1 * s, ey - 0.8 * s, ex + 1 * s, ey - 0.8 * s, C.eye);
        g.line(ex - 2.4 * s, ey + 0.8 * s, ex - 1.4 * s, ey - 0.2 * s, C.eye);
        g.line(ex + 2.4 * s, ey + 0.8 * s, ex + 1.4 * s, ey - 0.2 * s, C.eye);
        break;
      case "wide": // startled: round whites, tiny pupils
        g.ellipse(ex, ey, 2.7 * s, 3.3 * s, C.eye);
        g.ellipse(ex, ey, 1.8 * s, 2.4 * s, C.white);
        g.set(ex, ey, C.eye);
        g.set(ex, ey + 1, C.eye);
        break;
      default:
        g.ellipse(ex, ey, 2.4 * s, 3.1 * s, C.eye);
        g.shade(ex - 1.6 * s, ey - 2.2 * s, ex - 0.4 * s, ey - 1 * s, () => C.white);
        g.set(ex + 1 * s, ey + 1.2 * s, C.white);
    }
  }

  // blush, nose
  for (const k of [-1, 1]) g.ellipse(hx + k * 8.4 * s, hy + 3.3 * s, 1.9 * s, 1.05 * s, C.pink[st.eyes === "happy" ? 1 : 2]);
  g.set(hx - 0.8 * s, hy + 2.6 * s, C.face[0]);
  g.set(hx + 0.8 * s, hy + 2.6 * s, C.face[0]);

  // mouth
  const my = hy + 4.4 * s;
  const mouthShape = { smile: [2, 2.2, 0], sleep: [1, 1.2, 0.4], o: [1.6, 2.6, -0.6], grin: [3.2, 2.8, 0] }[st.mouth];
  const [mrx, mry, mlift] = mouthShape;
  g.shade(hx - mrx * s - 1, my - mry * s - 1, hx + mrx * s + 1, my + mry * s + 1, (x, y) => {
    const cy = my + mlift * s;
    if (ell(x, y, hx, cy, mrx * s, mry * s) > 1) return 0;
    if (st.mouth !== "o" && y < cy) return 0; // a D-shaped smile, flat on top
    const tongue = y > cy + mry * s * (st.mouth === "o" ? 0.35 : 0.5) && Math.abs(x - hx) < mrx * s * 0.62;
    return tongue && st.mouth !== "sleep" ? C.pink[1] : C.mouth;
  });

  // the scarf under the chin, knotted on the right, its end hanging (lifting when he jolts)
  const cy = hy + hry - 0.6 * s;
  g.ellipse(hx * 0.5, cy, 6.8 * s, 1.8 * s, (nx, ny) => C.scarf[tone(nx, ny)]);
  const lift = st.scarf * s, tailX = st.tail * 0.25 * s;
  g.tube([[hx * 0.5 + 4.4 * s, cy + 0.6 * s], [5.8 * s + lift * 0.6, cy + 2.8 * s - lift * 0.5], [6.4 * s + tailX + lift, cy + 5 * s - lift]],
    1.25 * s, (u, d) => C.scarf[d < 0.4 ? 2 : 1]);

  // raised arms, in front: cheering up and out, or flailing beside the head
  if (st.arms !== "rest") {
    for (const k of [-1, 1]) {
      const sh = [k * 5.6 * s, by - 3.6 * s];
      if (st.arms === "up") arm(g, k, sh, [k * 11 * s, by - 5 * s], [k * 15 * s, by - 9.6 * s], s);
      else arm(g, k, sh, [k * 10.4 * s, by - 4.6 * s], [k * 14.4 * s, by - 8.6 * s], s);
    }
  }

  // on top: a curl of fur, standing on end when startled
  const top = hy - hry + 0.6 * s;
  const curl = st.curl === "spike"
    ? [[hx - 0.3 * s, top + 0.5 * s], [hx, top - 2.8 * s], [hx + 0.6 * s, top - 5.2 * s]]
    : [[hx - 0.5 * s, top + 0.5 * s], [hx, top - 2.6 * s], [hx + 2.2 * s, top - 3.8 * s], [hx + 3.6 * s, top - 2.6 * s], [hx + 2.6 * s, top - 1.4 * s]];
  g.tube(curl, (u) => 1.5 * s * (1 - 0.45 * u), (u, d) => C.fur[d < 0.4 && u < 0.7 ? 3 : 2]);

  // a bead of sweat sliding down the right of the head
  if (st.sweat > 0) {
    const sx = hx + 8 * s, sy = hy - 7.5 * s + st.sweat * 4 * s;
    g.ellipse(sx, sy + 0.8 * s, 2.3 * s, 2.6 * s, C.sweat[0]);
    g.line(sx, sy - 2.6 * s, sx, sy - 1.4 * s, C.sweat[0]);
    g.ellipse(sx, sy + 0.8 * s, 1.5 * s, 1.8 * s, C.sweat[1]);
    g.set(sx, sy - 1.2 * s, C.sweat[1]);
    g.set(sx - 0.6 * s, sy + 0.2 * s, C.sweat[2]);
  }

  // outline each part in its own darkest tone, so he reads on a dark night
  g.outline((x, y, nx, ny) => {
    const inside = g.get(x - Math.sign(nx), y - Math.sign(ny)) || g.get(x - Math.sign(nx), y) || g.get(x, y - Math.sign(ny));
    return darkest.get(inside) || C.fur[0];
  });
  return { hx, hy, hry };
}

/** A Grid big enough for every pose, and the floor shadow. */
export const grid = () => new Grid(-30, -64, 60, 68);
export function floorShadow(p, s = 1, k = 1) {
  shadow(p, 1, 0.5, 15 * s * k, 2.4 * s * k, hex("#05040a"), 0.6 * Math.min(1, k));
}

export const loopPhase = (t, D) => wrap(t, D) / D;
export { TAU };
