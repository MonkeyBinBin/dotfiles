// The track map's scenery, in the same realistic pixel style as the trains, one piece per `kind` so the mod can lay a
// lane out at any width (the strips are wider than the widest lane and get cut, never stretched):
//   back      the night behind a track: sky, a distant skyline with lit windows, a retaining wall, the overhead line
//             (catenary masts, messenger wire, droppers, contact wire at a raised pantograph's height)
//   track     the rail seen from the side on concrete sleepers and ballast
//   depot     an engine shed with its front wall cut away, in a `style`: brick (roof trusses, a hanging lamp), steel (a
//             corrugated maintenance shed, skylights, a rolled-up shutter, hazard stripes), timber (an old wooden engine house,
//             an arched doorway, a smoke vent), sawtooth (concrete under a north-light roof, a numbered bay, sodium lamps)
//   platform  a station platform behind the track, in a `style`: modern (steel canopy, strip lights), heritage (cast-iron
//             canopy on arched brackets, lamps, a clock, brick), rural (a wooden halt: a gabled shelter, a lamp post, a fence
//             and flowers), glass (a glass canopy, platform screen doors, an LED departure sign)
//   signal    a three-aspect colour-light signal on its mast, `aspect` red | yellow | green | dark
// Origin: the rail top at the piece's left edge (the signal: its mast's foot).

import { hex } from "../../core/index.js";

export const meta = {
  name: "Dispatch scenery",
  desc: "Night railway scenery pieces in realistic pixel art: sky and catenary, track, engine shed, platform, signal.",
  tags: ["dispatch", "scenery"],
  size: [660, 120],
  origin: [10, 100],
  duration: 1,
  loop: true,
  fps: 1,
  bg: "dark",
  options: { kind: "back", aspect: "green" },
};

const H = (s) => hex(s);
const mix = (a, b, k) => [0, 8, 16].reduce((o, s) => o | (Math.round(((a >>> s) & 255) * (1 - k) + ((b >>> s) & 255) * k) << s), a & 0xff000000);
// a stable per-pixel random in 0..1
const noise = (x, y, k = 0) => (((x * 73856093) ^ (y * 19349663) ^ (k * 83492791)) >>> 0) % 1000 / 1000;

const STEEL = ["#2a3038", "#3e4650", "#5a646e", "#8a949e", "#b8c2ca"].map(H);
const RAIL_H = 90; // the back strip's height above the rail

