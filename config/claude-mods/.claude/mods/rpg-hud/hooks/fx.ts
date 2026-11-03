import type { EngineInterface } from 'claude-code'

import { FRAME_MS } from './anim'

// Pixel-art bursts for the HUD's big moments (a level up, a revive, a boss appearing, enraged or slain, a pet
// summoned or back), where the terminal draws pictures: pixelfx effects (https://github.com/patch-gg/pixelfx, MIT)
// baked by rpg-battle's tools/bake-fx.mjs at one frame per animation tick into assets/fx/<name>/. See
// assets/fx/NOTICE.md.

export type BurstName = 'level-up' | 'revive' | 'confetti' | 'poof' | 'sparkle' | 'boss-appear' | 'boss-enrage'

// A baked burst: every frame as PNG base64 and the cells it fills.
export type Burst = { frames: string[]; columns: number; rows: number }

// Read once each. A failed read is not kept: the next moment tries again, and a missing burst costs the moment
// its picture, never the pane.
const bursts = new Map<BurstName, Burst>()

export async function loadBurst($: EngineInterface, name: BurstName): Promise<Burst | undefined> {
  const known = bursts.get(name)
  if (known !== undefined) return known
  const dir = `${$.plugin.root}/assets/fx/${name}`
  const burst = await $.fs
    .read(`${dir}/meta.json`)
    .then(async text => {
      const meta = JSON.parse(text) as { frames: number; cells: [number, number] }
      const frames = await Promise.all(
        Array.from({ length: meta.frames }, async (_, n) => (await $.fs.read(`${dir}/${n}.png`, { as: 'bytes' })).base64),
      )
      return { frames, columns: meta.cells[0], rows: meta.cells[1] }
    })
    .catch(() => undefined)
  if (burst !== undefined) bursts.set(name, burst)
  return burst
}

// How long a burst plays: a frame a tick.
export const burstMs = (burst: Burst): number => burst.frames.length * FRAME_MS

// The frame `elapsed` ms in, the last held past the end.
export const burstFrame = (burst: Burst, elapsed: number): string =>
  burst.frames[Math.max(0, Math.min(burst.frames.length - 1, Math.floor(elapsed / FRAME_MS)))]!

export const isPlaying = (burst: Burst, elapsed: number): boolean => elapsed >= 0 && elapsed < burstMs(burst)

// Where the terminal draws no pictures, a burst over the arena plays as half-block cells baked beside its frames
// (raster-<C>x<R>.json), laid onto the boss's own cells: Raster cells hide what is under them, so a burst's blank
// cells leave the boss showing through.
export type RasterBurst = { frames: string[]; columns: number; rows: number }

// The sizes the arena's bursts are baked in, largest first: the arena at twice the monster's size, then at its own.
export const ARENA_RASTERS: ReadonlyArray<readonly [number, number]> = [
  [24, 10],
  [12, 5],
]

const rasters = new Map<string, RasterBurst>()

export async function loadRasterBurst($: EngineInterface, name: BurstName, columns: number, rows: number): Promise<RasterBurst | undefined> {
  const id = `${name}:${columns}x${rows}`
  const known = rasters.get(id)
  if (known !== undefined) return known
  const raster = await $.fs
    .read(`${$.plugin.root}/assets/fx/${name}/raster-${columns}x${rows}.json`)
    .then(text => JSON.parse(text) as RasterBurst)
    .catch(() => undefined)
  if (raster !== undefined) rasters.set(id, raster)
  return raster
}

const SPACE = 0x20
const DEFAULT_COLOR = 0x01000000

const toWords = (cells: string): Uint32Array => {
  const bytes = Uint8Array.from(atob(cells), ch => ch.charCodeAt(0))
  return new Uint32Array(bytes.buffer, 0, Math.floor(bytes.length / 4))
}

const fromWords = (words: Uint32Array): string => {
  const bytes = new Uint8Array(words.buffer, words.byteOffset, words.length * 4)
  let text = ''
  for (let at = 0; at < bytes.length; at += 0x8000) text += String.fromCharCode(...bytes.subarray(at, at + 0x8000))
  return btoa(text)
}

const UPPER = 0x2580
const LOWER = 0x2584

// The two pixels of a half-block cell, top then bottom (undefined: the default background); a cell of any other
// glyph is not split.
const halves = (cell: ArrayLike<number>): [number | undefined, number | undefined] | undefined => {
  const color = (rgb: number) => (rgb === DEFAULT_COLOR ? undefined : rgb)
  if (cell[0] === SPACE) return [color(cell[2]!), color(cell[2]!)]
  if (cell[0] === UPPER) return [color(cell[1]!), color(cell[2]!)]
  if (cell[0] === LOWER) return [color(cell[2]!), color(cell[1]!)]
  return undefined
}

// A burst's cell on the base's: a half the burst leaves empty shows the base's half there.
const mergeCell = (over: ArrayLike<number>, under: ArrayLike<number>): number[] => {
  const top = halves(over), bottom = halves(under)
  if (top === undefined || bottom === undefined) return Array.from(over)
  const upper = top[0] ?? bottom[0], lower = top[1] ?? bottom[1]
  if (upper === undefined && lower === undefined) return [SPACE, DEFAULT_COLOR, DEFAULT_COLOR]
  if (upper === undefined) return [LOWER, lower!, DEFAULT_COLOR]
  return [UPPER, upper, lower ?? DEFAULT_COLOR]
}

// `over` (overColumns wide) laid onto `base` (columns wide) with its top-left cell at (left, top); a blank cell of
// `over` (a space on the default background) keeps the base's, and what falls outside the base is cut.
export const overlayCells = (base: string, columns: number, over: string, overColumns: number, left: number, top: number): string => {
  const out = toWords(base).slice()
  const rows = out.length / 3 / columns
  const layer = toWords(over)
  const overRows = layer.length / 3 / overColumns
  for (let y = 0; y < overRows; y += 1)
    for (let x = 0; x < overColumns; x += 1) {
      const from = (y * overColumns + x) * 3
      if (layer[from] === SPACE && layer[from + 2] === DEFAULT_COLOR) continue
      const bx = left + x, by = top + y
      if (bx < 0 || by < 0 || bx >= columns || by >= rows) continue
      const to = (by * columns + bx) * 3
      out.set(mergeCell(layer.subarray(from, from + 3), out.subarray(to, to + 3)), to)
    }
  return fromWords(out)
}
