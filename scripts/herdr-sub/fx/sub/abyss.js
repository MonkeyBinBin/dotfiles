// What's behind the conversation: a deep sea in cute, chunky pixel art, drawn small and shown large. Dithered water and
// light rays; a round whale spouting, a squid, a manta ray, a little shark, a stream of fish, a bait ball, kelp and a
// ridge along the bottom. Dark and low in contrast so text stays readable over it. A layout's background image only
// ever shows its first frame (GIF and WebP alike), so it's one still picture. Origin at the top left.

import { hex } from "../../core/index.js";

export const meta = {
  name: "Abyss",
  desc: "A dark cute pixel-art sea: dithered water, a round whale, squid, manta ray, shark, fish schools and kelp.",
  tags: ["sub", "background", "still"],
  size: [256, 96],
  origin: [0, 0],
  duration: 1,
  loop: true,
  fps: 1,
  bg: "dark",
  options: {},
};

const W = meta.size[0], H = meta.size[1];
const WATER = ["#0d5a62", "#0c525a", "#0b4a52", "#0a434a", "#093c43", "#08363c", "#073036", "#062a2f", "#052429", "#041f23"].map(hex);
const RAY = hex("#17727a");
const BAYER = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]];
const noise = (n) => { const s = Math.sin(n * 91.7) * 43758.5453; return s - Math.floor(s); };

// Each creature is drawn on its own layer, then outlined and laid over the water.
let layer = new Map();
const put = (x, y, c) => { const px = Math.round(x), py = Math.round(y); if (px >= 0 && px < W && py >= 0 && py < H) layer.set(py * W + px, c); };
function ellipse(cx, cy, rx, ry, c) {
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++)
    for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++)
      if (((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1) put(x, y, c);
}
function creature(p, draw, outline) {
  layer = new Map();
  draw();
  if (outline) {
    const edge = [];
    for (const key of layer.keys()) {
      const x = key % W, y = Math.floor(key / W);
      for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + a, ny = y + b;
        if (nx >= 0 && nx < W && ny >= 0 && ny < H && !layer.has(ny * W + nx)) edge.push(ny * W + nx);
      }
    }
    for (const key of edge) layer.set(key, outline);
  }
  for (const [key, c] of layer) p.px(key % W, Math.floor(key / W), c);
}

function water(p) {
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const f = (y / H) * (WATER.length - 1), step = Math.floor(f), dither = (BAYER[y % 4][x % 4] + 0.5) / 16;
      let c = WATER[Math.min(WATER.length - 1, step + (f - step > dither ? 1 : 0))];
      // slanted shafts of light, breaking up into dots as they go down
      const u = x + y * 0.55, shaft = [18, 66, 104, 162, 216].some((s, i) => u > s && u < s + [13, 8, 16, 9, 12][i]);
      if (shaft && y < 62 && (y < 18 || dither > (y - 18) / 44)) c = RAY;
      p.px(x, y, c);
    }
}

// A round whale facing left, its tail growing straight out of the body in one piece.
function whale(p, X, Y) {
  const BACK = hex("#1a4a58"), MID = hex("#245e6c"), BELLY = hex("#6fa8ac"), LINE = hex("#3f7f86"), DARK = hex("#0a2a32"), EYE = hex("#e8ffff"), BLUSH = hex("#c87a86");
  creature(p, () => {
    // the body, tapering without a break into the tail stock, which curves up to the flukes
    for (let x = -33; x <= 42; x++) {
      const k = x < 0 ? Math.sqrt(Math.max(0, 1 - (x / 33) ** 2)) : Math.max(0.17, Math.cos((x / 42) * (Math.PI / 2)) ** 0.8);
      const half = 15 * k, lift = x > 10 ? ((x - 10) / 32) ** 2 * 8 : 0;
      for (let y = -half; y <= half; y++) put(X + x, Y + y - lift, y < -half * 0.3 ? BACK : MID);
    }
    // the flukes overlap the end of the stock
    ellipse(X + 47, Y - 13, 4, 7, BACK);
    ellipse(X + 44, Y - 8, 5, 3, BACK);
    ellipse(X + 50, Y - 6, 6, 3, BACK);
    // a small dorsal fin grows from the back
    for (let i = 0; i < 6; i++) for (let h = 0; h < 6 - i; h++) put(X + 13 + i, Y - 11 - h + i * 0.3, BACK);
  }, DARK);
  creature(p, () => {
    // the pale belly with its grooves
    for (let x = -30; x <= 12; x++) {
      const k = x < 0 ? Math.sqrt(Math.max(0, 1 - (x / 33) ** 2)) : Math.cos((x / 42) * (Math.PI / 2)) ** 0.8;
      const half = 15 * k;
      for (let y = half * 0.34; y <= half; y++) put(X + x, Y + y, Math.round(y) % 3 === 0 ? LINE : BELLY);
    }
  });
  // the flipper, a little smile, a big sparkling eye, a blush
  creature(p, () => ellipse(X - 2, Y + 15, 8, 4, BACK), DARK);
  creature(p, () => {
    ellipse(X - 22, Y - 1, 2.6, 2.6, DARK);
    put(X - 23, Y - 2, EYE); put(X - 22, Y - 2, EYE);
    for (const [x, y] of [[-30, 4], [-28, 5], [-26, 6], [-24, 6], [-22, 6], [-20, 5]]) put(X + x, Y + y, DARK);
    for (const [x, y] of [[-16, 2], [-15, 2], [-14, 2], [-16, 3], [-15, 3], [-14, 3]]) put(X + x, Y + y, BLUSH);
    // barnacles
    for (const [x, y] of [[-14, -11], [-9, -12], [-11, -9]]) put(X + x, Y + y, LINE);
  });
  // the spout, in two arcs of drops
  creature(p, () => {
    for (const side of [-1, 1]) for (let i = 0; i < 6; i++) put(X - 19 + side * i * 1.1, Y - 19 - i * 2 + i * i * 0.28, hex("#b8e8ea")); 
  });
}