function back(p) {
  const W = 640;
  // sky: a deep night going a little lighter and greener toward the horizon, a few stars
  const SKY = ["#05080e", "#070b13", "#091019", "#0b141e", "#0e1923"].map(H);
  p.shade(0, -RAIL_H, W - 1, -1, (cx, cy) => {
    const x = Math.floor(cx), y = Math.floor(cy), k = (y + RAIL_H) / RAIL_H; // 0 top .. 1 rail
    const band = Math.min(SKY.length - 1, Math.floor(k * SKY.length + (noise(x, y) - 0.5) * 0.6));
    return SKY[Math.max(0, band)];
  });
  for (let i = 0; i < 46; i++) {
    const x = Math.floor(noise(i, 1, 7) * W), y = -RAIL_H + 2 + Math.floor(noise(i, 2, 7) * 34);
    p.px(x, y, noise(i, 3, 7) > 0.8 ? H("#8a9ab0") : H("#3a4658"));
  }
  // the skyline: blocks of offices and flats, hazier the further back, lit windows here and there
  const layer = (seed, base, top, ink, lit) => {
    let x = 0;
    while (x < W) {
      const w = 14 + Math.floor(noise(x, seed, 1) * 34), h = top + Math.floor(noise(x, seed, 2) * (base - top));
      const roof = -h;
      p.rect(x, roof, w, h, ink);
      // a rooftop detail: a water tank, a mast with a red light
      if (noise(x, seed, 3) > 0.7) p.rect(x + 3, roof - 3, 4, 3, ink);
      if (noise(x, seed, 4) > 0.86) {
        p.rect(x + Math.floor(w / 2), roof - 7, 1, 7, ink);
        p.px(x + Math.floor(w / 2), roof - 8, H("#a8302a"));
      }
      for (let wy = roof + 3; wy < -8; wy += 3)
        for (let wx = x + 2; wx < x + w - 2; wx += 3)
          if (noise(wx, wy, seed) < lit) p.px(wx, wy, noise(wx, wy, seed + 9) > 0.35 ? H("#c8a060") : H("#7a9ab0"));
      x += w + Math.floor(noise(x, seed, 5) * 6);
    }
  };
  layer(11, 58, 26, H("#111a24"), 0.05);
  layer(23, 40, 14, H("#151e27"), 0.11);
  // the retaining wall along the line, concrete panels with a coping
  p.rect(0, -12, W, 12, H("#151b21"));
  p.rect(0, -12, W, 1, H("#252d35"));
  for (let x = 0; x < W; x += 24) p.rect(x, -11, 1, 11, H("#10151a"));
  for (let x = 0; x < W; x++) if (noise(x, -6, 5) > 0.93) p.px(x, -5 - Math.floor(noise(x, 1, 5) * 4), H("#1c232a"));

  // the overhead line: H-section masts with a cantilever, a sagging messenger wire, droppers, the contact wire
  const CONTACT = -32, MAST_TOP = -46;
  const masts = [];
  for (let x = 36; x < W; x += 132) masts.push(x);
  for (const m of masts) {
    p.rect(m, MAST_TOP, 2, -MAST_TOP, STEEL[2]);
    p.rect(m + 2, MAST_TOP, 1, -MAST_TOP, STEEL[0]);
    for (let y = MAST_TOP + 3; y < -2; y += 4) p.px(m, y, STEEL[3]);
    // the cantilever: a tube out over the track, its brace, an insulator
    p.line(m + 2, MAST_TOP + 2, m + 14, MAST_TOP + 2, STEEL[3]);
    p.line(m + 2, MAST_TOP + 8, m + 12, MAST_TOP + 3, STEEL[2]);
    p.rect(m + 12, MAST_TOP + 3, 1, 2, H("#a89878"));
    // its footing
    p.rect(m - 1, -3, 4, 3, H("#3a3a36"));
  }
  const sagAt = (x) => {
    const span = 132, u = (((x - 49) % span) + span) % span / span;
    return MAST_TOP + 5 + Math.round(Math.sin(u * Math.PI) * 4);
  };
  for (let x = 0; x < W; x++) {
    p.px(x, sagAt(x), H("#3a4048"));
    p.px(x, CONTACT, H("#5a6068"));
    if ((x - 49) % 12 === 0) for (let y = sagAt(x) + 1; y < CONTACT; y++) p.px(x, y, H("#252b32"));
  }
}

function track(p) {
  const W = 640;
  const BALLAST = ["#1e1c1a", "#2a2724", "#38342f", "#48433c", "#5a544b"].map(H);
  // ballast, coarse and lit from above, darker at the foot of the shoulder
  p.shade(0, 1, W - 1, 13, (cx, cy) => {
    const x = Math.floor(cx), y = Math.floor(cy), n = noise(x, y, 3), shade = (y - 1) / 12;
    return BALLAST[Math.max(0, Math.min(4, Math.floor(n * 4.2 - shade * 2.2 + 0.6)))];
  });
  // concrete sleepers, their ends towards us
  for (let x = 1; x < W; x += 7) {
    p.rect(x, 0, 4, 2, H("#6a665e"));
    p.rect(x, 0, 4, 1, H("#8a857a"));
    p.px(x + 3, 1, H("#4a463f"));
  }
  // the rail: a polished head, the web, the foot on its baseplates
  p.rect(0, -3, W, 1, H("#c8d0d6"));
  p.rect(0, -2, W, 1, H("#6a727a"));
  p.rect(0, -1, W, 1, H("#3a4046"));
  for (let x = 2; x < W; x += 7) p.px(x + 1, -1, H("#2a2e33"));
}

