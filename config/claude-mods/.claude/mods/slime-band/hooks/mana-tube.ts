// The context window as a crystal tube of mana set in the soil under the slime's grass, a cross-section of the
// ground it hops on: each /context category a layer of
// liquid in its own colour, the empty glass beyond, and a red rune where auto-compaction runs, the buffer past
// it hatched off. The surface ripples, bubbles rise while Claude works, and the liquid flushes red near the rune.

import type { ContextInfo } from '../types'
import { allocateCells, manaLevel } from './context-bar'
import { hexOf, liquidOf } from './liquids'

// Three terminal rows of half blocks: six pixels, the rims and four of liquid.
export const TUBE_ROWS = 3
const HEIGHT = TUBE_ROWS * 2
// Ticks each step of the ripple and the bubbles holds.
export const TUBE_TICKS = 3

const GLASS = 0x8fa6cf
const GLASS_DARK = 0x4a5878
const EMPTY = 0x161b2a
const EMPTY_SHINE = 0x2a3350
const RUNE = 0xff3b3b
const RUNE_GLOW = 0xffa0a0
const HATCH = 0x6a1c28
const BUFFER = 0x24141c
const BUBBLE = 0xe6f6ff
const FOAM = 0xbfe0ff
const DANGER = 0xff3b3b

const scale = (color: number, k: number): number => {
  const channel = (shift: number) => Math.min(255, Math.round(((color >> shift) & 0xff) * k)) << shift
  return channel(16) | channel(8) | channel(0)
}

const mix = (a: number, b: number, share: number): number => {
  const channel = (shift: number) => Math.round(((a >> shift) & 0xff) * (1 - share) + ((b >> shift) & 0xff) * share) << shift
  return channel(16) | channel(8) | channel(0)
}

const noise = (k: number): number => {
  let hash = Math.imul(k + 1, 374761393)
  hash = Math.imul(hash ^ (hash >>> 13), 1274126177)
  return ((hash ^ (hash >>> 16)) >>> 0) / 4294967296
}

type Column = { kind: 'used' | 'free' | 'buffer'; color: number }

// What fills each column inside the glass, left to right, as /context orders its rows.
export const tubeColumns = (info: ContextInfo, inner: number): Column[] => {
  const slices = info.slices.filter(s => s.kind !== 'deferred' && s.tokens > 0)
  const cells = allocateCells(slices, inner)
  const columns: Column[] = []
  slices.forEach((s, at) => {
    const kind = s.kind === 'free' || s.kind === 'buffer' ? s.kind : 'used'
    for (let n = 0; n < (cells[at] ?? 0); n += 1) columns.push({ kind, color: liquidOf(s.name) })
  })
  return columns
}

