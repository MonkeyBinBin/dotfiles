// Big pixel numbers on the right of the slime's track: a 3x5 font in half
// blocks, one colour per fact shaded top to bottom, its label in small text on the row below.

// '#' is a lit pixel. Every glyph is five pixels tall.
const FONT: Record<string, readonly string[]> = {
  '0': ['###', '#.#', '#.#', '#.#', '###'],
  '1': ['.#.', '##.', '.#.', '.#.', '###'],
  '2': ['###', '..#', '###', '#..', '###'],
  '3': ['###', '..#', '###', '..#', '###'],
  '4': ['#.#', '#.#', '###', '..#', '..#'],
  '5': ['###', '#..', '###', '..#', '###'],
  '6': ['###', '#..', '###', '#.#', '###'],
  '7': ['###', '..#', '.#.', '.#.', '.#.'],
  '8': ['###', '#.#', '###', '#.#', '###'],
  '9': ['###', '#.#', '###', '..#', '###'],
  '.': ['.', '.', '.', '.', '#'],
  k: ['#..', '#.#', '##.', '#.#', '#.#'],
  s: ['.##', '#..', '.#.', '..#', '##.'],
  // Capitals for the event banners: LEVEL UP!, VICTORY!, BOSS!
  A: ['.#.', '#.#', '###', '#.#', '#.#'],
  B: ['##.', '#.#', '##.', '#.#', '##.'],
  C: ['.##', '#..', '#..', '#..', '.##'],
  D: ['##.', '#.#', '#.#', '#.#', '##.'],
  E: ['###', '#..', '##.', '#..', '###'],
  F: ['###', '#..', '##.', '#..', '#..'],
  G: ['.##', '#..', '#.#', '#.#', '.##'],
  H: ['#.#', '#.#', '###', '#.#', '#.#'],
  I: ['###', '.#.', '.#.', '.#.', '###'],
  J: ['..#', '..#', '..#', '#.#', '.#.'],
  K: ['#.#', '#.#', '##.', '#.#', '#.#'],
  L: ['#..', '#..', '#..', '#..', '###'],
  M: ['#.#', '###', '###', '#.#', '#.#'],
  N: ['##.', '#.#', '#.#', '#.#', '#.#'],
  O: ['.#.', '#.#', '#.#', '#.#', '.#.'],
  P: ['##.', '#.#', '##.', '#..', '#..'],
  Q: ['.#.', '#.#', '#.#', '##.', '.##'],
  R: ['##.', '#.#', '##.', '#.#', '#.#'],
  S: ['.##', '#..', '.#.', '..#', '##.'],
  T: ['###', '.#.', '.#.', '.#.', '.#.'],
  U: ['#.#', '#.#', '#.#', '#.#', '###'],
  V: ['#.#', '#.#', '#.#', '#.#', '.#.'],
  W: ['#.#', '#.#', '###', '###', '#.#'],
  X: ['#.#', '#.#', '.#.', '#.#', '#.#'],
  Y: ['#.#', '#.#', '.#.', '.#.', '.#.'],
  Z: ['###', '..#', '.#.', '#..', '###'],
  '!': ['#', '#', '#', '.', '#'],
  ' ': ['..', '..', '..', '..', '..'],
}

// The slime keeps at least this many columns to hop in.
export const SLIME_AREA_MIN = 24
// Columns between two facts.
const BLOCK_GAP = 3
// The track is six pixels tall and glyphs five, plus one for the extrusion:
// starting at the top puts the extrusion on the ground row the slime stands on.
const GLYPH_TOP = 0
// The extrusion: one pixel down and right of the face, in a darker shade.
const DEPTH = 1
const SHADE = 0.45

// The face's vertical gradient: the top row mixed this far toward white, the bottom row scaled by this.
const GLOSS = 0.5
const BASE = 0.85

const shade = (rgb: number): number =>
  [16, 8, 0].reduce((out, shift) => out | (Math.round(((rgb >> shift) & 0xff) * SHADE) << shift), 0)

const mix = (from: number, to: number, t: number): number =>
  [16, 8, 0].reduce((out, shift) => {
    const a = (from >> shift) & 0xff
    const b = (to >> shift) & 0xff
    return out | (Math.round(a + (b - a) * t) << shift)
  }, 0)

// Light on top, the fact's own colour a shade deeper at the bottom.
export const gradientAt = (rgb: number, y: number, rows: number): number => {
  const top = mix(rgb, 0xffffff, GLOSS)
  const bottom = mix(0, rgb, BASE)
  return mix(top, bottom, rows <= 1 ? 0 : y / (rows - 1))
}

// `dropFirst` facts go before any other when the band is narrow, in their order; the rest drop from the last.
export type HudFact = { key: string; icon: string; value: string; label: string; color: string; rgb: number; dropFirst?: boolean }
export type HudPixel = { x: number; y: number; rgb: number }
export type HudLabel = { x: number; width: number; text: string; color: string }
export type HudLayout = { areaWidth: number; pixels: HudPixel[]; labels: HudLabel[] }

export const formatTokens = (n: number): string => {
  if (n < 1000) return `${n}`
  const k = n / 1000
  return k >= 100 ? `${Math.round(k)}k` : `${k.toFixed(1)}k`
}

const glyphWidth = (ch: string): number => FONT[ch]?.[0]?.length ?? 0