function depotBrick(p) {
  const W = 150, TOP = -60;
  const BRICK = ["#2a1812", "#3a2018", "#48281d", "#542f22"].map(H), MORTAR = H("#1a110d");
  // the back wall, brick in running bond, in the shed's gloom
  p.shade(0, -46, W - 1, -1, (cx, cy) => {
    const x = Math.floor(cx), y = Math.floor(cy), row = Math.floor((y + 46) / 3);
    if ((y + 46) % 3 === 2) return MORTAR;
    if ((x + (row % 2) * 4) % 8 === 7) return MORTAR;
    const brick = BRICK[Math.floor(noise(Math.floor((x + (row % 2) * 4) / 8), row, 2) * 4)];
    // the hanging lamp's pool of light on the wall, in steps so it stays pixel art
    const d = Math.hypot((x - 76) / 34, (y + 37) / 40);
    return d < 1 ? mix(brick, H("#b07a40"), Math.ceil((1 - d) * 4) / 4 * 0.45) : brick;
  });
  // the roof: a pitched steel roof on trusses, a ridge vent
  for (let x = 0; x < W; x++) {
    const peak = Math.round(W / 2), rise = Math.round(12 - Math.abs(x - peak) * (12 / peak));
    for (let y = -47 - rise; y <= -47; y++) p.px(x, y, y === -47 - rise ? STEEL[3] : (x % 4 === 0 ? STEEL[1] : STEEL[2]));
  }
  for (let x = 6; x < W - 4; x += 18) {
    p.line(x, -46, x + 9, -52, STEEL[0]);
    p.line(x + 18, -46, x + 9, -52, STEEL[0]);
  }
  p.rect(0, -46, W, 1, STEEL[0]);
  p.rect(Math.round(W / 2) - 8, -61, 16, 2, STEEL[1]);
  // a lamp on a cord, its pool of light on the wall (dithered, so the bricks show through)
  const lx = 76;
  p.rect(lx, -45, 1, 6, H("#1a1a1a"));
  p.rect(lx - 3, -39, 7, 2, H("#3a4a3a"));
  p.rect(lx - 1, -37, 3, 1, H("#fff0c0"));
  // a stencilled sign over the bay, and the end posts
  p.rect(10, -44, 30, 7, H("#1c1c1a"));
  p.text("DEPOT", 25, -43, H("#c8a868"), { align: "center" });
  p.rect(0, -46, 3, 46, H("#3a2a22"));
  p.rect(W - 3, -46, 3, 46, H("#3a2a22"));
  p.rect(W - 3, -46, 1, 46, H("#5a4030"));
  // the inspection pit's edge under the track
  p.rect(3, -1, W - 6, 1, H("#121212"));
}

