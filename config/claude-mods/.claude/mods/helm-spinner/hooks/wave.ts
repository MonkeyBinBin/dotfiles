// The spinner's row, three tall: the sub and a sound wave in braille, which gives two by four dots a cell, thin enough for a line
// and sharp at any size, with one color a cell (the sub is drawn by hand, icons.ts); the dive's clock in a quiet pill; and status
// pills, a rounded block of color round a Nerd Font icon, which breathe, and flash at critical. All Raster cells, so they tick without a redraw;
// a Raster takes nothing past the Basic Multilingual Plane, which rules out Material icons here. Colors are themes/sub.json's.
import { ICON_ART } from './icons'

export type Motion = { ink: number; amplitude: number; speed: number; jitter: number }

// How the wave moves says what's going on: calm thinking, a working tool's big ragged swing, an alarm's fast red.
export const MOTION = {
  thinking: { ink: 0xf0d07a, amplitude: 2.2, speed: 0.1, jitter: 0.5 },
  requesting: { ink: 0x7ad8e8, amplitude: 3.2, speed: 0.2, jitter: 0.8 },
  responding: { ink: 0x5cff9a, amplitude: 4, speed: 0.24, jitter: 1 },
  'tool-input': { ink: 0xc89c48, amplitude: 3.4, speed: 0.2, jitter: 0.8 },
  'tool-use': { ink: 0x5ce8d0, amplitude: 5.2, speed: 0.3, jitter: 1.4 },
} as const satisfies Record<string, Motion>
export const ALARM: Motion = { ink: 0xff5a4a, amplitude: 5.5, speed: 0.6, jitter: 2 }

const GOLD = 0xf0d07a
const RED = 0xff5a4a
const DEFAULT_COLOR = 0x01000000
const WARN_AT = 70
const CRITICAL_AT = 90
const HULL_AT = 3

export const ROWS = 3
const WAVE_COLUMNS = 32
const CLOCK_TEXT_COLUMNS = 7 // 59m 59s, 12h 05m
const CLOCK_ROW = 1
const TICKS_A_FRAME = 3 // how long an icon holds each frame of its motion
const GAP = 1
const DOT_ROWS = ROWS * 4
const CENTER = (DOT_ROWS - 1) / 2

const BRAILLE = 0x2800
const DOTS = [[0x01, 0x08], [0x02, 0x10], [0x04, 0x20], [0x40, 0x80]] // [row][column]

export type Status = { op: string; hull: number; o2: number; fuel: number }

// Noise that holds still for a few ticks at a spot, then jumps: what makes a line look like a real signal.
function noiseAt(x: number, t: number) {
  const n = Math.sin(x * 127.1 + t * 311.7) * 43758.5453
  return (n - Math.floor(n)) * 2 - 1
}

// A swell that never quite repeats, as its frequencies share no common multiple, with bursts of ragged signal travelling along it.
export function waveAt(motion: Motion, x: number, tick: number) {
  const t = tick * motion.speed
  const swell = Math.sin(x * 0.19 - t) * 0.5 + Math.sin(x * 0.43 + t * 1.37) * 0.3 + Math.sin(x * 0.083 - t * 0.61) * 0.35
  const burst = Math.max(0, Math.sin(x * 0.11 - t * 0.83 + Math.sin(t * 0.29) * 2))
  const ragged = noiseAt(Math.floor(x / 2), Math.floor(tick / 2)) * motion.jitter * burst
  const y = CENTER + swell * motion.amplitude * (0.45 + 0.75 * burst) + ragged
  return Math.max(0, Math.min(DOT_ROWS - 1, Math.round(y)))
}

const fade = (color: number, k: number) =>
  (Math.round(((color >> 16) & 255) * k) << 16) | (Math.round(((color >> 8) & 255) * k) << 8) | Math.round((color & 255) * k)

