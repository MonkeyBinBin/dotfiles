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
}

// The slime keeps at least this many columns to hop in.
export const SLIME_AREA_MIN = 24
// Columns between two facts.
const BLOCK_GAP = 3
// Columns kept free at the right edge, where the engine draws the band's '[-]'.
export const RIGHT_MARGIN = 3
// The track is six pixels tall and glyphs five: starting one pixel down puts
// the numbers on the same ground row the slime stands on.
const GLYPH_TOP = 1

export type HudFact = { key: string; icon: string; value: string; label: string; color: string; rgb: number }
export type HudPixel = { x: number; y: number; rgb: number }
export type HudLabel = { x: number; width: number; text: string; color: string }
export type HudLayout = { areaWidth: number; pixels: HudPixel[]; labels: HudLabel[] }

const glyphWidth = (ch: string): number => FONT[ch]?.[0]?.length ?? 0

// Pixel width of a value: glyphs one column apart.
export const valueWidth = (value: string): number =>
  [...value].reduce((sum, ch, at) => sum + glyphWidth(ch) + (at > 0 ? 1 : 0), 0)

const labelText = (fact: HudFact): string => `${fact.icon} ${fact.label}`

const blockWidth = (fact: HudFact): number =>
  Math.max(valueWidth(fact.value), [...labelText(fact)].length)

// Right-aligned facts; the last ones drop first when the slime would be squeezed.
export const layoutHud = (facts: readonly HudFact[], trackWidth: number): HudLayout => {
  let shown = [...facts]
  const widthOf = (list: readonly HudFact[]) =>
    list.reduce((sum, fact) => sum + blockWidth(fact) + BLOCK_GAP, 0) - BLOCK_GAP + RIGHT_MARGIN
  while (shown.length > 0 && trackWidth - widthOf(shown) - BLOCK_GAP < SLIME_AREA_MIN) {
    shown = shown.slice(0, -1)
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
    for (const ch of fact.value) {
      const rows = FONT[ch] ?? []
      for (let y = 0; y < rows.length; y += 1) {
        const row = rows[y] ?? ''
        for (let dx = 0; dx < row.length; dx += 1) {
          if (row[dx] === '#') pixels.push({ x: glyphX + dx, y: y + GLYPH_TOP, rgb: fact.rgb })
        }
      }
      glyphX += glyphWidth(ch) + 1
    }
    labels.push({ x, width, text: labelText(fact), color: fact.color })
    x += width + BLOCK_GAP
  }
  return { areaWidth: trackWidth - hudWidth - BLOCK_GAP, pixels, labels }
}