function platformModern(p) {
  const W = 150;
  // the back wall: tiled, with a timetable board and a poster in the canopy's light
  const lights = [];
  for (let x = 16; x < W - 12; x += 26) lights.push(x + 6);
  p.shade(0, -40, W - 1, -7, (cx, cy) => {
    const x = Math.floor(cx), y = Math.floor(cy);
    const tile = (y + 40) % 4 === 0 ? H("#11171c") : H("#151c22");
    const near = Math.min(...lights.map((l) => Math.hypot((x - l) / 22, (y + 49) / 46)));
    return near < 1 ? mix(tile, H("#4a5a62"), Math.ceil((1 - near) * 3) / 3 * 0.5) : tile;
  });
  p.rect(24, -30, 14, 10, H("#20282e"));
  p.rect(25, -29, 12, 8, H("#e8d8a8"));
  for (let y = -28; y < -21; y += 2) p.rect(26, y, 10, 1, H("#4a4030"));
  p.rect(96, -32, 16, 12, H("#1e262c"));
  p.rect(97, -31, 14, 10, H("#3a6a8a"));
  p.rect(97, -25, 14, 4, H("#c84a3a"));
  // a bench and a bin against the wall
  p.rect(60, -12, 18, 2, H("#6a4a2a"));
  p.rect(61, -10, 1, 4, STEEL[1]);
  p.rect(76, -10, 1, 4, STEEL[1]);
  p.rect(84, -12, 4, 6, STEEL[1]);
  // the canopy: a deck with its fascia, columns down to the platform, strip lights under it
  p.rect(0, -54, W, 3, STEEL[2]);
  p.rect(0, -54, W, 1, STEEL[4]);
  p.rect(0, -51, W, 2, H("#2a3038"));
  for (const c of [8, 75, W - 10]) {
    p.rect(c, -49, 3, 43, STEEL[2]);
    p.rect(c, -49, 1, 43, STEEL[3]);
    p.rect(c - 2, -49, 7, 1, STEEL[1]);
  }
  for (let x = 16; x < W - 12; x += 26) {
    p.rect(x, -49, 12, 1, H("#f0f6ff"));
  }
  // the name board hanging from the canopy
  p.rect(36, -48, 1, 3, STEEL[1]);
  p.rect(62, -48, 1, 3, STEEL[1]);
  p.rect(30, -45, 40, 8, H("#e8eef2"));
  p.rect(30, -45, 40, 1, H("#ffffff"));
  p.rect(30, -38, 40, 1, H("#1a5a9a"));
  p.text("DISPATCH", 50, -44, H("#1a2a3a"), { align: "center" });
  // the platform: its surface, the yellow tactile edge, the concrete face down to the rail
  p.rect(0, -6, W, 1, H("#6a665e"));
  p.rect(0, -5, W, 1, H("#d8b030"));
  for (let x = 0; x < W; x += 2) p.px(x, -5, H("#a88420"));
  p.rect(0, -4, W, 4, H("#4a4740"));
  p.rect(0, -4, W, 1, H("#5a564e"));
  for (let x = 0; x < W; x += 12) p.rect(x, -3, 1, 3, H("#3a3832"));
}

function depotSteel(p) {
  const W = 150;
  const SHEET = ["#2a3036", "#363e46", "#444d56"].map(H);
  // corrugated steel walls inside, lit by tubes under the roof (stepped, so it stays pixel art)
  p.shade(0, -50, W - 1, -1, (cx, cy) => {
    const x = Math.floor(cx), y = Math.floor(cy), base = SHEET[x % 3];
    const d = Math.min(...[38, 112].map((l) => Math.hypot((x - l) / 40, (y + 48) / 46)));
    return d < 1 ? mix(base, H("#8a9aa6"), Math.ceil((1 - d) * 3) / 3 * 0.35) : base;
  });
  // a flat roof with skylights, a parapet
  p.rect(0, -56, W, 6, SHEET[1]);
  p.rect(0, -56, W, 1, H("#6a747e"));
  for (let x = 14; x < W - 14; x += 30) p.rect(x, -55, 14, 2, H("#3a5a6a"));
  // tubes, the rolled-up shutter in its box over the bay, hazard stripes up the door posts
  for (const x of [32, 106]) p.rect(x, -49, 14, 1, H("#f0f6ff"));
  p.rect(4, -50, W - 8, 4, H("#4a525a"));
  for (let x = 4; x < W - 4; x += 2) p.px(x, -47, H("#2a3036"));
  for (const x0 of [0, W - 4]) for (let y = -50; y < 0; y++) p.rect(x0, y, 4, 1, Math.floor((y + 50) / 3) % 2 ? H("#e8c020") : H("#1a1a1a"));
  // a tool cabinet and a hose reel on the back wall, a bay number
  p.rect(60, -24, 12, 18, H("#a83a2a"));
  p.rect(60, -24, 12, 1, H("#c85a4a"));
  p.circle(90, -18, 4, H("#3a3a3a"));
  p.circle(90, -18, 2, H("#c8a020"));
  p.rect(10, -44, 14, 7, H("#e8e8e0"));
  p.text("B1", 17, -43, H("#1a1a1a"), { align: "center" });
}