export function clockOf(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000)), h = Math.floor(total / 3600), m = Math.floor(total / 60) % 60, s = total % 60
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m`
  return m > 0 ? `${m}m ${s}s` : `${s}s`
}

const PILL_ICONS: Record<string, number> = {
  edit: 0xf040, // pencil
  bash: 0xf120, // terminal
  read: 0xf002, // magnifying glass
  web: 0xf0ac, // globe
  agent: 0xf135, // rocket
  gear: 0xf013,
  o2: 0xeeaa, // lungs
  fuel: 0xedf9, // gas pump
  hull: 0xf043, // droplet
}
const WORK_INK = 0x5ce8d0
const PILL_FACE = 0x06141a
const LEFT_CAP = 0xe0b6
const RIGHT_CAP = 0xe0b4
// A cap, a space, the icon, two spaces, a cap: the terminal draws an icon across its own cell and a blank one after it, so the
// second space is what balances the first.
const PILL_COLUMNS = 6
// The turn's closing line's pill, as this one becomes it: quiet, not breathing. It's as wide as its text, within the row's room for the longest.
const CLOCK_ICON = 0xf017
const CLOCK_INK = 0xa8e8c4
const CLOCK_GROUND = 0x173b42
const CLOCK_COLUMNS = PILL_COLUMNS + CLOCK_TEXT_COLUMNS + 1

export type Pill = [icon: string, ink: number, isCritical: boolean]

// The work, then what's going wrong; warnings past the status line's amber, red at critical.
export function pillsOf(status: Status): Pill[] {
  const pills: Pill[] = []
  if (status.op && PILL_ICONS[status.op]) pills.push([status.op, WORK_INK, false])
  if (status.o2 >= WARN_AT) pills.push(status.o2 >= CRITICAL_AT ? ['o2', RED, true] : ['o2', GOLD, false])
  if (status.fuel >= WARN_AT) pills.push(status.fuel >= CRITICAL_AT ? ['fuel', RED, true] : ['fuel', GOLD, false])
  if (status.hull >= HULL_AT) pills.push(['hull', RED, true])
  return pills
}

// How lit a pill is now: a slow breath, or a hard flash at critical.
export const glowOf = (tick: number, isCritical: boolean) =>
  isCritical ? (Math.floor(tick / 4) % 2 ? 0.45 : 1) : 0.8 + 0.2 * Math.sin(tick * 0.14)

const SUB_COLUMNS = [...ICON_ART.sub![0]![0]!].length

// The row's width: it grows with the pills showing, so a change of pills is a redraw.
export const columnsOf = (status: Status) =>
  SUB_COLUMNS + GAP + WAVE_COLUMNS + GAP + CLOCK_COLUMNS + pillsOf(status).length * (GAP + PILL_COLUMNS)

export function rowCells(motion: Motion, tick: number, elapsedMs: number, status: Status): string {
  const columns = columnsOf(status)
  const words = new Uint32Array(columns * ROWS * 3)
  for (let i = 0; i < columns * ROWS; i++) words.set([0x20, DEFAULT_COLOR, DEFAULT_COLOR], i * 3)
  const put = (x: number, y: number, code: number, ink: number, ground = DEFAULT_COLOR) => words.set([code, ink, ground], (y * columns + x) * 3)
  const frames = ICON_ART.sub!
  frames[Math.floor(tick / TICKS_A_FRAME) % frames.length]!.forEach((row, y) =>
    [...row].forEach((ch, i) => put(i, y, ch.codePointAt(0)!, motion.ink)),
  )
  let at = SUB_COLUMNS + GAP

  // The wave, joined up to where the line just was so steep parts don't break into dots; bright at the sweep's head.
  const width = WAVE_COLUMNS * 2
  const head = (tick * motion.speed * 1.5) % WAVE_COLUMNS
  for (let cell = 0; cell < WAVE_COLUMNS; cell++) {
    const bits = [0, 0, 0]
    for (const side of [0, 1]) {
      const x = cell * 2 + side
      const here = waveAt(motion, x, tick), before = x > 0 ? waveAt(motion, x - 1, tick) : here
      for (let dot = Math.min(here, before); dot <= Math.max(here, before); dot++)
        bits[Math.floor(dot / 4)]! |= DOTS[dot % 4]![side]!
    }
    const behind = (head - cell + WAVE_COLUMNS) % WAVE_COLUMNS
    const ink = fade(motion.ink, Math.max(0.4, 1 - behind / width * 2))
    bits.forEach((value, y) => {
      if (value) put(at + cell, y, BRAILLE + value, ink)
    })
  }
  at += WAVE_COLUMNS + GAP

  const face = [0x20, CLOCK_ICON, 0x20, 0x20, ...[...clockOf(elapsedMs)].map(ch => ch.charCodeAt(0)), 0x20]
  put(at, CLOCK_ROW, LEFT_CAP, CLOCK_GROUND)
  face.forEach((code, i) => put(at + 1 + i, CLOCK_ROW, code, CLOCK_INK, CLOCK_GROUND))
  put(at + 1 + face.length, CLOCK_ROW, RIGHT_CAP, CLOCK_GROUND)
  at += face.length + 2

  for (const [icon, ink, isCritical] of pillsOf(status)) {
    at += GAP
    const color = fade(ink, glowOf(tick, isCritical))
    put(at, CLOCK_ROW, LEFT_CAP, color)
    put(at + 1, CLOCK_ROW, 0x20, PILL_FACE, color)
    put(at + 2, CLOCK_ROW, PILL_ICONS[icon]!, PILL_FACE, color)
    put(at + 3, CLOCK_ROW, 0x20, PILL_FACE, color)
    put(at + 4, CLOCK_ROW, 0x20, PILL_FACE, color)
    put(at + 5, CLOCK_ROW, RIGHT_CAP, color)
    at += PILL_COLUMNS
  }
  return btoa(String.fromCharCode(...new Uint8Array(words.buffer)))
}
