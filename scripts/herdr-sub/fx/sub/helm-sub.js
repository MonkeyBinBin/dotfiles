// A chubby little submarine at pixelfx's own scale: a hull lit from the top left in hard ramp steps, rim light, rivets,
// a turning propeller, a bow lamp throwing a beam, shaded bubbles. A face in four moods: dive, sos, surfaced, idle. Faces right; the
// bake mirrors it. `compact` fits the pane header (48 px): a lower tower and periscope, a shorter beam, nothing that moves one way
// only, as kit/sprite.js plays a sheet there and back.
import { at, clamp, cycle, fit, hex, ramp, sparkle, TAU, WHITE } from "../../core/index.js";
import { bubble } from "../critters/_lib.js";

export const meta = {
  name: "Helm sub",
  desc: "A chubby little submarine in three moods: bobbing along under its bubbles, flashing red in alarm, riding the surface with a chest of loot.",
  tags: ["submarine", "ui", "critter", "underwater", "loop"],
  size: [120, 80],
  origin: [60, 68],
  duration: 3,
  loop: true,
  fps: 12,
  bg: "dark",
  options: {
    palette: ["#2c0f12", "#5e1f16", "#a03a1c", "#d9602a", "#f58a3f", "#ffb066", "#ffdcae"],
    state: "dive",
    seed: 3,
  },
};

const D = meta.duration;
const CX = 2, CY = -22, RX = 31, RY = 18; // the hull
const INK = hex("#160d14"), WATER = ramp(["#081830", "#0e2e5a", "#14508c", "#1c76bc", "#36a2e0", "#78ccf4", "#c4ecff", "#ffffff"]);
const METAL = ramp(["#0c0e14", "#1c2230", "#2e3648", "#4a5468", "#6e7a90", "#9aa6ba", "#d0d8e6"]);
const BRASS = ramp(["#2a1806", "#5e3a0c", "#9a6a14", "#d6a02a", "#f6d264", "#fff2b8"]);
const REDS = ramp(["#2a0810", "#5e0f16", "#a01a1c", "#d92f2a", "#f5523f", "#ff8a70", "#ffc4b0"]);
const GLASS = ramp(["#06202e", "#0c3c52", "#14627e", "#2a94ac", "#6cd2dc", "#c4f6f4"]);
const HOT = ramp(["#2c0d12", "#5e1a16", "#a0301c", "#d9482a", "#f06a3a", "#ff9a68", "#ffd0b0"]);
const RED = hex("#ff3b30"), PINK = hex("#ff7f8a"), SMILE = hex("#5e1f16"), AMBER = hex("#ffe08a");

// Hull as a squashed superellipse: how far out a point is (1 is the edge).
const hullD = (dx, dy) => (Math.abs(dx / RX) ** 2.3 + Math.abs(dy / RY) ** 2.3) ** (1 / 2.3);

function drawHull(p, C, ox, oy, compact) {
  // Tail fins behind the hull.
  fin(p, C, ox, oy, -1);
  fin(p, C, ox, oy, 1);
  // Conning tower, then the hull over its foot.
  const tx = ox + 6, ty = oy - (compact ? 14 : 18);
  p.shade(tx - 13, ty - 12, tx + 13, ty + 6, (x, y, out) => {
    const dx = (x - tx) / 12, dy = (y - ty) / 10, inside = Math.abs(dx) ** 3 + Math.abs(dy) ** 3;
    if (inside > 1.12) return;
    if (inside > 0.82) { out.c = INK; return; }
    out.c = at(C, clamp(0.62 - dx * 0.34 - dy * 0.3));
  });
  // Hatch rim on the tower's top.
  p.rect(tx - 5, ty - 11, 10, 1, METAL[5]);
  p.rect(tx - 5, ty - 10, 10, 1, METAL[3]);
  // Hull body, lit from the top left.
  p.shade(ox - RX - 2, oy - RY - 2, ox + RX + 2, oy + RY + 2, (x, y, out) => {
    const dx = x - ox, dy = y - oy, d = hullD(dx, dy);
    if (d > 1) return;
    if (d > 0.94) { out.c = INK; return; }
    const nx = dx / RX, ny = dy / RY, belly = clamp((ny - 0.42) * 2.2);
    const l = 0.56 - nx * 0.2 - ny * 0.44 - belly * 0.22;
    out.c = at(C, clamp(l));
  });
  // Rim light along the top left, a band and its rivets along the belly.
  for (let a = Math.PI * 1.08; a < Math.PI * 1.62; a += 0.018) {
    const x = ox + Math.cos(a) * (RX - 4), y = oy + Math.sin(a) * (RY - 3.5);
    p.px(x, y, C[6]);
  }
  for (let x = -24; x <= 24; x++) {
    const y = oy + 8 + (Math.abs(x) / 24) ** 2 * -1.5;
    p.px(ox + x, y, C[1]);
    p.px(ox + x, y + 1, C[3]);
    if (x % 6 === 0) p.px(ox + x, y + 3, C[6]);
  }
  // Panel seam behind the face.
  for (let y = -13; y <= 7; y++) p.px(ox - 12 + Math.round((y / 13) ** 2), oy + y, C[2]);
}