// Pixel width of a value: glyphs one column apart, plus the extrusion past the last one.
export const valueWidth = (value: string): number =>
  [...value].reduce((sum, ch, at) => sum + glyphWidth(ch) + (at > 0 ? 1 : 0), 0) + (value === '' ? 0 : DEPTH)

const labelText = (fact: HudFact): string => `${fact.icon} ${fact.label}`

const blockWidth = (fact: HudFact): number =>
  Math.max(valueWidth(fact.value), [...labelText(fact)].length)

// Right-aligned facts, flush with the band's edge (bodyColumns already leaves out
// the engine's '[-]'); when the slime would be squeezed the `dropFirst` ones go,
// then the last ones.
export const layoutHud = (facts: readonly HudFact[], trackWidth: number): HudLayout => {
  let shown = [...facts]
  const widthOf = (list: readonly HudFact[]) =>
    list.reduce((sum, fact) => sum + blockWidth(fact) + BLOCK_GAP, 0) - BLOCK_GAP
  while (shown.length > 0 && trackWidth - widthOf(shown) - BLOCK_GAP < SLIME_AREA_MIN) {
    const first = shown.findIndex(fact => fact.dropFirst)
    shown = first === -1 ? shown.slice(0, -1) : shown.filter((_, at) => at !== first)
  }
  if (shown.length === 0) return { areaWidth: trackWidth, pixels: [], labels: [] }

  const hudWidth = widthOf(shown)
  const pixels: HudPixel[] = []
  const labels: HudLabel[] = []
  let x = trackWidth - hudWidth
  for (const fact of shown) {
    const width = blockWidth(fact)
    // The number sits centred over its label.
    let glyphX = x + Math.floor((width - valueWidth(fact.value)) / 2)
    const face = new Map<string, HudPixel>()
    for (const ch of fact.value) {
      const rows = FONT[ch] ?? []
      for (let y = 0; y < rows.length; y += 1) {
        const row = rows[y] ?? ''
        for (let dx = 0; dx < row.length; dx += 1) {
          const pixel = { x: glyphX + dx, y: y + GLYPH_TOP, rgb: gradientAt(fact.rgb, y, rows.length) }
          if (row[dx] === '#') face.set(`${pixel.x},${pixel.y}`, pixel)
        }
      }
      glyphX += glyphWidth(ch) + 1
    }
    const rgb = shade(fact.rgb)
    pixels.push(...face.values())
    for (const pixel of face.values()) {
      const side = { x: pixel.x + DEPTH, y: pixel.y + DEPTH, rgb }
      if (!face.has(`${side.x},${side.y}`)) pixels.push(side)
    }
    labels.push({ x, width, text: labelText(fact), color: fact.color })
    x += width + BLOCK_GAP
  }
  return { areaWidth: trackWidth - hudWidth - BLOCK_GAP, pixels, labels }
}

export const mixToward = mix

// A banner's glint: a diagonal streak of light sweeping its letters left to right, then a rest before the next.
// Pixels within GLINT_REACH of the line x + y = at go toward white, most on the line itself.
const GLINT_REACH = 2
const GLINT_STEP = 2
const GLINT_REST = 10
const GLINT_PEAK = 0.8

export const glintAt = (pixels: readonly HudPixel[], at: number): HudPixel[] =>
  pixels.map(pixel => {
    const off = Math.abs(pixel.x + pixel.y - at)
    return off > GLINT_REACH ? pixel : { ...pixel, rgb: mix(pixel.rgb, 0xffffff, GLINT_PEAK * (1 - off / (GLINT_REACH + 1))) }
  })

// The streak's line `ticks` into the banner, or undefined while it rests between sweeps.
export const glintLine = (pixels: readonly HudPixel[], ticks: number): number | undefined => {
  if (pixels.length === 0) return undefined
  const sums = pixels.map(pixel => pixel.x + pixel.y)
  const from = Math.min(...sums) - GLINT_REACH
  const steps = Math.ceil((Math.max(...sums) + GLINT_REACH - from) / GLINT_STEP)
  const phase = ticks % (steps + 1 + GLINT_REST)
  return phase > steps ? undefined : from + phase * GLINT_STEP
}

// A banner's letters fall into place a pixel row per tick as it arrives.
export const DROP_ROWS = GLYPH_TOP + 6
export const dropIn = (pixels: readonly HudPixel[], ticks: number): HudPixel[] => {
  const lift = Math.max(0, DROP_ROWS - ticks)
  return lift === 0 ? [...pixels] : pixels.flatMap(pixel => (pixel.y - lift < 0 ? [] : [{ ...pixel, y: pixel.y - lift }]))
}

// A value rolling from `from` to `to`, `t` of the way (0 to 1): `to`'s shape throughout, so the layout holds still,
// each digit counting up from the one at its place in `from` (right-aligned; 0 where there was none).
export const rollValue = (from: string, to: string, t: number): string => {
  if (t >= 1) return to
  const old = [...from]
  const next = [...to]
  return next
    .map((ch, at) => {
      const digit = Number.parseInt(ch, 10)
      if (Number.isNaN(digit)) return ch
      const before = Number.parseInt(old[old.length - next.length + at] ?? '', 10)
      const start = Number.isNaN(before) ? 0 : before
      const steps = (digit - start + 10) % 10
      return `${(start + Math.round(steps * Math.max(0, t))) % 10}`
    })
    .join('')
}
