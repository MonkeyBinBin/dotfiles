// Pixel art and gauges for surfaces that draw SVG (desktop, editor, mobile), where half-block cells and
// block-character bars come out as gappy glyphs. Sprites reuse the terminal's own data: Raster cells decode
// back to pixels, so the hero, the pets and the menu icons need no second copy.

// One row of colours per pixel row; undefined is see-through.
export type Pixels = (string | undefined)[][]

const UPPER_HALF = 0x2580
const LOWER_HALF = 0x2584
const DEFAULT_COLOR = 0x01000000

const hex = (rgb: number): string => `#${(rgb & 0xffffff).toString(16).padStart(6, '0')}`

const decoded = new Map<string, Pixels>()

// Raster cells ([codePoint, foreground, background] words, base64) back to pixels: two pixel rows per cell row.
export const cellsToPixels = (cells: string, columns: number, rows: number): Pixels => {
  const hit = decoded.get(cells)
  if (hit !== undefined) return hit
  const bytes = Uint8Array.from(atob(cells), ch => ch.charCodeAt(0))
  const words = new Uint32Array(bytes.buffer, bytes.byteOffset, Math.floor(bytes.byteLength / 4))
  const color = (word: number | undefined) => (word === undefined || word === DEFAULT_COLOR ? undefined : hex(word))
  const pixels: Pixels = Array.from({ length: rows * 2 }, () => Array.from({ length: columns }, () => undefined))
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < columns; col += 1) {
      const at = (row * columns + col) * 3
      const glyph = words[at]
      const fg = color(words[at + 1])
      const bg = color(words[at + 2])
      const top = pixels[row * 2]!
      const bottom = pixels[row * 2 + 1]!
      if (glyph === UPPER_HALF) {
        top[col] = fg
        bottom[col] = bg
      } else if (glyph === LOWER_HALF) {
        top[col] = bg
        bottom[col] = fg
      }
    }
  }
  decoded.set(cells, pixels)
  return pixels
}

// One character per pixel, '.' see-through, as the sprite tables write them.
export const gridToPixels = (grid: readonly string[], palette: Readonly<Record<string, number>>): Pixels =>
  grid.map(line => [...line].map(ch => (palette[ch] === undefined ? undefined : hex(palette[ch]))))

// Horizontal runs of one colour, so a row is a handful of rects.
const rects = (pixels: Pixels, px: number): string => {
  let out = ''
  pixels.forEach((row, y) => {
    let x = 0
    while (x < row.length) {
      const color = row[x]
      let end = x + 1
      while (end < row.length && row[end] === color) end += 1
      if (color !== undefined) out += `<rect x="${x * px}" y="${y * px}" width="${(end - x) * px}" height="${px}" fill="${color}"/>`
      x = end
    }
  })
  return out
}

export type SpriteSvg = { source: string; width: number; height: number; isAnimated: boolean }

// Frames shown in turn, `frameMs` each, by SMIL in the surface's sandboxed frame; one frame is a still.
export const spriteSvg = (frames: readonly Pixels[], px: number, frameMs: number): SpriteSvg => {
  const first = frames[0] ?? []
  const width = (first[0]?.length ?? 0) * px
  const height = first.length * px
  const cycle = frames.length * frameMs
  const body =
    frames.length <= 1
      ? rects(first, px)
      : frames
          .map((frame, at) => {
            // Visible for its slot of the cycle, hidden for the rest.
            const start = at / frames.length
            const end = (at + 1) / frames.length
            const keyTimes = at === 0 ? `0;${end}` : end >= 1 ? `0;${start}` : `0;${start};${end}`
            const values = at === 0 ? 'visible;hidden' : end >= 1 ? 'hidden;visible' : 'hidden;visible;hidden'
            return (
              `<g visibility="${at === 0 ? 'visible' : 'hidden'}">` +
              `<animate attributeName="visibility" values="${values}" keyTimes="${keyTimes}" calcMode="discrete" dur="${cycle}ms" repeatCount="indefinite"/>` +
              `${rects(frame, px)}</g>`
            )
          })
          .join('')
  return {
    source: `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" shape-rendering="crispEdges">${body}</svg>`,
    width,
    height,
    isAnimated: frames.length > 1,
  }
}

// The terminal's named colours, for SVG fills.
const NAMED: Record<string, string> = {
  red: '#ff5f5f',
  green: '#5ad27a',
  yellow: '#ffd23c',
  blue: '#5aa9ff',
  magenta: '#c88cff',
  cyan: '#56c8dc',
  white: '#e6e6e6',
  gray: '#8a8a8a',
}

export const fillOf = (color: string): string => NAMED[color] ?? color

// CSS pixels a pane column is taken to span; an overestimate only scales a drawing down to its slot.
export const COLUMN_PX = 8
export const BAR_HEIGHT = 8

// A rounded gauge `columns` cells wide: the filled share in `color`, the rest a faint track.
export const barSvg = (value: number, max: number, columns: number, color: string): string => {
  const width = Math.max(1, columns) * COLUMN_PX
  const share = max <= 0 ? 0 : Math.max(0, Math.min(value, max)) / max
  const r = BAR_HEIGHT / 2
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${BAR_HEIGHT}" viewBox="0 0 ${width} ${BAR_HEIGHT}">` +
    `<clipPath id="g"><rect width="${width}" height="${BAR_HEIGHT}" rx="${r}"/></clipPath>` +
    `<g clip-path="url(#g)"><rect width="${width}" height="${BAR_HEIGHT}" fill="#888888" fill-opacity="0.22"/>` +
    `<rect width="${(share * width).toFixed(2)}" height="${BAR_HEIGHT}" fill="${fillOf(color)}"/></g></svg>`
  )
}
