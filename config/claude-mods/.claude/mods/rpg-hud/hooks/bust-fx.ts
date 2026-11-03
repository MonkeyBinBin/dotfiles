// Life laid over a portrait bust where the terminal draws cells: the busts' own frames only float and tint, so
// at rest the hero blinks and a glint runs round its outline, casting its outline burns in the class's colours
// with its eyes aglow, and hurt it shakes. Each tick picks a variant of the bust frame under it; ticks with no
// variant leave the frame as it is.
import type { Mood } from './anim'
import type { HeroClassId } from './hero-cells'
import { composeColors } from './util'

const COLUMNS = 20
const ROWS = 10
const UPPER_HALF = 0x2580
const LOWER_HALF = 0x2584
const DEFAULT_COLOR = 0x01000000
const RIM = 0xffffff

type Pixels = (number | undefined)[][]

// Per class: the eye pixels in the first idle frame, (x, y) in bust pixels, each with the colour it takes
// when the lids close; and the cast's outline colours, light and deep, as the portrait's aura.
type Face = { eyes: readonly (readonly [x: number, y: number, lid: number])[]; light: number; deep: number }
const FACES: Partial<Record<HeroClassId, Face>> = {
  wizard: { eyes: [[7, 11, 0x6e4038], [8, 11, 0x6e4038], [11, 11, 0x6e4038], [12, 11, 0x6e4038]], light: 0x96f0ff, deep: 0x50aaff },
  knight: { eyes: [[8, 10, 0x825a4b], [12, 10, 0x825a4b], [8, 11, 0x4a2e26], [12, 11, 0x4a2e26]], light: 0xffecaa, deep: 0xe6aa3c },
  ranger: { eyes: [[8, 11, 0xd6aa8c], [12, 11, 0xd6aa8c]], light: 0xc8f596, deep: 0x6eb446 },
  rogue: { eyes: [[8, 10, 0x69463e], [9, 10, 0x69463e], [11, 10, 0x69463e], [12, 10, 0x69463e]], light: 0xd7b4ff, deep: 0x8c5adc },
  cleric: { eyes: [[8, 11, 0xfdde92], [12, 11, 0xfdde92], [8, 12, 0xa0550f], [12, 12, 0xa0550f]], light: 0xfffad2, deep: 0xfad764 },
  artificer: { eyes: [[8, 12, 0xfbd4a8], [11, 12, 0xfbd4a8], [8, 13, 0xa05a0f], [11, 13, 0xa05a0f]], light: 0xfff0a0, deep: 0xf5bb32 },
}

// Idle: a blink, now and then twice, and a glint round the outline. Neither falls in the mood's first
// QUIET_TICKS, and the blink's period is no multiple of the idle loop's 20 ticks, so it lands on every frame.
export const QUIET_TICKS = 16
const BLINK_PERIOD = 43
const BLINKS = [17, 18, 22, 23]
const GLINT_PERIOD = 70
const GLINT_START = 40
const GLINT_TICKS = 10
// Cast: a bright head runs round the outline, a tail fading behind it; the eyes pulse.
const COMET_STEP = 3
const COMET_TAIL = 10
const EYE_PULSE = [0.15, 0.35, 0.55, 0.35]
// Hurt: the bust shakes a column either way, the first tick still.
const SHAKE = [0, -1, 1, -1, 1, 0, -1, 1, 0]

const mix = (a: number, b: number, t: number): number => {
  const ch = (shift: number) => Math.round(((a >> shift) & 255) * (1 - t) + ((b >> shift) & 255) * t) << shift
  return ch(16) | ch(8) | ch(0)
}

const decode = (cells: string): Pixels => {
  const bytes = Uint8Array.from(atob(cells), ch => ch.charCodeAt(0))
  const words = new Uint32Array(bytes.buffer, bytes.byteOffset, Math.floor(bytes.byteLength / 4))
  const color = (word: number) => (word === DEFAULT_COLOR ? undefined : word)
  const pixels: Pixels = Array.from({ length: ROWS * 2 }, () => Array.from({ length: COLUMNS }, () => undefined))
  for (let row = 0; row < ROWS; row += 1) {
    for (let col = 0; col < COLUMNS; col += 1) {
      const at = (row * COLUMNS + col) * 3
      const glyph = words[at]
      if (glyph === UPPER_HALF) {
        pixels[row * 2]![col] = color(words[at + 1]!)
        pixels[row * 2 + 1]![col] = color(words[at + 2]!)
      } else if (glyph === LOWER_HALF) {
        pixels[row * 2 + 1]![col] = color(words[at + 1]!)
      }
    }
  }
  return pixels
}