// The tube `width` pixels wide at animation `tick`: a colour per pixel, undefined outside the rounded glass.
export const tubePixels = (info: ContextInfo, width: number, tick: number, isWorking: boolean): (number | undefined)[][] => {
  const inner = Math.max(0, width - 2)
  const columns = tubeColumns(info, inner)
  const step = Math.floor(tick / TUBE_TICKS)
  const isCritical = manaLevel(info) === 'critical'
  // Near the rune the liquid flushes red every other step.
  const flush = isCritical && step % 2 === 0 ? 0.5 : 0
  const surface = columns.reduce((last, column, at) => (column.kind === 'used' ? at : last), -1)
  const rune = columns.findIndex(column => column.kind === 'buffer')
  const pixels: (number | undefined)[][] = Array.from({ length: HEIGHT }, () => Array.from({ length: width }, () => undefined))
  const set = (x: number, y: number, color: number) => {
    const row = pixels[y]
    if (row !== undefined && x >= 0 && x < width) row[x] = color
  }

  // The glass: rounded rims above and below, the ends between.
  for (let x = 1; x < width - 1; x += 1) {
    set(x, 0, GLASS)
    set(x, HEIGHT - 1, GLASS_DARK)
  }
  for (let y = 1; y < HEIGHT - 1; y += 1) {
    set(0, y, GLASS)
    set(width - 1, y, GLASS_DARK)
  }

  columns.forEach((column, at) => {
    const x = at + 1
    for (let y = 1; y < HEIGHT - 1; y += 1) {
      if (column.kind === 'free') {
        // Empty glass, a line of reflection along its top.
        set(x, y, y === 1 ? EMPTY_SHINE : EMPTY)
      } else if (column.kind === 'buffer') {
        set(x, y, (x + y) % 3 === 0 ? HATCH : BUFFER)
      } else {
        const base = flush > 0 ? mix(column.color, DANGER, flush) : column.color
        // Lit along the top, shaded along the bottom, so the liquid reads round.
        const shade = y === 1 ? 1.3 : y === HEIGHT - 2 ? 0.68 : 1
        set(x, y, scale(base, shade))
      }
    }
  })

  // The surface sloshes: its last two columns take turns dipping under a fleck of foam, and every other step
  // the liquid runs a column on along the bottom of the empty glass.
  if (surface >= 0) {
    const dip = step % 2 === 0 ? surface : surface - 1
    if (dip >= 0) {
      set(dip + 1, 1, EMPTY_SHINE)
      set(dip + 1, 2, FOAM)
    }
    const color = columns[surface]?.color ?? FOAM
    if (step % 2 === 1 && columns[surface + 1]?.kind === 'free') {
      set(surface + 2, HEIGHT - 3, FOAM)
      set(surface + 2, HEIGHT - 2, scale(color, 0.68))
    }
  }

  // Bubbles rise through the liquid while Claude works, a few per stretch of it.
  if (isWorking && surface > 2) {
    const count = Math.max(1, Math.floor(surface / 10))
    for (let k = 0; k < count; k += 1) {
      const x = 1 + Math.floor(noise(k) * surface)
      const y = HEIGHT - 2 - Math.floor((step + k * 3) % (HEIGHT - 2))
      if (columns[x - 1]?.kind === 'used') set(x, y, BUBBLE)
    }
  }

  // The rune where auto-compaction runs, through both rims; it glows while the mana nears it.
  if (rune >= 0) {
    const glow = isCritical && step % 2 === 1 ? RUNE_GLOW : RUNE
    for (let y = 0; y < HEIGHT; y += 1) set(rune + 1, y, glow)
  }
  return pixels
}

// The soil the tube is set in, a few shades by position so it reads as earth.
const SOIL = [0x8d5a2b, 0x8d5a2b, 0x6d4220, 0x8d5a2b, 0x7a4b24]
export const soilAt = (x: number, y: number): number => SOIL[(x * 3 + y * 2) % SOIL.length]!

// The ground under the grass, `width` pixels across: the tube with a column of soil at either end, and soil
// where its rounded corners leave the glass.
export const groundPixels = (info: ContextInfo, width: number, tick: number, isWorking: boolean): number[][] => {
  const tube = tubePixels(info, Math.max(0, width - 2), tick, isWorking)
  return Array.from({ length: HEIGHT }, (_, y) =>
    Array.from({ length: width }, (_, x) => (x === 0 || x === width - 1 ? undefined : tube[y]?.[x - 1]) ?? soilAt(x, y)),
  )
}

// Frames of the ground for a surface that animates SVG itself: one step of the ripple each.
export const GROUND_FRAMES = 4

// The ground's frames as SVG shown in turn by SMIL, `top` CSS pixels down; `px` CSS pixels per pixel.
export const groundSvg = (info: ContextInfo, width: number, isWorking: boolean, px: number, frameMs: number, top: number): string => {
  const frames = Array.from({ length: GROUND_FRAMES }, (_, frame) => groundPixels(info, width, frame * TUBE_TICKS, isWorking))
  const rects = (pixels: number[][]) =>
    pixels
      .map((row, y) => {
        let out = ''
        let x = 0
        while (x < row.length) {
          const color = row[x]
          let end = x + 1
          while (end < row.length && row[end] === color) end += 1
          out += `<rect x="${x * px}" y="${top + y * px}" width="${(end - x) * px}" height="${px}" fill="${hexOf(color ?? 0)}"/>`
          x = end
        }
        return out
      })
      .join('')
  const cycle = GROUND_FRAMES * frameMs
  return frames
    .map((frame, at) => {
      const values = Array.from({ length: GROUND_FRAMES }, (_, n) => (n === at ? 'visible' : 'hidden')).join(';')
      return (
        `<g visibility="${at === 0 ? 'visible' : 'hidden'}">` +
        `<animate attributeName="visibility" values="${values}" calcMode="discrete" dur="${cycle}ms" repeatCount="indefinite"/>` +
        `${rects(frame)}</g>`
      )
    })
    .join('')
}
