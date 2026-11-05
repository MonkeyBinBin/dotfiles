// Sixteen-pixel icons for the Claude Code band, drawn at their own size in pixelfx's way: a dark outline, lit from the top
// left in hard steps, a little life in each. They become half-block cells, 16 columns by 8 rows.
//   o2 fuel hull torp  what the sub is short of, what has gone wrong, what it has out
//   edit bash read web agent gear ask  what kind of work it is on right now, or waiting for an answer
//   chest  the closing line's loot
import { hex, ramp, TAU, WHITE } from "../../core/index.js";

export const meta = {
  name: "Helm icons",
  desc: "Small animated submarine instruments: air tank, fuel can, breached plate, torpedo, tools and a chest.",
  tags: ["ui", "icon", "submarine", "loop"],
  size: [16, 16],
  origin: [8, 16],
  duration: 3,
  loop: true,
  fps: 12,
  bg: "dark",
  options: { kind: "o2", critical: false, seed: 1 },
};

const INK = hex("#10121a");
const STEEL = ramp(["#232a38", "#3c4658", "#5f6b80", "#8d99ad", "#c9d2df"]);
const CYAN = ramp(["#0f4a60", "#1c7f9c", "#3fc0d8", "#9cf0f4"]);
const AMBER = ramp(["#6a3a0a", "#b06a12", "#f0a52a", "#ffe07a"]);
const RED = ramp(["#5e0f16", "#a81f20", "#f04a3a", "#ffa890"]);
const GREEN = ramp(["#0b3322", "#1c7a4a", "#5cff9a"]);
const BRASS = ramp(["#5e3a0c", "#b07f1c", "#f6d264", "#fff2b8"]);
const WATER = ramp(["#14508c", "#36a2e0", "#a8e4ff"]);

// A filled box with an outline, its top and left edges lit.
function box(p, x, y, w, h, C) {
  p.rect(x - 1, y, w + 2, h, INK);
  p.rect(x, y - 1, w, h + 2, INK);
  p.rect(x, y, w, h, C[1]);
  p.rect(x, y, w, 1, C[C.length - 1]);
  p.rect(x, y + 1, 1, h - 1, C[2]);
  p.rect(x, y + h - 1, w, 1, C[0]);
}

