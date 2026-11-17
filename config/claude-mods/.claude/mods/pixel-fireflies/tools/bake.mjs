// Bakes pixelfx weather/fireflies into hooks/scene.ts: one animated vector SVG for the desktop backdrop.
//
//   node tools/bake.mjs [preview.svg]
//
// Desktop drops raster inside a scene and caps it at 131072 characters, and frame-by-frame fireflies is ~30x
// over that. So pixelfx runs here at bake time only: the meadow is one static frame (a path per color), and
// each firefly is a tiny pixel sprite whose path and glow rhythm come from pixelfx's own fly(), played back by
// CSS keyframes (step-end keeps it on the pixel grid). pixelfx (https://github.com/patch-gg/pixelfx, MIT) is
// cloned to $PIXELFX_DIR (default ~/.cache/pixelfx) on first use.
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, "../hooks/scene.ts");
const LIMIT = 125_000; // desktop refuses a scene over 131072; keep headroom
const PIXELFX = process.env.PIXELFX_DIR ?? join(homedir(), ".cache/pixelfx");

if (!existsSync(PIXELFX)) execFileSync("git", ["clone", "--depth", "1", "https://github.com/patch-gg/pixelfx", PIXELFX], { stdio: "inherit" });
const SRC = join(PIXELFX, "src");

