#!/usr/bin/env node
// Bakes a pixelfx effect into per-frame PNGs under assets/fx/<name>/, cropped to what the effect ever paints,
// with a meta.json the hook reads: fps, frame count and the terminal cells the picture fills.
//
//   node tools/bake-fx.mjs <pixelfx checkout> fire/meteor [--from 0] [--to 2] [--fps 12.5] [--name meteor] [--opts JSON]
//     [--max 28x7] [--out <mod>/assets/fx]
//
// --from/--to keep only that window of the effect, in seconds; --max caps the cells it fills; --out bakes into
// another mod's assets (default: this mod's assets/fx). pixelfx: https://github.com/patch-gg/pixelfx (MIT).
// The frames are rendered on a transparent ground.

import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

// A terminal cell is about 8x18 px; the burst fits a box this many cells at most, keeping its aspect.
const CELL = [8, 18]
const DEFAULT_MAX_CELLS = [28, 7]

const [root, id, ...rest] = process.argv.slice(2)
if (!root || !id) {
  console.error('usage: node tools/bake-fx.mjs <pixelfx checkout> <category/name> [--from S] [--to S] [--fps N] [--name NAME] [--opts JSON] [--max CxR] [--out DIR]')
  process.exit(1)
}
const flags = {}
for (let i = 0; i < rest.length; i += 2) flags[rest[i].replace(/^--/, '')] = rest[i + 1]

const lib = await import(pathToFileURL(join(resolve(root), 'tools/lib/fxlib.mjs')).href)
const { encodePNG } = await import(pathToFileURL(join(resolve(root), 'tools/lib/png.mjs')).href)

const fx = await lib.loadEffect(id)
const r = lib.renderFrames(fx, {
  fps: flags.fps ? +flags.fps : 12.5,
  bg: 'none',
  actor: false,
  options: flags.opts ? JSON.parse(flags.opts) : undefined,
})
const from = +(flags.from ?? 0), to = +(flags.to ?? Infinity)
const frames = r.frames.filter(f => f.t >= from - 1e-9 && f.t <= to + 1e-9)
if (frames.length === 0) throw new Error(`${id}: no frames between ${from}s and ${to}s`)

// The union of every kept frame's painted pixels, so the picture keeps one size and one anchor throughout.
let x0 = r.w, y0 = r.h, x1 = -1, y1 = -1
for (const f of frames)
  for (let y = 0; y < r.h; y++)
    for (let x = 0; x < r.w; x++)
      if (f.clear[(y * r.w + x) * 4 + 3] > 8) {
        x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y)
      }
if (x1 < 0) throw new Error(`${id} paints nothing`)
const w = x1 - x0 + 1, h = y1 - y0 + 1
const MAX_CELLS = flags.max ? flags.max.split('x').map(Number) : DEFAULT_MAX_CELLS
const k = Math.min((MAX_CELLS[0] * CELL[0]) / w, (MAX_CELLS[1] * CELL[1]) / h)
const cells = [Math.max(1, Math.round((w * k) / CELL[0])), Math.max(1, Math.round((h * k) / CELL[1]))]

const name = flags.name ?? id.split('/')[1]
const out = join(flags.out ? resolve(flags.out) : join(dirname(fileURLToPath(import.meta.url)), '..', 'assets', 'fx'), name)
rmSync(out, { recursive: true, force: true })
mkdirSync(out, { recursive: true })
frames.forEach((f, i) => {
  const crop = new Uint8Array(w * h * 4)
  for (let y = 0; y < h; y++) crop.set(f.clear.subarray(((y + y0) * r.w + x0) * 4, ((y + y0) * r.w + x1 + 1) * 4), y * w * 4)
  writeFileSync(join(out, `${i}.png`), encodePNG(w, h, crop))
})
writeFileSync(join(out, 'meta.json'), JSON.stringify({ id, fps: r.fps, frames: frames.length, size: [w, h], cells }) + '\n')
console.log(`${id} -> ${name}: ${frames.length} frames, ${w}x${h} px, ${cells[0]}x${cells[1]} cells`)
