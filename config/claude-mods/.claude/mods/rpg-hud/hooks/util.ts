// Cells across the HP, MP and XP bars.
export const BAR_WIDTH = 16

// How many of a bar's cells are filled for `value` out of `max`.
export const barFill = (value: number, max: number, width: number = BAR_WIDTH): number =>
  max <= 0 ? 0 : Math.round((Math.max(0, Math.min(value, max)) / max) * width)

// The filled and empty halves of a bar, for two differently coloured Texts.
export const barParts = (value: number, max: number, width: number = BAR_WIDTH) => {
  const filled = barFill(value, max, width)
  return { filled: '█'.repeat(filled), empty: '░'.repeat(width - filled) }
}

// Collapse whitespace (multi-line commands) and cut the middle so a row never wraps.
export const oneLine = (text: string, max: number): string => {
  const flat = text.replace(/\s+/g, ' ').trim()
  if (max <= 0) return ''
  if (flat.length <= max) return flat
  if (max === 1) return '…'
  const head = Math.ceil((max - 1) / 2)
  return `${flat.slice(0, head)}…${flat.slice(flat.length - (max - 1 - head))}`
}

// The BMP's emoji that default to emoji presentation (Emoji_Presentation=Yes): drawn two cells wide with no VS16.
// The text-default ones (⚙ ⚔ and the like) stay one cell, which is why titles use only these.
const BMP_EMOJI = new Set([
  0x231a, 0x231b, 0x23e9, 0x23ea, 0x23eb, 0x23ec, 0x23f0, 0x23f3, 0x25fd, 0x25fe, 0x2614, 0x2615, 0x2648, 0x2649,
  0x264a, 0x264b, 0x264c, 0x264d, 0x264e, 0x264f, 0x2650, 0x2651, 0x2652, 0x2653, 0x267f, 0x2693, 0x26a1, 0x26aa,
  0x26ab, 0x26bd, 0x26be, 0x26c4, 0x26c5, 0x26ce, 0x26d4, 0x26ea, 0x26f2, 0x26f3, 0x26f5, 0x26fa, 0x26fd, 0x2705,
  0x270a, 0x270b, 0x2728, 0x274c, 0x274e, 0x2753, 0x2754, 0x2755, 0x2757, 0x2795, 0x2796, 0x2797, 0x27b0, 0x27bf,
  0x2b1b, 0x2b1c, 0x2b50, 0x2b55,
])

// East Asian wide and fullwidth characters, and the emoji: two cells each in a monospaced face.
export const isWide = (cp: number): boolean =>
  BMP_EMOJI.has(cp) ||
  (cp >= 0x1100 && cp <= 0x115f) ||
  (cp >= 0x2e80 && cp <= 0xa4cf && cp !== 0x303f) ||
  (cp >= 0xac00 && cp <= 0xd7a3) ||
  (cp >= 0xf900 && cp <= 0xfaff) ||
  (cp >= 0xfe30 && cp <= 0xfe4f) ||
  (cp >= 0xff00 && cp <= 0xff60) ||
  (cp >= 0xffe0 && cp <= 0xffe6) ||
  (cp >= 0x1f300 && cp <= 0x1faff) ||
  (cp >= 0x20000 && cp <= 0x3fffd)

export const cellWidth = (text: string): number => [...text].reduce((sum, ch) => sum + (isWide(ch.codePointAt(0) ?? 0) ? 2 : 1), 0)

// oneLine counted in cells, so a CJK subject cut to `max` still fits `max` columns.
export const oneLineCells = (text: string, max: number): string => {
  const flat = text.replace(/\s+/g, ' ').trim()
  if (max <= 0) return ''
  if (cellWidth(flat) <= max) return flat
  if (max === 1) return '…'
  const chars = [...flat]
  const take = (from: readonly string[], room: number) => {
    const kept: string[] = []
    let used = 0
    for (const ch of from) {
      const w = cellWidth(ch)
      if (used + w > room) break
      kept.push(ch)
      used += w
    }
    return kept
  }
  const head = take(chars, Math.ceil((max - 1) / 2))
  const room = max - 1 - cellWidth(head.join(''))
  const tail = take(chars.slice(head.length).reverse(), room).reverse()
  return `${head.join('')}…${tail.join('')}`
}

