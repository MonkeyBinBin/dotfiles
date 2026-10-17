// Big pixel numbers on the right of the slime's track: a 3x5 font in half
// blocks, one colour per fact, its label in small text on the row below.

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

const shade = (rgb: number): number =>
  [16, 8, 0].reduce((out, shift) => out | (Math.round(((rgb >> shift) & 0xff) * SHADE) << shift), 0)

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
          const pixel = { x: glyphX + dx, y: y + GLYPH_TOP, rgb: fact.rgb }
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
