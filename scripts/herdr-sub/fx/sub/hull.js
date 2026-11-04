// The submarine's hull, behind the whole window: staggered riveted steel plates, each seam lit on its top and
// left edge and shaded on the other two, rivets along every seam. One still picture, shown with fit: cover.

import { hex } from "../../core/index.js";

export const meta = {
  name: "Sub hull",
  desc: "Riveted steel hull plating for the submarine's window background: staggered plates, lit seams, rows of rivets.",
  tags: ["sub", "background", "still"],
  size: [720, 450],
  origin: [0, 0],
  duration: 1,
  loop: true,
  fps: 1,
  bg: "dark",
  options: {},
};

const PW = 120, PH = 56;
const PLATE = ["#0b2126", "#0d252b"].map(hex), SEAM = hex("#031015"), LIT = hex("#173b42"), DARK = hex("#071519");
const RIVET = hex("#3c6a6e"), RIVET_SH = hex("#041013"), GRIME = hex("#0a1e23");

/** The plating's color at (x, y), for anything else made of the hull. */
export function plating(x, y) {
  const row = Math.floor(y / PH), off = row % 2 ? PW / 2 : 0, col = Math.floor((x + off) / PW);
  const py = y % PH, px = (x + off) % PW;
  let c = PLATE[(row + col) % 2];
  // a little grime pooling at each plate's bottom
  if (py > PH - 9 && (x * 7 + y * 13) % 5 === 0) c = GRIME;
  if (py === 0 || px === 0) c = SEAM;
  else if (py === 1 || px === 1) c = LIT;
  else if (py === PH - 1 || px === PW - 1) c = DARK;
  const onH = (py === 4 || py === PH - 5) && px % 10 === 5, onV = (px === 4 || px === PW - 5) && py % 10 === 5;
  if (onH || onV) c = RIVET;
  else if (((py === 5 || py === PH - 4) && px % 10 === 5) || ((px === 5 || px === PW - 4) && py % 10 === 5)) c = RIVET_SH;
  return c;
}

export function draw(p) {
  const [W, H] = meta.size;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) p.px(x, y, plating(x, y));
}