function depotTimber(p) {
  const W = 150;
  const WOOD = ["#1e140c", "#2c1e12", "#3a2818", "#4a3420"].map(H);
  // a boarded back wall, weathered
  p.shade(0, -48, W - 1, -1, (cx, cy) => {
    const x = Math.floor(cx), y = Math.floor(cy);
    if (x % 6 === 0) return WOOD[0];
    const base = WOOD[1 + Math.floor(noise(Math.floor(x / 6), Math.floor(y / 9), 6) * 3)];
    const d = Math.hypot((x - 75) / 36, (y + 40) / 40);
    return d < 1 ? mix(base, H("#a8743a"), Math.ceil((1 - d) * 3) / 3 * 0.4) : base;
  });
  // the gabled roof of tarred boards, a smoke vent on the ridge
  for (let x = 0; x < W; x++) {
    const rise = Math.round(10 - Math.abs(x - W / 2) * (10 / (W / 2)));
    for (let y = -49 - rise; y <= -48; y++) p.px(x, y, y === -49 - rise ? H("#4a4440") : (x % 4 === 0 ? H("#1a1816") : H("#2a2624")));
  }
  p.rect(W / 2 - 4, -66, 8, 8, H("#2a2624"));
  p.rect(W / 2 - 6, -67, 12, 2, H("#3a3430"));
  // the arched doorway's frame over the bay: a shallow arched beam on two posts
  const R = 208, CY = 164; // a circle through (75, -44) at the crown and (0 | 150, -30) at the posts
  for (let x = 0; x < W; x++) {
    const y = Math.round(CY - Math.sqrt(R * R - (x - W / 2) ** 2));
    p.rect(x, y, 1, 3, WOOD[3]);
    p.px(x, y, H("#5a4028"));
  }
  for (const x0 of [0, W - 4]) {
    p.rect(x0, -30, 4, 30, WOOD[3]);
    p.rect(x0 + (x0 ? 0 : 3), -30, 1, 30, WOOD[0]);
  }
  // a lantern on a bracket, a sign board
  p.rect(74, -46, 2, 3, H("#1a1a1a"));
  p.rect(72, -43, 6, 5, H("#2a2a2a"));
  p.rect(73, -42, 4, 3, H("#ffd080"));
  p.rect(12, -42, 30, 7, H("#1a120a"));
  p.text("SHED", 27, -41, H("#d8b878"), { align: "center" });
}

function depotSawtooth(p) {
  const W = 150;
  // concrete walls with formwork lines, in the orange of sodium lamps
  p.shade(0, -48, W - 1, -1, (cx, cy) => {
    const x = Math.floor(cx), y = Math.floor(cy);
    const base = (y + 48) % 8 === 0 || x % 25 === 0 ? H("#24221e") : H("#2e2b26");
    const d = Math.min(...[30, 75, 120].map((l) => Math.hypot((x - l) / 26, (y + 44) / 42)));
    return d < 1 ? mix(base, H("#b8742a"), Math.ceil((1 - d) * 3) / 3 * 0.35) : base;
  });
  // the sawtooth roof: steep glazed faces and sloping backs
  for (let i = 0; i < 5; i++) {
    const x0 = i * 30;
    for (let x = x0; x < x0 + 30 && x < W; x++) {
      const top = -49 - Math.round(((x - x0) / 30) * 12);
      for (let y = top; y <= -48; y++) p.px(x, y, x - x0 >= 27 ? H("#3a5a6a") : y === top ? H("#5a5650") : H("#3a3630"));
    }
    p.rect(x0 + 27, -61, 3, 13, H("#4a7a8a"));
  }
  p.rect(0, -48, W, 1, H("#1a1814"));
  // sodium lamps, a bay number painted on the wall, a buffer stop at the back end
  for (const x of [30, 75, 120]) {
    p.rect(x - 2, -47, 5, 2, H("#2a2a2a"));
    p.rect(x - 1, -45, 3, 1, H("#ffb050"));
  }
  p.text("3", 14, -40, H("#e8e0c8"), { scale: 2 });
  p.rect(4, -8, 4, 7, H("#c83a2a"));
  p.rect(3, -9, 6, 2, H("#e8c020"));
}