// The effect, minus what the bake draws itself: no night haze (the scene paints its own sky), fly() exported,
// the meadow drawn without fireflies so no blade tip is lit in the static frame.
function partsModule() {
  const core = pathToFileURL(join(SRC, "core/index.js")).href, lib = pathToFileURL(join(SRC, "fx/weather/_lib.js")).href;
  const swaps = [
    [/"\.\.\/\.\.\/core\/index\.js"/, `"${core}"`],
    [/"\.\/_lib\.js"/, `"${lib}"`],
    [/\n  rows\(p, meta, -170[\s\S]*?\n  \}\);/, ""],
    [/^function fly\(/m, "export function fly("],
    [/grass\(q, t, S, G, C, flies, (false|true)\)/g, "grass(q, t, S, G, C, [], $1)"],
    [/^  for \(const f of flies\) if \(f\.depth.*$/gm, ""],
  ];
  let src = readFileSync(join(SRC, "fx/weather/fireflies.js"), "utf8");
  for (const [re, to] of swaps) {
    const next = src.replace(re, to);
    if (next === src) throw new Error(`pixelfx fireflies.js changed: ${re} no longer matches`);
    src = next;
  }
  const dir = mkdtempSync(join(tmpdir(), "pixel-fireflies-"));
  writeFileSync(join(dir, "fireflies.mjs"), src);
  return dir;
}

const { createFrame, createFx, composite, fit, toHex, mix, WHITE } = await import(pathToFileURL(join(SRC, "core/index.js")).href);
// Once imported the module lives in memory, so its folder goes right away, even if the import fails.
const partsDir = partsModule();
const mod = await import(pathToFileURL(join(partsDir, "fireflies.mjs")).href).finally(() => rmSync(partsDir, { recursive: true, force: true }));

const { meta } = mod;
const [W, H] = meta.size, [OX, OY] = meta.origin, D = meta.duration;
const opts = { ...meta.options };
const RAMP = fit(opts.palette, 6), C = RAMP.map(toHex);
const S = opts.seed;
const FLIES = 32;
// far flies are dim and slow: sample them less often
const SAMPLE_HZ = [5, 8, 10];
const num = (n, d = 2) => String(+n.toFixed(d)).replace(/^0\./, ".").replace(/^-0\./, "-.");

// --- meadow: one static frame, vertical runs per color (blades are 1px columns) ---
function meadow() {
  const fx = createFx(mod, { x: OX, y: OY });
  const frame = createFrame(W, H), img = new Uint8ClampedArray(W * H * 4);
  fx.draw(frame);
  composite(frame, img, null);
  const byColor = new Map();
  const same = (a, b) => img[a] === img[b] && img[a + 1] === img[b + 1] && img[a + 2] === img[b + 2];
  for (let x = 0; x < W; x++) {
    for (let y = 0; y < H; ) {
      const j = (y * W + x) * 4;
      if (img[j + 3] < 128) { y++; continue; }
      let y2 = y + 1;
      while (y2 < H && img[(y2 * W + x) * 4 + 3] >= 128 && same((y2 * W + x) * 4, j)) y2++;
      const c = "#" + [0, 1, 2].map((k) => img[j + k].toString(16).padStart(2, "0")).join("");
      if (!byColor.has(c)) byColor.set(c, []);
      byColor.get(c).push(`M${x + 0.5} ${y}v${y2 - y}`);
      y = y2;
    }
  }
  return [...byColor].map(([c, d]) => `<path stroke="${c}" d="${d.join("")}"/>`).join("");
}

// --- sprites ---
const px = (x, y, w = 1) => `M${x} ${y + 0.5}h${w}`;
function disc(r) {
  const rows = [];
  for (let dy = -r; dy <= r; dy++) {
    const w = Math.floor(Math.sqrt(r * r - dy * dy) + 0.5);
    rows.push(px(-w, dy, 2 * w + 1));
  }
  return rows.join("");
}

// pixelfx's glow is additive light of k * (1 - d/r)^2. Stack `bands` stepped discs whose summed opacity follows
// that curve at each band's midpoint; bands too faint to see are left out. Each (color, opacity) is a class.
const strokeClasses = new Map();
function cls(color, opacity) {
  const key = `${color} ${opacity}`;
  if (!strokeClasses.has(key)) strokeClasses.set(key, `s${strokeClasses.size}`);
  return strokeClasses.get(key);
}
function halo(r, color, k, bands) {
  // disc i spans bands i..bands-1, so band i's light is the sum of discs 0..i
  const out = [];
  let lit = 0;
  for (let i = 0; i < bands; i++) {
    const add = +num(k * ((i + 0.5) / bands) ** 2 - lit, 2); // band i sits at d = 1 - (i + .5) / bands
    const radius = Math.round(r * (1 - i / bands));
    if (add < 0.02 || radius < 1) continue;
    lit += add;
    out.push(`<path class="${cls(color, num(add))}" d="${disc(radius)}"/>`);
  }
  return out.join("");
}
const dot = (color, d, op = 1) => `<path class="${cls(color, num(op))}" d="${d}"/>`;

const wing = toHex(mix(RAMP[1], WHITE, 0.4));
function sprite(depth) {
  if (depth === 0) return { body: "", glow: halo(6, C[2], 0.45, 2) + dot(C[4], px(0, 0)) };
  if (depth === 1)
    return { body: dot(C[1], px(0, 0)), glow: halo(9, C[2], 0.5, 3) + halo(3, C[4], 0.5, 2) + dot(C[5], px(0, 0)) + dot(C[2], px(0, 1)) };
  return {
    body: dot(C[0], px(1, 0, 2)) + dot(wing, px(0, -1, 2), 0.7) + dot(C[1], px(-1, 0, 2)),
    glow:
      halo(28, C[2], 0.45, 5) + halo(10, C[4], 0.5, 3) + halo(4, C[5], 0.5, 2) +
      dot(C[5], px(0, 0)) + dot(C[4], px(-1, 0)) + dot(C[3], px(-1, 1)),
  };
}

// --- flies ---
const css = [
  "path{fill:none;stroke-width:1}",
  // glow adds light the way pixelfx's light buffer does
  ".g{opacity:0;mix-blend-mode:plus-lighter;animation:p 1s linear infinite}",
  ".h{animation-name:q}",
  // pixelfx's pulse: quick rise, hold, slow fade, dark; some flash twice
  "@keyframes p{0%{opacity:0}6%,14%{opacity:1}40%,100%{opacity:0}}",
  "@keyframes q{0%{opacity:0}6%,14%{opacity:1}22%{opacity:.69}28%,36%{opacity:.8}62%,100%{opacity:0}}",
];
const layers = [[], [], []];
for (let i = 0; i < FLIES; i++) {
  const f = mod.fly(S, i, 0), R = f.R;
  const per = D / (3 + Math.floor(R(9) * 4)), two = R(11) < 0.35;
  const hz = SAMPLE_HZ[f.depth], n = D * hz;
  const kf = [];
  let last = "";
  for (let s = 0; s <= n; s++) {
    const [x, y] = f.pos(s / hz);
    const v = `${Math.round(x) + OX}px ${Math.round(y) + OY}px`;
    if (v === last && s !== n) continue;
    last = v;
    kf.push(`${num((s / n) * 100, 1)}%{translate:${v}}`);
  }
  css.push(`@keyframes m${i}{${kf.join("")}}`);
  css.push(`.f${i}{animation:m${i} ${D}s step-end infinite}.f${i} .g{animation-duration:${num(per)}s;animation-delay:-${num(R(10) * per)}s}`);
  const sp = sprite(f.depth);
  layers[f.depth].push(`<g class="f${i}">${sp.body}<g class="g${two ? " h" : ""}">${sp.glow}</g></g>`);
}

// --- night sky: stepped bands, dark at the top ---
const SKY = ["#04070b", "#050a0d", "#060c0f", "#070f10", "#081211", "#0a1612", "#0c1a13", "#0f1f16", "#12251a"];
const sky = SKY.map((c, k) => `<rect y="${k * 20}" width="${W}" height="20" fill="${c}"/>`).join("");

const meadowPaths = meadow();
for (const [key, name] of strokeClasses) {
  const [color, op] = key.split(" ");
  css.push(`.${name}{stroke:${color}${op === "1" ? "" : `;stroke-opacity:${op}`}}`);
}

// far flies behind the meadow, near ones in front of it (as pixelfx layers them)
const svg =
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMax slice" shape-rendering="crispEdges">` +
  `<style>${css.join("")}</style>${sky}${layers[0].join("")}${layers[1].join("")}${meadowPaths}${layers[2].join("")}</svg>`;

if (svg.length > LIMIT) {
  console.error(`scene is ${svg.length} characters, over ${LIMIT}`);
  process.exit(1);
}
writeFileSync(
  OUT,
  "// Generated by tools/bake.mjs from pixelfx weather/fireflies (MIT, patch-gg/pixelfx; the firefly is adapted\n" +
    "// from Sprite Fusion's open-source fireflies by Hugo Duprez). Do not edit by hand.\n" +
    `export const SCENE = ${JSON.stringify(svg)}\n`,
);
if (process.argv[2]) writeFileSync(process.argv[2], svg);
console.log(`scene.ts: ${svg.length} characters`);
