// Baked frames as Raster cells for terminals that draw no pictures: half blocks, a cell two pixels tall (each
// about 8x9 px), the picture kept to its aspect, centred and standing on the bottom row.
// Shared by bake-fx.mjs (--raster) and raster-fx.mjs (frames already baked).

import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { inflateSync } from 'node:zlib'

// A terminal cell is about 8x18 px.
const CELL = [8, 18]
const DEFAULT_COLOR = 0x01000000
const UPPER = 0x2580, LOWER = 0x2584
// A pixel is drawn once this much of the area it stands for is painted; light-made bursts (a flash, sparks) take less.
export const COVERAGE = 0.3

// `frames` (w x h RGBA each) as packed cells of `C` x `R`: base64 of little-endian u32 [codePoint, foreground,
// background] per cell, 0x01000000 the terminal's default colour.
export function rasterize(frames, w, h, C, R, coverage = COVERAGE) {
  // Kept to what it will draw: the union of pixels solid enough to count, not the faint glow around them.
  let x0 = w, y0 = h, x1 = -1, y1 = -1
  for (const rgba of frames)
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++)
        if (rgba[(y * w + x) * 4 + 3] >= coverage * 255) {
          x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y)
        }
  if (x1 < 0) [x0, y0, x1, y1] = [0, 0, w - 1, h - 1]
  const rw = x1 - x0 + 1, rh = y1 - y0 + 1
  const k = Math.min((C * CELL[0]) / rw, (2 * R * (CELL[1] / 2)) / rh)
  const dw = Math.min(C, Math.max(1, Math.round((rw * k) / CELL[0])))
  const dh = Math.min(2 * R, Math.max(1, Math.round((rh * k) / (CELL[1] / 2))))
  const ox = Math.floor((C - dw) / 2), oy = 2 * R - dh

  return frames.map(rgba => {
    const pixel = (tx, ty) => {
      const x = tx - ox, y = ty - oy
      if (x < 0 || y < 0 || x >= dw || y >= dh) return undefined
      const sx0 = x0 + Math.floor((x * rw) / dw), sx1 = Math.max(sx0 + 1, x0 + Math.floor(((x + 1) * rw) / dw))
      const sy0 = y0 + Math.floor((y * rh) / dh), sy1 = Math.max(sy0 + 1, y0 + Math.floor(((y + 1) * rh) / dh))
      let a = 0, rr = 0, gg = 0, bb = 0, n = 0
      for (let yy = sy0; yy < sy1; yy++)
        for (let xx = sx0; xx < sx1; xx++) {
          const at = (yy * w + xx) * 4, alpha = rgba[at + 3]
          a += alpha; rr += rgba[at] * alpha; gg += rgba[at + 1] * alpha; bb += rgba[at + 2] * alpha; n += 1
        }
      if (a === 0 || a / (n * 255) < coverage) return undefined
      return (Math.round(rr / a) << 16) | (Math.round(gg / a) << 8) | Math.round(bb / a)
    }
    const words = new Uint32Array(C * R * 3)
    for (let cy = 0; cy < R; cy++)
      for (let cx = 0; cx < C; cx++) {
        const top = pixel(cx, 2 * cy), bottom = pixel(cx, 2 * cy + 1)
        const cell =
          top === undefined && bottom === undefined ? [0x20, DEFAULT_COLOR, DEFAULT_COLOR]
          : top === undefined ? [LOWER, bottom, DEFAULT_COLOR]
          : [UPPER, top, bottom ?? DEFAULT_COLOR]
        words.set(cell, (cy * C + cx) * 3)
      }
    return Buffer.from(words.buffer).toString('base64')
  })
}

// Writes raster-<C>x<R>.json ({ columns, rows, frames }) into `dir` for each size ("12x5").
export function writeRasters(dir, frames, w, h, sizes, coverage = COVERAGE) {
  for (const size of sizes) {
    const [C, R] = size.split('x').map(Number)
    const raster = { columns: C, rows: R, frames: rasterize(frames, w, h, C, R, coverage) }
    writeFileSync(join(dir, `raster-${C}x${R}.json`), JSON.stringify(raster) + '\n')
    console.log(`  raster ${C}x${R}: ${raster.frames.length} frames`)
  }
}

// An 8-bit RGBA, non-interlaced PNG (what bake-fx writes) as { w, h, rgba }.
export function decodePNG(bytes) {
  const w = bytes.readUInt32BE(16), h = bytes.readUInt32BE(20)
  if (bytes[24] !== 8 || bytes[25] !== 6 || bytes[28] !== 0) throw new Error('only 8-bit RGBA, non-interlaced PNGs')
  const idat = []
  for (let at = 8; at < bytes.length; ) {
    const length = bytes.readUInt32BE(at), type = bytes.toString('latin1', at + 4, at + 8)
    if (type === 'IDAT') idat.push(bytes.subarray(at + 8, at + 8 + length))
    at += 12 + length
  }
  const raw = inflateSync(Buffer.concat(idat))
  const stride = w * 4, rgba = new Uint8Array(w * h * 4)
  for (let y = 0; y < h; y++) {
    const filter = raw[y * (stride + 1)], line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1))
    for (let x = 0; x < stride; x++) {
      const left = x >= 4 ? rgba[y * stride + x - 4] : 0
      const up = y > 0 ? rgba[(y - 1) * stride + x] : 0
      const corner = x >= 4 && y > 0 ? rgba[(y - 1) * stride + x - 4] : 0
      const p = left + up - corner, pa = Math.abs(p - left), pb = Math.abs(p - up), pc = Math.abs(p - corner)
      const predictor =
        filter === 0 ? 0
        : filter === 1 ? left
        : filter === 2 ? up
        : filter === 3 ? (left + up) >> 1
        : pa <= pb && pa <= pc ? left : pb <= pc ? up : corner
      rgba[y * stride + x] = (line[x] + predictor) & 0xff
    }
  }
  return { w, h, rgba }
}