function squid(p, X, Y) {
  const BODY = hex("#3a3f6a"), HI = hex("#565c8e"), DARK = hex("#141a30"), EYE = hex("#e8ffff");
  creature(p, () => {
    // curling arms under the round mantle
    for (let a = 0; a < 6; a++) {
      const off = (a - 2.5) * 3, curl = a % 2 ? 1 : -1;
      for (let i = 0; i < 20; i++) {
        const c = Math.sin(i * 0.42 + a) * Math.min(4, i * 0.3) * curl;
        put(X + off + c, Y + 8 + i, BODY); put(X + off + c + 1, Y + 8 + i, i < 12 ? BODY : HI);
      }
    }
    ellipse(X, Y - 3, 10, 13, BODY);
    ellipse(X - 3, Y - 7, 4, 5, HI);
    // the fins on top
    ellipse(X - 8, Y - 13, 5, 3, BODY); ellipse(X + 8, Y - 13, 5, 3, BODY);
  }, DARK);
  creature(p, () => {
    for (const dx of [-4, 4]) { ellipse(X + dx, Y + 2, 2.2, 2.2, DARK); put(X + dx - 1, Y + 1, EYE); }
    for (const [x, y] of [[-1, 6], [0, 7], [1, 6]]) put(X + x, Y + y, DARK);
  });
}

function manta(p, X, Y) {
  const BODY = hex("#1e4a5c"), HI = hex("#2c6474"), PALE = hex("#7fb4b8"), DARK = hex("#0a2632"), EYE = hex("#e8ffff");
  creature(p, () => {
    for (let x = -24; x <= 24; x++) {
      const k = 1 - Math.abs(x) / 25, up = 8 * k ** 0.7, down = 6 * k ** 1.3;
      for (let y = -up; y <= down; y++) put(X + x, Y + y + Math.abs(x) * 0.18, y < -up * 0.2 ? HI : BODY);
    }
    // the horns and the tail
    ellipse(X - 4, Y - 9, 1.6, 2.6, BODY); ellipse(X + 4, Y - 9, 1.6, 2.6, BODY);
    for (let i = 0; i < 14; i++) put(X + Math.sin(i * 0.5) * 1.5, Y + 6 + i, BODY);
  }, DARK);
  creature(p, () => {
    ellipse(X, Y + 1, 7, 4, PALE);
    for (const dx of [-5, 5]) { ellipse(X + dx, Y - 3, 1.6, 1.6, DARK); put(X + dx, Y - 4, EYE); }
    for (const [x, y] of [[-2, 2], [-1, 3], [0, 3], [1, 3], [2, 2]]) put(X + x, Y + y, DARK);
  });
}