function fin(p, C, ox, oy, dir) {
  const x = ox - RX + 3, y = oy + dir * 3;
  p.poly([[x + 7, y], [x - 7, y + dir * 13], [x - 11, y + dir * 13], [x - 6, y]], INK);
  p.poly([[x + 5, y + dir], [x - 6, y + dir * 11], [x - 8, y + dir * 11], [x - 4, y + dir]], C[dir < 0 ? 3 : 2]);
}

function periscope(p, ox, oy, ph, compact) {
  const raise = compact ? 0 : Math.round(Math.sin(ph * TAU)), x = ox + 11, top = oy - (compact ? 26 : 37) + raise;
  p.rect(x - 1, top, 4, oy - 26 - top, INK);
  p.rect(x, top, 1, oy - 26 - top, METAL[5]);
  p.rect(x + 1, top, 1, oy - 26 - top, METAL[3]);
  p.rect(x - 1, top - 2, 9, 5, INK);
  p.rect(x, top - 1, 7, 3, METAL[4]);
  p.rect(x, top - 1, 7, 1, METAL[6]);
  p.rect(x + 6, top - 1, 1, 3, GLASS[4]);
  p.px(x + 6, top - 1, WHITE);
}

function propeller(p, ox, oy, ph) {
  const x = ox - RX - 3;
  p.rect(x, oy - 1, 5, 3, INK);
  p.rect(x + 1, oy, 4, 1, METAL[4]);
  // Blade width runs through a sine: a real turn, with a faint blur disc behind it. The bake keeps 12 frames of a loop, and
  // 6 turns would catch the blades edge-on in every one of them.
  p.disc(x - 1, oy, 9, METAL[6], 0.07);
  for (const shift of [0, 0.5]) {
    const s = Math.sin((ph * 5 + shift) * TAU), h = Math.round(s * 9);
    p.line(x - 1, oy, x - 1, oy + h, shift ? METAL[3] : METAL[6]);
    p.line(x - 2, oy, x - 2, oy + Math.round(h * 0.8), METAL[2]);
  }
  p.rect(x - 3, oy - 1, 3, 3, BRASS[3]);
  p.px(x - 3, oy - 1, BRASS[5]);
}

function bowLamp(p, ox, oy, ph, on, reach = 24) {
  const x = ox + RX - 3, y = oy + 3;
  p.rect(x - 1, y - 2, 4, 5, INK);
  p.rect(x, y - 1, 2, 3, on ? AMBER : METAL[3]);
  if (!on) return;
  const k = 0.8 + 0.2 * Math.sin(ph * TAU * 3);
  // A cone of light fanning out ahead, thinning with distance.
  p.shade(x + 2, y - 14, x + 2 + reach, y + 14, (px, py, out) => {
    const dx = px - x - 2, dy = py - y, w = dx * 0.5 + 1;
    if (Math.abs(dy) > w) return;
    out.c = AMBER; out.a = 0; out.l = AMBER;
    out.k = 0.13 * k * (1 - dx / reach) * (1 - Math.abs(dy) / w);
  });
  p.glow(x + 2, y, 5, AMBER, 0.5 * k);
}

// Porthole: a brass ring round tinted glass with a reflection streak.
function porthole(p, x, y, r, inner) {
  p.circle(x, y, r + 1.4, INK);
  p.shade(x - r - 1, y - r - 1, x + r + 1, y + r + 1, (px, py, out) => {
    const dx = px - x, dy = py - y, d = Math.hypot(dx, dy);
    if (d > r + 0.5) return;
    if (d > r - 1.3) { out.c = at(BRASS, clamp(0.5 - (dx + dy) / (r * 2.6))); return; }
    out.c = inner ? inner(dx, dy, d) : at(GLASS, clamp(0.45 - (dx + dy * 1.4) / (r * 2.2)));
  });
}
const glare = (p, x, y, r) => {
  for (let i = 0; i < r; i++) p.px(x - r * 0.5 + i * 0.5, y - r * 0.5 + i * 0.1 - 0.5, GLASS[5]);
  p.px(x + r * 0.4, y + r * 0.45, GLASS[4]);
};

