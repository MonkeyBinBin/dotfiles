// Fittings for the control console along the bottom hull edge (`kind`). Origin at the top left.
//   toggle-up    a compartment's toggle switch, off: a steel lever thrown up
//   toggle-down  on: a brass lever thrown down, its slot lit
//   telegraph-*  the engine order telegraph, its needle on stop, ahead or emergency (that sector blinks)
//   log-badge    the captain's log's button: an open logbook behind a round brass porthole

import { hex, wrap } from "../../core/index.js";

export const meta = {
  name: "Sub console",
  desc: "Control console fittings: a toggle switch up or down; an engine order telegraph dial on stop, ahead or emergency.",
  tags: ["sub", "ui", "icon", "loop"],
  size: [36, 20],
  origin: [0, 0],
  duration: 1,
  loop: true,
  fps: 4,
  bg: "dark",
  options: { kind: "toggle-up" },
};

const INK = hex("#071214"), STEEL = ["#1c3032", "#4a6a6c", "#8aacac", "#d0e4e0"].map(hex), BRASS = ["#4a3410", "#b8903e", "#f0d07a", "#fff2b8"].map(hex);
const FACE = hex("#061a14"), SECTOR = { stop: ["#2a4a5a", "#8ab8d8"], ahead: ["#14583a", "#5cff9a"], emergency: ["#5a1410", "#ff5a4a"] };

function toggle(p, on) {
  const C = on ? BRASS : STEEL, ball = on ? 10 : 0;
  // a steel mounting plate with two screws, a dark slot lit when on
  p.rect(0, 0, 7, 14, INK); p.rect(1, 1, 5, 12, STEEL[1]); p.rect(1, 1, 5, 1, STEEL[2]); p.rect(1, 12, 5, 1, STEEL[0]);
  p.px(3, 1, STEEL[3]); p.px(3, 12, STEEL[3]);
  p.rect(2, 4, 3, 6, INK); p.rect(3, 5, 1, 4, on ? hex("#5cff9a") : STEEL[0]);
  // the bat handle, chrome or brass, thrown past the slot
  p.rect(3, on ? 7 : 3, 1, 4, C[2]);
  p.rect(2, ball + 1, 3, 3, C[1]); p.rect(2, ball + 1, 2, 2, C[2]); p.px(2, ball + 1, C[3]);
}

function telegraph(p, order, t) {
  const CX = 18, CY = 18, R = 17, TAU_DEG = 180 / Math.PI;
  const lit = order !== "emergency" || wrap(t, 1) < 0.5;
  // from straight left (-90) to straight right (90), a third of the arc per order
  const sector = (a) => (a < -30 ? "stop" : a < 30 ? "ahead" : "emergency");
  p.shade(0, 0, 36, 20, (x, y) => {
    const dx = x + 0.5 - CX, dy = y + 0.5 - CY, d = Math.hypot(dx, dy);
    if (d > R + 0.5 || dy > 1.5) return;
    if (d > R - 2 || dy > 0.5) return dx + dy < 0 ? BRASS[2] : BRASS[1];
    const a = Math.atan2(dx, -dy) * TAU_DEG, s = sector(a), mine = s === order;
    if (d > R - 7) return Math.abs(Math.abs(a) - 30) < 2.2 ? INK : hex(SECTOR[s][mine && lit ? 1 : 0]);
    return FACE;
  });
  // the needle and its hub
  const a = { stop: -60, ahead: 0, emergency: 60 }[order] / TAU_DEG;
  for (let r = 0; r < 12; r += 0.5) p.px(Math.round(CX - 0.5 + Math.sin(a) * r), Math.round(CY - 0.5 - Math.cos(a) * r), STEEL[3]);
  p.rect(CX - 2, CY - 2, 3, 3, BRASS[1]); p.px(CX - 1, CY - 1, BRASS[3]);
}

function logBadge(p) {
  const C = 9, PAGE = hex("#f0e8d0"), SHADE = hex("#c8bc9c"), INKED = hex("#5a5a58"), COVER = hex("#7a3a1a"), RIBBON = hex("#ff5a4a");
  // the ring, lit from the top left, a dark lip into the glass
  p.shade(0, 0, 18, 18, (x, y) => {
    const dx = x + 0.5 - C, dy = y + 0.5 - C, d = Math.hypot(dx, dy), tl = dx + dy < 0;
    if (d > C) return;
    if (d > C - 1) return BRASS[0];
    if (d > C - 2) return tl ? BRASS[3] : BRASS[1];
    if (d > C - 3) return tl ? BRASS[2] : BRASS[1];
    if (d > C - 4) return INK;
    return FACE;
  });
  // the book: its cover under two pages, the spine, ruled lines, a ribbon hanging out
  p.rect(4, 6, 10, 7, COVER);
  p.rect(5, 6, 4, 6, PAGE); p.rect(9, 6, 4, 6, PAGE); p.rect(8, 6, 1, 6, SHADE); p.rect(9, 6, 1, 6, SHADE);
  for (const y of [7, 9]) { p.rect(6, y, 2, 1, INKED); p.rect(10, y, 2, 1, INKED); }
  p.rect(11, 12, 1, 2, RIBBON);
}

export function draw(p, t, o) {
  if (o.kind === "log-badge") logBadge(p);
  else if (o.kind.startsWith("toggle")) toggle(p, o.kind === "toggle-down");
  else telegraph(p, o.kind.slice("telegraph-".length), t);
}