export const formatMs =(ms?: number): string => {
  if (ms === undefined) return '…'
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`
}

export const formatElapsed = (ms: number): string => {
  const seconds = Math.max(0, Math.round(ms / 1000))
  if (seconds < 60) return `${seconds}s`
  return `${Math.floor(seconds / 60)}m${String(seconds % 60).padStart(2, '0')}s`
}

const SUMMARY_KEYS = ['file_path', 'command', 'pattern', 'url', 'query', 'skill', 'description']

// Pick the most telling input field; file paths shrink to their basename.
export const summarize = (input: object): string => {
  const fields = input as Record<string, unknown>
  for (const key of SUMMARY_KEYS) {
    const value = fields[key]
    if (typeof value === 'string' && value.length > 0) {
      return key === 'file_path' ? (value.split('/').pop() ?? value) : value
    }
  }
  return ''
}

const UPPER_HALF = 0x2580
const LOWER_HALF = 0x2584
const SPACE = 0x20
const DEFAULT_COLOR = 0x01000000

// Pixel art as Raster cells: one character per pixel, '.' see-through, two pixel rows per terminal row.
export const composeSprite = (pixels: readonly string[], palette: Readonly<Record<string, number>>): string =>
  composeColors(pixels.map(line => [...line].map(ch => palette[ch])))

// Raster cells from glyphs, each [code point, foreground, background]: text that animates by blits.
export const packCells = (cells: ReadonlyArray<readonly [number, number, number]>): string => {
  const words = new Uint32Array(cells.length * 3)
  cells.forEach(([glyph, fg, bg], at) => words.set([glyph, fg, bg], at * 3))
  return btoa(String.fromCharCode(...new Uint8Array(words.buffer)))
}

// A colour per pixel, undefined see-through, as Raster cells: two pixel rows per terminal row.
export const composeColors = (pixels: readonly (readonly (number | undefined)[])[]): string => {
  const columns = pixels[0]?.length ?? 0
  const rows = Math.ceil(pixels.length / 2)
  const words = new Uint32Array(columns * rows * 3)
  const colorAt = (x: number, y: number) => pixels[y]?.[x]
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < columns; col += 1) {
      const at = (row * columns + col) * 3
      const top = colorAt(col, row * 2)
      const bottom = colorAt(col, row * 2 + 1)
      if (top === undefined && bottom === undefined) {
        words.set([SPACE, DEFAULT_COLOR, DEFAULT_COLOR], at)
      } else if (top === undefined) {
        // A default foreground is the text colour, not see-through: paint the lower half.
        words.set([LOWER_HALF, bottom ?? DEFAULT_COLOR, DEFAULT_COLOR], at)
      } else {
        words.set([UPPER_HALF, top, bottom ?? DEFAULT_COLOR], at)
      }
    }
  }
  const bytes = new Uint8Array(words.buffer)
  let binary = ''
  for (let at = 0; at < bytes.length; at += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(at, at + 0x8000))
  }
  return btoa(binary)
}

// Raster cells drained of colour and dimmed, the glyphs kept: a hero knocked out. Read once per frame.
const drained = new Map<string, string>()
export const drainCells = (cells: string): string => {
  const hit = drained.get(cells)
  if (hit !== undefined) return hit
  const bytes = Uint8Array.from(atob(cells), ch => ch.charCodeAt(0))
  const words = new Uint32Array(bytes.buffer, bytes.byteOffset, Math.floor(bytes.byteLength / 4))
  const gray = (word: number): number => {
    if (word === DEFAULT_COLOR) return word
    const level = Math.round((((word >> 16) & 0xff) * 0.3 + ((word >> 8) & 0xff) * 0.59 + (word & 0xff) * 0.11) * 0.55)
    // A cold grey, a touch of blue in it.
    return (level << 16) | (level << 8) | Math.min(255, level + 18)
  }
  for (let at = 0; at + 2 < words.length; at += 3) {
    words[at + 1] = gray(words[at + 1]!)
    words[at + 2] = gray(words[at + 2]!)
  }
  let binary = ''
  for (let at = 0; at < bytes.length; at += 0x8000) binary += String.fromCharCode(...bytes.subarray(at, at + 0x8000))
  const out = btoa(binary)
  drained.set(cells, out)
  return out
}

// Raster cells part way from `from` to `to` (the same glyphs, as drainCells keeps them): `t` 0 is `from`, 1 `to`.
// A revived hero's colour coming back.
export const blendCells = (from: string, to: string, t: number): string => {
  const decode = (cells: string) => {
    const bytes = Uint8Array.from(atob(cells), ch => ch.charCodeAt(0))
    return new Uint32Array(bytes.buffer, bytes.byteOffset, Math.floor(bytes.byteLength / 4))
  }
  const a = decode(from)
  const b = decode(to)
  if (a.length !== b.length) return t < 0.5 ? from : to
  const mix = (x: number, y: number): number => {
    if (x === DEFAULT_COLOR || y === DEFAULT_COLOR) return t < 0.5 ? x : y
    const channel = (shift: number) => Math.round(((x >> shift) & 0xff) + ((((y >> shift) & 0xff) - ((x >> shift) & 0xff)) * t))
    return (channel(16) << 16) | (channel(8) << 8) | channel(0)
  }
  const out = new Uint32Array(a.length)
  for (let at = 0; at + 2 < a.length; at += 3) {
    out[at] = b[at]!
    out[at + 1] = mix(a[at + 1]!, b[at + 1]!)
    out[at + 2] = mix(a[at + 2]!, b[at + 2]!)
  }
  const bytes = new Uint8Array(out.buffer)
  let binary = ''
  for (let at = 0; at < bytes.length; at += 0x8000) binary += String.fromCharCode(...bytes.subarray(at, at + 0x8000))
  return btoa(binary)
}