const DEPOTS = { brick: depotBrick, steel: depotSteel, timber: depotTimber, sawtooth: depotSawtooth };

// The platform's edge and face, shared by every style: a surface, the edge (yellow tactile strip or a white line),
// the face down to the rail.
function edge(p, W, { surface = "#6a665e", line = "tactile", face = "#4a4740", faceHi = "#5a564e" } = {}) {
  p.rect(0, -6, W, 1, H(surface));
  if (line === "tactile") {
    p.rect(0, -5, W, 1, H("#d8b030"));
    for (let x = 0; x < W; x += 2) p.px(x, -5, H("#a88420"));
  } else p.rect(0, -5, W, 1, H(line));
  p.rect(0, -4, W, 4, H(face));
  p.rect(0, -4, W, 1, H(faceHi));
  for (let x = 0; x < W; x += 12) p.rect(x, -3, 1, 3, mix(H(face), H("#000000"), 0.25));
}

function platformHeritage(p) {
  const W = 150;
  const IRON = ["#1a1e22", "#2a3036", "#3e464e", "#5a646e"].map(H), CREAM = H("#d8cca8");
  // a brick back wall with a lit doorway and a poster
  const BRICK = ["#3a2218", "#46281c", "#542f21"].map(H);
  p.shade(0, -42, W - 1, -7, (cx, cy) => {
    const x = Math.floor(cx), y = Math.floor(cy), row = Math.floor((y + 42) / 3);
    if ((y + 42) % 3 === 2 || (x + (row % 2) * 4) % 8 === 7) return H("#1e130e");
    return BRICK[Math.floor(noise(Math.floor((x + (row % 2) * 4) / 8), row, 4) * 3)];
  });
  p.rect(100, -30, 12, 23, H("#20140c"));
  p.rect(101, -29, 10, 22, H("#b88a4a"));
  p.rect(101, -29, 10, 2, H("#e8c888"));
  p.rect(40, -30, 12, 15, H("#e8dcc0"));
  p.rect(41, -28, 10, 6, H("#7a3a2a"));
  for (let y = -20; y < -16; y += 2) p.rect(42, y, 8, 1, H("#5a4a3a"));
  // the canopy: a ridged roof with a valance of zigzag boards, cast-iron columns with arched brackets
  p.rect(0, -56, W, 3, IRON[2]);
  p.rect(0, -56, W, 1, IRON[3]);
  for (let x = 0; x < W; x += 3) p.tri(x, -53, x + 3, -53, x + 1.5, -50, CREAM);
  for (const c of [10, 75, W - 12]) {
    p.rect(c, -50, 3, 44, IRON[1]);
    p.rect(c, -50, 1, 44, IRON[2]);
    p.rect(c - 1, -9, 5, 3, IRON[1]);
    // the arched brackets either side
    p.arc(c - 6, -50, 7, 1, 0, Math.PI / 2, IRON[1]);
    p.arc(c + 9, -50, 7, 1, Math.PI / 2, Math.PI, IRON[1]);
  }
  // lamps hanging from the canopy, warm
  for (const x of [40, 110]) {
    p.rect(x, -50, 1, 4, IRON[0]);
    p.rect(x - 2, -46, 5, 2, IRON[1]);
    p.rect(x - 1, -44, 3, 2, H("#ffd890"));
  }
  // the station clock and the name board, black with white letters
  p.circle(75, -44, 4, IRON[0]);
  p.circle(75, -44, 3, H("#f0ead8"));
  p.px(75, -45, IRON[0]);
  p.px(76, -44, IRON[0]);
  p.rect(14, -47, 22, 7, H("#101010"));
  p.text("DSP", 25, -46, H("#f0f0f0"), { align: "center" });
  // a wooden bench
  p.rect(56, -12, 16, 2, H("#6a4424"));
  p.rect(56, -15, 16, 1, H("#5a3a1e"));
  p.rect(57, -10, 1, 4, IRON[1]);
  p.rect(70, -10, 1, 4, IRON[1]);
  edge(p, W, { surface: "#5a5650", line: "#e8e0c8", face: "#5a3a2a", faceHi: "#6a4632" });
}

