// One character per pixel; '.' is see-through. Same half-block style as slime-band.
export const ICON_WIDTH = 4
// Two pixels tall: one terminal row of half blocks, so it sits inline with its label.
export const ICON_ROWS = 1

const PALETTE: Record<string, number> = {
  Y: 0xb5793c, // rolled ends
  p: 0xf0dcaa, // parchment
  k: 0x6d4220, // ink
}

// Every skill wears the same scroll; 'c' is the skill's own colour (rolled ends and seal).
export const SCROLL = ['cppc', 'ckkc'] as const

// Bright game-item colours, in a shuffled order so neighbours never look like a gradient.
export const SKILL_COLORS = [0x5ad27a, 0xff5a5a, 0x56c8dc, 0xffd23c, 0xc88cff, 0xffa53c, 0x5aa9ff, 0xff8caa] as const

// By slot: up to eight skills each get a different colour, and the same list keeps the same colours.
export const colorFor = (slot: number): number => SKILL_COLORS[slot % SKILL_COLORS.length] ?? SKILL_COLORS[0]

export const toHex = (rgb: number): string => `#${rgb.toString(16).padStart(6, '0')}`

const UPPER_HALF = 0x2580
const LOWER_HALF = 0x2584
const SPACE = 0x20
const DEFAULT_COLOR = 0x01000000

const colorAt = (icon: readonly string[], x: number, y: number, tint: number): number | undefined => {
  const ch = icon[y]?.[x] ?? '.'
  return ch === 'c' ? tint : PALETTE[ch]
}

// The icon as Raster cells: two pixel rows per terminal row; 'c' pixels take `tint`.
export const composeIcon = (icon: readonly string[], tint: number = PALETTE.Y ?? 0): string => {
  const words = new Uint32Array(ICON_WIDTH * ICON_ROWS * 3)
  for (let row = 0; row < ICON_ROWS; row += 1) {
    for (let col = 0; col < ICON_WIDTH; col += 1) {
      const at = (row * ICON_WIDTH + col) * 3
      const top = colorAt(icon, col, row * 2, tint)
      const bottom = colorAt(icon, col, row * 2 + 1, tint)
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