// The eyes' colours in the first idle frame, read once per class: a frame shows them where they sit (one row
// higher while it floats), and a frame that tints them (a hurt flash) has none to find.
const eyeColors = new Map<HeroClassId, number[]>()
const findEyes = (pixels: Pixels, hero: HeroClassId, face: Face, still: string): number | undefined => {
  let colors = eyeColors.get(hero)
  if (colors === undefined) {
    const first = decode(still)
    colors = face.eyes.map(([x, y]) => first[y]?.[x] ?? -1)
    eyeColors.set(hero, colors)
  }
  for (const lift of [0, -1, 1]) {
    if (face.eyes.every(([x, y], n) => pixels[y + lift]?.[x] === colors![n])) return lift
  }
  return undefined
}

// The outline: white pixels beside see-through ones, in order round the bust's middle.
const rimOf = (pixels: Pixels): [x: number, y: number][] => {
  const rim: [number, number][] = []
  pixels.forEach((row, y) =>
    row.forEach((color, x) => {
      if (color !== RIM) return
      const open = [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]].some(([nx, ny]) => pixels[ny!]?.[nx!] === undefined)
      if (open) rim.push([x, y])
    }),
  )
  const cx = COLUMNS / 2
  const cy = ROWS
  return rim.sort((a, b) => Math.atan2(a[1] - cy, a[0] - cx) - Math.atan2(b[1] - cy, b[0] - cx))
}

type Variant = { kind: 'blink' } | { kind: 'glint'; step: number } | { kind: 'cast'; step: number } | { kind: 'shake'; dx: number }

const variantAt = (mood: Mood, tick: number): Variant | undefined => {
  if (mood === 'hurt') {
    const dx = SHAKE[tick] ?? 0
    return dx === 0 ? undefined : { kind: 'shake', dx }
  }
  if (mood === 'cast') return { kind: 'cast', step: tick }
  if (tick < QUIET_TICKS) return undefined
  if (BLINKS.includes(tick % BLINK_PERIOD)) return { kind: 'blink' }
  const glint = (tick % GLINT_PERIOD) - GLINT_START
  if (glint >= 0 && glint < GLINT_TICKS) return { kind: 'glint', step: glint }
  return undefined
}

const paint = (pixels: Pixels, variant: Variant, hero: HeroClassId, face: Face, still: string): Pixels => {
  if (variant.kind === 'shake') {
    return pixels.map(row => row.map((_, x) => row[x - variant.dx]))
  }
  const out = pixels.map(row => [...row])
  if (variant.kind === 'blink') {
    const lift = findEyes(pixels, hero, face, still)
    if (lift !== undefined) for (const [x, y, lid] of face.eyes) out[y + lift]![x] = lid
    return out
  }
  if (variant.kind === 'glint') {
    // A short diagonal band of light crosses the outline, top left to bottom right.
    const band = variant.step * 4
    for (const [x, y] of rimOf(pixels)) {
      const d = x + y - band
      if (d >= 0 && d < 4) out[y]![x] = d === 1 || d === 2 ? face.deep : face.light
    }
    return out
  }
  // Casting: the outline in the deep colour, a light head running round it, white at its tip.
  const rim = rimOf(pixels)
  const head = (variant.step * COMET_STEP) % Math.max(1, rim.length)
  rim.forEach(([x, y], n) => {
    const behind = (head - n + rim.length) % rim.length
    out[y]![x] = behind === 0 ? RIM : behind <= COMET_TAIL ? mix(face.light, face.deep, behind / COMET_TAIL) : face.deep
  })
  const lift = findEyes(pixels, hero, face, still)
  const pulse = EYE_PULSE[variant.step % EYE_PULSE.length]!
  if (lift !== undefined) {
    for (const [x, y] of face.eyes) {
      const color = pixels[y + lift]?.[x]
      if (color !== undefined) out[y + lift]![x] = mix(color, RIM, pulse)
    }
  }
  return out
}

// A combo's aura as fire round the bust itself, in place of sparks in a strip beside it: flames lick out of the
// see-through pixels along the outline, taller ones above, and embers with short tails rise from the shoulders.
// Gold from a combo of ten; from twenty the flames cycle every colour round the figure.
export type BustAura = { tier: 1 | 2; tick: number; kept: number }
const FLAME = { deep: 0xe0781a, mid: 0xffc040, light: 0xffd84a, tip: 0xfff3b0 }
const RAINBOW = [0xff4a4a, 0xffb02e, 0xffe14a, 0x5ad27a, 0x5aa9ff, 0xb466ff]
const EMBERS = 3

// A steady pseudo-random share in [0, 1) for a pixel at a tick: the flames flicker without a seed to keep.
const noise = (x: number, y: number, t: number): number => {
  let h = (x * 374761393 + y * 668265263 + t * 2246822519) | 0
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}