function platformRural(p) {
  const W = 150;
  const WOOD = ["#2a1c10", "#3e2a18", "#5a3e24", "#7a5634"].map(H);
  // a low wooden fence along the back, a hedge behind it
  for (let x = 0; x < W; x++) p.px(x, -14 - Math.round(noise(x, 3, 8) * 2), H("#14241a"));
  p.rect(0, -12, W, 6, H("#10200f"));
  for (let x = 2; x < W; x += 6) p.rect(x, -14, 2, 8, WOOD[2]);
  p.rect(0, -12, W, 1, WOOD[3]);
  p.rect(0, -9, W, 1, WOOD[2]);
  // the shelter: a gabled wooden roof on posts, its back boarded, a bench inside
  const sx = 40, sw = 54;
  for (let x = sx - 4; x < sx + sw + 4; x++) {
    const rise = Math.round(8 - Math.abs(x - (sx + sw / 2)) * (8 / (sw / 2 + 4)));
    for (let y = -36 - rise; y <= -34; y++) p.px(x, y, y === -36 - rise ? WOOD[3] : (x % 3 === 0 ? WOOD[1] : WOOD[2]));
  }
  p.rect(sx, -34, sw, 28, WOOD[1]);
  for (let x = sx; x < sx + sw; x += 4) p.rect(x, -34, 1, 28, WOOD[0]);
  for (const c of [sx, sx + sw - 2]) p.rect(c, -34, 2, 28, WOOD[3]);
  p.rect(sx + 8, -14, sw - 16, 2, WOOD[3]);
  p.rect(sx + 10, -12, 1, 6, WOOD[0]);
  p.rect(sx + sw - 11, -12, 1, 6, WOOD[0]);
  // a little name sign on two posts, a lamp post with its lantern, flowers in a planter
  p.rect(108, -24, 1, 18, WOOD[2]);
  p.rect(128, -24, 1, 18, WOOD[2]);
  p.rect(104, -30, 29, 7, H("#f0ead8"));
  p.text("HALT", 118, -29, H("#2a3a2a"), { align: "center" });
  p.rect(16, -40, 2, 34, H("#2a2e33"));
  p.rect(13, -44, 8, 2, H("#2a2e33"));
  p.rect(14, -42, 6, 3, H("#ffe0a0"));
  p.rect(14, -42, 6, 1, H("#fff4d0"));
  p.rect(2, -10, 10, 4, WOOD[1]);
  for (const [x, c] of [[3, "#e85a6a"], [5, "#ffd23a"], [7, "#e85a6a"], [9, "#f0f0f0"], [10, "#ffd23a"]]) p.px(x, -11 - (x % 2), H(c));
  edge(p, W, { surface: "#5e5a4c", line: "#e8e0c8", face: "#4a4436", faceHi: "#5a5444" });
}