const ICONS = {
  o2(p, ph, o) {
    const C = o.critical ? RED : CYAN, flash = o.critical && Math.sin(ph * TAU * 6) > 0;
    p.rect(-2, -16, 4, 2, INK); p.rect(-1, -15, 2, 1, BRASS[2]);
    box(p, -4, -13, 8, 12, flash ? RED.slice(1) : C);
    // A band round the tank, and bubbles rising past the gauge window.
    p.rect(-4, -9, 8, 1, STEEL[3]);
    p.rect(-2, -7, 4, 5, INK); p.rect(-1, -6, 2, 3, CYAN[0]);
    const up = Math.floor(ph * 12) % 3; p.px(-1 + (up & 1), -3 - up, CYAN[3]);
    p.px(-2, -12, WHITE);
  },
  fuel(p, ph, o) {
    const C = o.critical ? RED : AMBER, on = Math.sin(ph * TAU * 3) > -0.4;
    p.rect(1, -15, 4, 3, INK); p.rect(2, -14, 2, 1, STEEL[3]);
    box(p, -5, -12, 10, 11, C);
    // A bolt in the can, flickering.
    const bolt = on ? WHITE : C[C.length - 1];
    p.line(1, -10, -2, -6, bolt); p.line(-2, -6, 1, -6, bolt); p.line(1, -6, -1, -3, bolt);
    p.px(-3, -11, WHITE);
  },
  hull(p, ph) {
    box(p, -6, -14, 12, 13, STEEL);
    for (const [x, y] of [[-5, -13], [4, -13], [-5, -3], [4, -3]]) p.px(x, y, STEEL[4]);
    // The crack, and water spraying out of it.
    p.polyline([[-3, -12], [-1, -9], [-2, -7], [1, -5], [0, -2]], INK);
    p.polyline([[-2, -12], [0, -9], [-1, -7], [2, -5]], RED[2]);
    const s = Math.floor(ph * 12);
    for (let i = 0; i < 3; i++) {
      const u = (s + i * 4) % 12 / 12, x = -1 + u * 8, y = -8 - Math.sin(u * Math.PI) * 5 + u * 6;
      p.px(x, y, WATER[i]);
      p.px(x - 1, y + 1, WATER[0]);
    }
  },
  torp(p, ph) {
    const dx = Math.round(Math.sin(ph * TAU) * 1);
    p.rect(-6 + dx, -11, 12, 5, INK); p.rect(-7 + dx, -10, 14, 3, INK);
    p.rect(-5 + dx, -10, 8, 3, STEEL[2]); p.rect(-5 + dx, -10, 8, 1, STEEL[4]); p.rect(-5 + dx, -8, 8, 1, STEEL[1]);
    p.rect(3 + dx, -10, 3, 3, RED[2]); p.rect(3 + dx, -10, 2, 1, RED[3]);
    p.rect(-1 + dx, -10, 1, 3, BRASS[2]);
    p.rect(-7 + dx, -13, 2, 3, BRASS[1]); p.rect(-7 + dx, -7, 2, 3, BRASS[1]);
    // The wake.
    const s = Math.floor(ph * 12);
    for (let i = 0; i < 3; i++) p.px(-8 - ((s + i * 4) % 6) / 2 + 8 - 8, -9 + (i - 1) * 2, CYAN[(s + i) % 3 + 1]);
  },
  edit(p, ph) {
    // A pencil writing a line that grows and starts over.
    const u = Math.floor(ph * 12) / 12, tip = -7 + u * 9;
    p.rect(-7, -2, tip + 7, 1, GREEN[2]);
    const dx = tip + 7;
    const body = [[0, -2], [8, -10], [10, -8], [2, 0]];
    p.poly(body.map(([x, y]) => [x - 7 + dx - 4, y - 1 - 1]), INK);
    p.line(-5 + dx - 4 + 3, -5, 2 + dx - 4, -11, AMBER[3]);
    p.line(-5 + dx - 4 + 4, -5, 2 + dx - 4 + 1, -10, AMBER[2]);
    p.line(-4 + dx - 4 + 4, -4, 2 + dx - 4 + 2, -9, AMBER[1]);
    p.rect(dx - 7, -3, 2, 1, WHITE);
  },
  bash(p, ph) {
    box(p, -7, -14, 14, 12, STEEL);
    p.rect(-6, -12, 12, 9, INK);
    const g = GREEN[2];
    p.line(-5, -10, -3, -8, g); p.line(-3, -8, -5, -6, g);
    if (Math.floor(ph * 6) % 2) p.rect(-1, -6, 4, 1, g);
    p.rect(-3, -1, 6, 1, STEEL[1]);
  },
  read(p, ph) {
    p.circle(-2, -10, 6, INK);
    p.circle(-2, -10, 5, BRASS[1]);
    p.circle(-2, -10, 4, CYAN[1]);
    const sweep = -6 + Math.floor(ph * 12) % 12;
    for (let i = 0; i < 4; i++) p.px(sweep + i * 0.5, -12 + i, CYAN[3]);
    p.px(-4, -12, WHITE);
    p.line(2, -6, 6, -2, INK); p.line(3, -6, 7, -2, INK);
    p.line(3, -5, 6, -2, BRASS[2]);
  },
  web(p, ph) {
    p.circle(0, -8, 7, INK);
    p.circle(0, -8, 6, WATER[0]);
    const turn = ph * TAU;
    for (let i = 0; i < 3; i++) {
      const rx = Math.abs(Math.cos(turn + (i * Math.PI) / 3)) * 5.5;
      for (let y = -5; y <= 5; y++) {
        const x = rx * Math.sqrt(1 - (y * y) / 30);
        p.px(Math.round(x), -8 + y, WATER[1]);
        p.px(Math.round(-x), -8 + y, WATER[1]);
      }
    }
    p.rect(-6, -8, 12, 1, WATER[2]);
    p.px(-3, -12, WHITE);
  },
  agent(p, ph) {
    // A tiny sub out on its own, a line of wake behind.
    const y = Math.round(Math.sin(ph * TAU)) - 8;
    p.ellipse(1, y, 6, 4, INK);
    p.ellipse(1, y, 5, 3, AMBER[1]);
    p.rect(-2, y - 2, 6, 1, AMBER[3]);
    p.rect(0, y - 5, 3, 2, INK); p.rect(1, y - 4, 1, 1, STEEL[3]);
    p.px(3, y, CYAN[3]);
    p.rect(-6, y - 1, 2, 3, INK); p.px(-5, y, STEEL[3]);
    const s = Math.floor(ph * 12) % 3;
    p.px(-8 + s, y + 2, CYAN[2]);
  },
  gear(p, ph) {
    p.circle(0, -8, 5, INK);
    const turn = ph * TAU;
    for (let i = 0; i < 6; i++) {
      const a = turn / 3 + (i * TAU) / 6, x = Math.cos(a) * 6, y = -8 + Math.sin(a) * 6;
      p.rect(x - 1, y - 1, 2, 2, INK);
      p.px(x, y, STEEL[3]);
    }
    p.circle(0, -8, 4, STEEL[2]);
    p.circle(-1, -9, 2, STEEL[3]);
    p.circle(0, -8, 1.5, INK);
  },
  ask(p, ph) {
    // A speech bubble, its question mark hopping.
    box(p, -7, -15, 14, 10, ramp(["#b9c4d4", "#e8eef6", "#f4f8fc", "#ffffff"]));
    p.tri(-3, -5, 1, -5, -3, -1, INK);
    p.tri(-2, -6, 0, -6, -2, -3, hex("#e8eef6"));
    const y = -13 - (Math.floor(ph * 6) % 2);
    p.rect(-2, y, 4, 1, RED[1]); p.rect(1, y + 1, 2, 2, RED[1]); p.rect(-1, y + 2, 3, 1, RED[1]);
    p.rect(-1, y + 3, 2, 1, RED[1]); p.rect(-1, y + 5, 2, 1, RED[2]);
  },
  chest(p, ph) {
    p.rect(-6, -8, 12, 8, INK);
    p.rect(-5, -4, 10, 3, hex("#8a4c1c"));
    p.rect(-5, -4, 10, 1, hex("#b0702c"));
    p.rect(-5, -7, 10, 2, BRASS[1]);
    p.rect(-5, -7, 10, 1, BRASS[2]);
    p.rect(-1, -5, 2, 2, BRASS[3]);
    const s = Math.floor(ph * 12) % 6;
    if (s < 2) p.px(3, -7, WHITE);
  },
};

export function draw(p, t, o) {
  ICONS[o.kind](p, (t % meta.duration) / meta.duration, o);
}