function face(p, ox, oy, state, ph, flush) {
  const fx = ox + 10, fy = oy - 2;
  const cheek = flush ? hex("#ffc0b0") : PINK;
  for (const dx of [-11, 11]) {
    p.blend(fx + dx, fy + 5, cheek, 0.8); p.blend(fx + dx + 1, fy + 5, cheek, 0.8);
    p.blend(fx + dx - 1, fy + 5, cheek, 0.45); p.blend(fx + dx + 2, fy + 5, cheek, 0.45);
  }
  if (state === "sos") {
    // > < squeezed shut, a wobbling open mouth.
    for (const [x, dir] of [[fx - 8, 1], [fx + 8, -1]]) {
      for (let i = 0; i < 4; i++) {
        p.px(x + dir * i, fy - 3 + i, INK); p.px(x + dir * i, fy + 3 - i, INK);
        p.px(x + dir * i, fy - 4 + i, INK); p.px(x + dir * i, fy + 4 - i, INK);
      }
    }
    const open = Math.round(ph * 12) % 2 ? 3 : 2;
    p.ellipse(fx, fy + 6, 2.5, open, INK);
    p.px(fx, fy + 6 + open - 1, PINK);
    return;
  }
  if (state === "idle") {
    // Dozing: eyes shut in soft curves, a small content mouth.
    for (const x of [fx - 8, fx + 8]) {
      for (let i = -3; i <= 3; i++) p.px(x + i, fy + (Math.abs(i) < 2 ? 1 : 0), INK);
    }
    p.line(fx - 1, fy + 7, fx + 1, fy + 7, SMILE);
    return;
  }
  if (state === "surfaced") {
    // ^ ^ with a wide open smile.
    for (const x of [fx - 8, fx + 8]) {
      for (let i = -3; i <= 3; i++) {
        const y = fy - 2 + Math.abs(i);
        p.px(x + i, y, INK); p.px(x + i, y + 1, INK);
      }
    }
    p.shade(fx - 4, fy + 3, fx + 4, fy + 8, (x, y, out) => {
      const dx = x - fx, dy = y - fy - 3;
      if (dy > 0 && dx * dx / 16 + dy * dy / 16 <= 1) out.c = dy > 2.6 ? PINK : SMILE;
    });
    return;
  }
  // Big round eyes that look around, a soft blink at one point in the loop, a tiny smile.
  const blink = ph > 0.7 && ph < 0.74, look = Math.round(Math.sin(ph * TAU) * 1);
  for (const x of [fx - 8, fx + 8]) {
    if (blink) { p.rect(x - 3, fy + 1, 7, 1, INK); continue; }
    p.ellipse(x + 0.5, fy, 3.6, 4.6, INK);
    p.rect(x - 2 + look, fy - 3, 3, 3, WHITE);
    p.px(x + 2 + look, fy + 2, GLASS[4]);
  }
  p.line(fx - 2, fy + 6, fx - 1, fy + 7, SMILE);
  p.line(fx - 1, fy + 7, fx + 1, fy + 7, SMILE);
  p.line(fx + 1, fy + 7, fx + 2, fy + 6, SMILE);
}

function bubbles(p, t, ox, oy) {
  cycle(t, D, 9, 21, (g) => g.range(1.8, 2.8), (age, life, r, i) => {
    const r0 = i % 3 === 0 ? r.range(1.6, 2.4) : r.range(0.5, 1.1), vy = 12 + 6 * r0, side = r.range(-5, 5), ph0 = r.range(0, TAU);
    const y = oy + side - vy * age, x = ox - RX - 9 - (i % 4) * 2 - age * 5 + Math.sin(age * 3.5 + ph0) * 1.3;
    if (y > -52 && x > -55) bubble(p, x, y, r0 * (1 + age * 0.12), [WATER[7], WATER[6], WATER[5], WATER[3]]);
  });
}

function alarm(p, t, ox, oy, ph, compact) {
  // A beacon turning on the tower, its beam sweeping and the water pulsing red.
  const bx = ox + 2, by = oy - (compact ? 26 : 31), on = Math.sin(ph * TAU * 4);
  p.rect(bx - 2, by + 1, 5, 2, METAL[2]);
  p.rect(bx - 1, by - 2, 3, 3, on > 0 ? RED : REDS[2]);
  p.px(bx - 1, by - 2, on > 0 ? WHITE : REDS[4]);
  if (on > 0) p.glow(bx, by - 1, 10, RED, 0.6);
  p.glow(ox, oy, 40, RED, 0.1 + 0.14 * Math.max(0, on));
  // A warning mark hopping over the bow.
  const hop = Math.abs(Math.sin(ph * TAU * 3)) * 3, mx = ox + (compact ? 37 : 26), my = oy - (compact ? 14 : 25) - Math.round(hop);
  p.rect(mx - 2, my - 8, 5, 8, INK); p.rect(mx - 2, my + 1, 5, 4, INK);
  p.rect(mx - 1, my - 7, 3, 6, RED); p.rect(mx - 1, my + 2, 3, 2, RED);
  p.rect(mx - 1, my - 7, 1, 3, hex("#ffc4b0"));
  p.glow(mx, my - 2, 8, RED, 0.3);
  if (compact) return;
  // Sweat and hissing steam.
  cycle(t, D, 10, 11, (g) => g.range(0.5, 0.9), (age, life, r) => {
    const a = r.range(-2.6, -0.6), sp = r.range(14, 28), u = age / life;
    const x = ox + r.range(-RX + 10, RX - 6) + Math.cos(a) * sp * age, y = oy - RY + Math.sin(a) * sp * age + 26 * age * age;
    p.px(x, y, u < 0.5 ? WATER[6] : WATER[4]);
  });
}