function platformGlass(p) {
  const W = 150;
  // a pale back wall, an LED departure sign, the canopy of glass on slim white steel
  p.rect(0, -40, W, 34, H("#1a2228"));
  for (let x = 0; x < W; x += 15) p.rect(x, -40, 1, 34, H("#151c21"));
  p.rect(48, -36, 54, 9, H("#0a0c0e"));
  p.text("DEP", 52, -34, H("#ffb03a"));
  p.text("12:34", 98, -34, H("#ffb03a"), { align: "right" });
  // glass: translucent panes, light catching their edges (dithered, so the wall shows through)
  p.each(0, -56, W - 1, -51, (cx, cy) => p.dot(Math.floor(cx), Math.floor(cy), H("#7aa8c0"), 0.45));
  p.rect(0, -56, W, 1, H("#c8e0ec"));
  p.rect(0, -51, W, 1, H("#e8eef2"));
  for (let x = 0; x < W; x += 18) p.rect(x, -56, 1, 6, H("#e8eef2"));
  for (const c of [12, W - 14]) {
    p.rect(c, -50, 2, 44, H("#d8e0e6"));
    p.rect(c + 2, -50, 1, 44, H("#8a98a4"));
  }
  // strip lights under the glass
  for (let x = 22; x < W - 20; x += 24) p.rect(x, -50, 14, 1, H("#f4fbff"));
  // platform screen doors along the edge: half-height panels with glass tops, gaps where the train's doors stop
  for (let x = 2; x < W - 4; x += 24) {
    p.rect(x, -16, 18, 10, H("#c8d2da"));
    p.rect(x + 1, -15, 16, 4, H("#3a5a6a"));
    p.rect(x + 1, -15, 16, 1, H("#7aa0b4"));
    p.rect(x, -16, 18, 1, H("#e8eef2"));
    p.rect(x + 7, -11, 4, 1, H("#3ac87a")); // its door lamp
  }
  edge(p, W, { surface: "#7a7a76", line: "tactile", face: "#5a5a56", faceHi: "#6a6a66" });
}

const PLATFORMS = { modern: platformModern, heritage: platformHeritage, rural: platformRural, glass: platformGlass };

function signal(p, aspect) {
  // the mast, a ladder up its side, a concrete foot; the head: a black backplate, three lamps under hoods
  p.rect(-1, -36, 2, 36, STEEL[2]);
  p.rect(0, -36, 1, 36, STEEL[3]);
  for (let y = -34; y < -3; y += 3) p.px(2, y, STEEL[1]);
  p.rect(2, -34, 1, 31, STEEL[0]);
  p.rect(-3, -3, 6, 3, H("#4a4842"));
  p.rect(-3, -50, 7, 15, H("#0a0c0e"));
  p.rect(-3, -50, 7, 1, H("#2a2e33"));
  const LAMPS = [["red", -47, "#ff3a2a", "#ffb8a8", "#3a0e0a"], ["yellow", -43, "#ffc02a", "#fff0b0", "#3a2c08"], ["green", -39, "#3aff7a", "#c8ffd8", "#0a3a1a"]];
  for (const [name, y, on, hi, off] of LAMPS) {
    const lit = aspect === name;
    p.rect(-2, y, 5, 3, H("#14171a"));
    p.rect(-1, y, 3, 3, lit ? H(on) : H(off));
    if (lit) p.px(0, y + 1, H(hi));
    p.rect(-2, y - 1, 5, 1, H("#2a2e33")); // the hood
    if (lit) p.glow(0.5, y + 1.5, 4, H(on), 0.5);
  }
}

export function draw(p, _t, o) {
  if (o.kind === "back") return back(p);
  if (o.kind === "track") return track(p);
  if (o.kind === "depot") return (DEPOTS[o.style] ?? depotBrick)(p);
  if (o.kind === "platform") return (PLATFORMS[o.style] ?? platformModern)(p);
  if (o.kind === "signal") return signal(p, o.aspect);
}
