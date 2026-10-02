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

export const formatMs = (ms?: number): string => {
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
export const composeSprite = (pixels: readonly string[], palette: Readonly<Record<string, number>>): string => {
  const columns = pixels[0]?.length ?? 0
  const rows = Math.ceil(pixels.length / 2)
  const words = new Uint32Array(columns * rows * 3)
  const colorAt = (x: number, y: number) => palette[pixels[y]?.[x] ?? '.']
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