const WL = -8; // the waterline
const waterTop = (x, ph) => WL + Math.round(Math.sin(x * 0.17 + ph * TAU) + Math.sin(x * 0.06 - ph * TAU * 2) * 0.8);

function surface(p, t, ph, cx, half) {
  // In front of the hull: a lit crest, foam, deepening in hard steps, the patch rounding off at its sides and bottom.
  p.shade(cx - half, WL - 3, cx + half, 10, (x, y, out) => {
    const d = y - waterTop(x, ph);
    if (d < 0 || d > 16) return;
    // Open water: it thins away at the sides and below rather than ending in a shape.
    out.a = Math.min(1, (half - Math.abs(x - cx)) / 14, (17 - d) / 7);
    out.c = d < 1 ? WATER[7] : d < 2 ? WATER[5] : d < 5 ? WATER[4] : d < 10 ? WATER[3] : WATER[2];
    const cell = Math.floor((x + ph * 56) / 7) * 31 + Math.floor(y / 3) * 17;
    if (d > 2 && d < 13 && cell % 23 === 0 && Math.floor(x + ph * 56) % 7 === 0) out.c = WATER[6];
  });
  // Foam curling off the hull on both sides.
  for (const [x0, dir] of [[CX - 31, -1], [CX + 31, 1]]) {
    for (let i = 0; i < 4; i++) {
      const u = (ph * 2 + i / 4) % 1, x = x0 + dir * u * 6;
      p.px(x, waterTop(x, ph) - 1 - Math.round(Math.sin(u * Math.PI) * 2), WHITE);
    }
  }
}

function loot(p, t, ph) {
  const x = -46, bob = Math.round(Math.sin(ph * TAU + 1)), y = -10 + bob;
  p.rect(x - 7, y - 7, 15, 10, INK);
  p.rect(x - 6, y - 3, 13, 6, hex("#8a4c1c"));
  p.rect(x - 6, y - 3, 13, 1, hex("#b0702c"));
  p.rect(x - 6, y - 6, 13, 3, BRASS[3]);
  p.rect(x - 6, y - 6, 13, 1, BRASS[5]);
  p.rect(x - 1, y - 4, 3, 3, BRASS[4]);
  p.glow(x, y - 7, 11, BRASS[4], 0.32);
  cycle(t, D, 9, 5, (g) => g.range(0.6, 1.1), (age, life, r) => {
    const u = age / life, sx = x + r.range(-7, 8), sy = y - 11 + r.range(-12, 3);
    sparkle(p, sx, sy, 3 * Math.sin(u * Math.PI), BRASS[5], WHITE, 0.3);
  });
}

export function draw(p, t, o) {
  const ph = (t % D) / D, state = o.state, compact = Boolean(o.compact);
  const flush = state === "sos" && Math.sin(ph * TAU * 4) > 0;
  const C = state === "sos" ? (flush ? REDS : HOT) : fit(o.palette, 7);
  const sway = state === "sos" ? Math.round(Math.sin(ph * TAU * 3)) : 0;
  const bob = compact ? (state === "sos" ? 0 : Math.round((Math.sin(ph * TAU) + 1) / 2))
    : state === "surfaced" ? Math.round(Math.sin(ph * TAU) * 1) : Math.round(Math.sin(ph * TAU) * 2);
  const ox = CX + sway, oy = (state === "surfaced" ? CY + 3 : CY - 2) + bob, reach = compact ? 12 : 24;

  if (state === "dive") {
    if (!compact) bubbles(p, t, ox, oy);
    bowLamp(p, ox, oy, ph, true, reach);
  }
  if (state === "surfaced") loot(p, t, ph);

  propeller(p, ox, oy, ph);
  periscope(p, ox, oy, ph, compact);
  drawHull(p, C, ox, oy, compact);
  bowLamp(p, ox, oy, ph, state === "dive", reach);

  porthole(p, ox - 21, oy - 3, 4);
  glare(p, ox - 21, oy - 3, 3);
  face(p, ox, oy, state, ph, flush);

  if (state === "sos") alarm(p, t, ox, oy, ph, compact);
  if (state === "surfaced") surface(p, t, ph, compact ? -6 : 0, compact ? 50 : 56);
}