function shark(p, X, Y) {
  const BACK = hex("#2c4a5a"), MID = hex("#3e6272"), BELLY = hex("#a4c0c4"), DARK = hex("#0e2029"), EYE = hex("#e8ffff");
  creature(p, () => {
    for (let x = -15; x <= 15; x++) {
      const k = x < 0 ? Math.sqrt(Math.max(0, 1 - (x / 15) ** 2)) : Math.max(0.2, 1 - (x / 16) ** 1.6);
      const half = 7 * k;
      for (let y = -half; y <= half; y++) put(X + x, Y + y, y > half * 0.3 ? BELLY : y < -half * 0.2 ? BACK : MID);
    }
    // a stubby dorsal fin, a flipper, a tail that belongs to the body
    for (let i = 0; i < 5; i++) for (let h = 0; h < 5 - i; h++) put(X - 2 + i, Y - 7 - h, BACK);
    ellipse(X - 3, Y + 7, 3, 2, BACK);
    ellipse(X + 17, Y - 3, 2, 4, BACK); ellipse(X + 17, Y + 3, 2, 3, BACK);
  }, DARK);
  creature(p, () => {
    ellipse(X - 9, Y - 2, 1.6, 1.6, DARK); put(X - 10, Y - 3, EYE);
    for (const [x, y] of [[-13, 2], [-11, 3], [-9, 3], [-7, 2]]) put(X + x, Y + y, DARK);
    for (const [x, y] of [[-11, 4], [-9, 4]]) put(X + x, Y + y, EYE);
  });
}

// a tiny round fish, facing right or left
function fish(p, x, y, dir, c, tail) {
  creature(p, () => {
    ellipse(x, y, 2.4, 1.6, c);
    put(x - dir * 3, y, tail); put(x - dir * 4, y - 1, tail); put(x - dir * 4, y + 1, tail);
    put(x + dir, y - 1, hex("#a8dcdc"));
  });
}

function schools(p) {
  // a stream arcing over the whale, heading right
  for (let i = 0; i < 26; i++) {
    const u = noise(i + 3), x = 62 + u * 74 + (noise(i + 300) - 0.5) * 8, y = 9 + Math.sin(u * 3) * 5 + (noise(i + 600) - 0.5) * 11;
    fish(p, x, y, 1, hex("#3a8a94"), hex("#2a6e78"));
  }
  // a bait ball, wheeling round its hollow middle, each one a dash along its circle
  creature(p, () => {
    const CX = 214, CY = 62;
    for (let i = 0; i < 190; i++) {
      const a = noise(i + 1) * Math.PI * 2, r = 5 + Math.sqrt(noise(i + 900)) * 13;
      const x = CX + Math.cos(a) * r * 1.3, y = CY + Math.sin(a) * r * 0.85, c = hex(i % 5 ? "#124852" : "#2c7480");
      put(x, y, c); put(x + Math.round(-Math.sin(a) * 1.2), y + Math.round(Math.cos(a) * 1), c);
    }
  });
}

function seabed(p) {
  const far = hex("#062a2f"), near = hex("#031a1d"), top = hex("#0c3a3e");
  creature(p, () => {
    for (let x = 0; x < W; x++) {
      const h = Math.round(84 + Math.sin(x * 0.045 + 1.3) * 5 + Math.sin(x * 0.13) * 1.5);
      for (let y = h; y < H; y++) put(x, y, far);
    }
  });
  creature(p, () => {
    for (let x = 0; x < W; x++) {
      const h = Math.round(90 + Math.sin(x * 0.07 + 4) * 3);
      put(x, h, top);
      for (let y = h + 1; y < H; y++) put(x, y, near);
    }
  });
  // kelp in clumps, waving, with round leaves
  creature(p, () => {
    for (const [x0, tall, ph] of [[6, 30, 0], [11, 22, 2], [66, 18, 1], [71, 26, 3], [104, 14, 2], [176, 20, 4], [181, 30, 1], [236, 34, 2], [243, 24, 0], [249, 30, 5]]) {
      for (let i = 0; i < tall; i++) {
        const x = x0 + Math.sin(i * 0.3 + ph) * 2.4;
        put(x, 92 - i, near); put(x + 1, 92 - i, hex("#0a4034"));
        if (i % 5 === 3) ellipse(x + (i % 2 ? 3 : -2), 92 - i, 2, 1, hex("#0a4034"));
      }
    }
  });
}

function bubbles(p) {
  creature(p, () => {
    for (let i = 0; i < 26; i++) {
      const x = Math.floor(noise(i + 5) * W), y = Math.floor(noise(i + 505) * 84), big = i % 6 === 0;
      if (big) {
        for (const [a, b] of [[0, -2], [1, -2], [-1, -1], [2, -1], [-1, 0], [2, 0], [0, 1], [1, 1]]) put(x + a, y + b, hex("#2f8a92"));
        put(x, y - 1, hex("#8fd0d4"));
      } else put(x, y, i % 2 ? hex("#2f8a92") : hex("#1d6a72"));
    }
  });
}

export function draw(p) {
  water(p);
  seabed(p);
  bubbles(p);
  squid(p, 32, 40);
  manta(p, 222, 20);
  schools(p);
  shark(p, 66, 64);
  whale(p, 130, 48);
}