// `shape` is the frame before any recolouring, where the white outline is found; `pixels` what is painted on.
const burn = (shape: Pixels, pixels: Pixels, aura: BustAura): Pixels => {
  const out = pixels.map(row => [...row])
  const { tier, tick, kept } = aura
  const dim = (rgb: number) => mix(0x000000, rgb, kept)
  const open = (x: number, y: number) => x >= 0 && x < COLUMNS && y >= 0 && y < ROWS * 2 && shape[y]![x] === undefined
  const rim = rimOf(shape)
  const isRim = new Set(rim.map(([x, y]) => y * COLUMNS + x))
  const near = (x: number, y: number) =>
    [-1, 0, 1].some(dy => [-1, 0, 1].some(dx => isRim.has((y + dy) * COLUMNS + x + dx)))
  const hue = (x: number, y: number, shade: number) => {
    if (tier === 1) return shade
    const turn = Math.atan2(y - ROWS, x - COLUMNS / 2) / (2 * Math.PI) + 0.5
    const base = RAINBOW[Math.floor(turn * RAINBOW.length + tick / 2) % RAINBOW.length]!
    return shade === FLAME.tip ? mix(base, 0xffffff, 0.6) : shade === FLAME.light ? mix(base, 0xffffff, 0.25) : shade === FLAME.deep ? mix(base, 0x000000, 0.35) : base
  }
  // The glow: every open pixel touching the outline, dim and warm, stronger toward the shoulders, flickering
  // smoothly rather than a new speckle each tick.
  const height = ROWS * 2
  const ring: [number, number][] = []
  for (let y = 0; y < height; y += 1) for (let x = 0; x < COLUMNS; x += 1) if (open(x, y) && near(x, y)) ring.push([x, y])
  const slow = tick / 3
  const flicker = (x: number, y: number) => {
    const at = Math.floor(slow)
    const t = slow - at
    return noise(x, y, at) * (1 - t) + noise(x, y, at + 1) * t
  }
  for (const [x, y] of ring) {
    const low = y / height
    const strength = (0.45 + 0.35 * low + 0.2 * flicker(x, y)) * kept
    const shade = mix(FLAME.deep, FLAME.mid, flicker(x + 31, y))
    out[y]![x] = mix(0x000000, hue(x, y, shade), Math.min(1, strength))
  }
  // Tongues: here and there one leaps up out of the glow, two or three pixels, and shrinks away.
  for (const [x, y] of ring) {
    if (y < 4 || noise(x, y, 99) > 0.22) continue
    const phase = (tick + Math.floor(noise(x, y, 7) * 12)) % 12
    if (phase > 2) continue
    const tall = 3 - phase
    for (let up = 1; up <= tall; up += 1) {
      if (!open(x, y - up) || out[y - up]![x] !== undefined) break
      out[y - up]![x] = dim(hue(x, y - up, up === tall ? FLAME.tip : FLAME.light))
    }
  }
  // Embers: a few rise up the open sides, swaying, a dimmer pixel behind each.
  for (let k = 0; k < (tier === 2 ? EMBERS + 1 : EMBERS); k += 1) {
    const life = (tick + k * 9) % height
    const y = height - 1 - life
    const side = k % 2 === 0 ? 1 : COLUMNS - 2
    const x = side + Math.round(Math.sin((tick + k * 5) / 3))
    const color = tier === 2 ? RAINBOW[(k + Math.floor(tick / 3)) % RAINBOW.length]! : k % 2 ? FLAME.tip : FLAME.light
    if (open(x, y) && out[y]![x] === undefined) out[y]![x] = dim(color)
    if (open(x, y + 1) && out[y + 1]![x] === undefined) out[y + 1]![x] = dim(mix(color, 0x000000, 0.55))
  }
  return out
}

const decorated = new Map<string, string>()

// The bust frame `cells` of `hero`, `tick` ticks into `mood`, with that tick's life laid on, and a combo's
// `aura` burning round it. `still` is the class's first idle frame, where its eyes are found.
export const decorateBust = (cells: string, hero: HeroClassId, mood: Mood, tick: number, still: string, aura?: BustAura): string => {
  const face = FACES[hero]
  const variant = face === undefined ? undefined : variantAt(mood, tick)
  const isBurning = aura !== undefined && aura.kept > 0
  if (variant === undefined && !isBurning) return cells
  const lively = (pixels: Pixels) => (variant === undefined ? pixels : paint(pixels, variant, hero, face!, still))
  // A cast's comet and the aura's flames never repeat for long enough to be worth keeping.
  if (variant?.kind === 'cast' || isBurning) {
    const base = decode(cells)
    const pixels = lively(base)
    if (!isBurning) return composeColors(pixels)
    // A shaken frame burns where it shook to.
    return composeColors(burn(variant?.kind === 'shake' ? pixels : base, pixels, aura!))
  }
  const key = `${hero}:${JSON.stringify(variant)}:${cells}`
  const hit = decorated.get(key)
  if (hit !== undefined) return hit
  const out = composeColors(lively(decode(cells)))
  if (decorated.size > 500) decorated.clear()
  decorated.set(key, out)
  return out
}
