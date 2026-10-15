import type { Tab } from '../types'

// The half-block icons, drawn for a terminal without pictures: 9x8 pixels, outlined and shaded like the hero's
// bust; nine wide, so from 65 columns a card leaves a column either side of it. Eight pixels tall:
// four terminal rows of half blocks.
export const ICON_COLUMNS = 9
export const ICON_ROWS = 4

export type MenuEntry = {
  id: Tab
  // At most five letters, so the label fits a thirteen-column slot with room to spare.
  label: string
  title: string
  color: string
  pixels: readonly string[]
}

const PALETTE: Record<string, number> = {
  k: 0x0a0a0c, W: 0xfff0dc,
  V: 0x8c5ad2, v: 0x5a3296, Y: 0xffd23c, y: 0xb48c1e, C: 0xfae6ad,
  L: 0x9be36b, G: 0x5ad27a, g: 0x2d8c4b,
  T: 0xf0dcaa, t: 0xc8a870, M: 0x7a4a1c, R: 0xff5a5a, F: 0x3a9a4a,
  B: 0x5aa9ff, b: 0x2a5fb4,
  K: 0x191e23, H: 0x7ae68a,
}

export const MENU: readonly MenuEntry[] = [
  {
    id: 'spells',
    label: 'Spell',
    title: '📖 SPELL BOOK',
    color: 'magenta',
    // A closed spellbook: gold corners and clasp, a gold star on the cover, the pages' cream edge.
    pixels: ['.kkkkkkk.', 'kYVVVVYCk', 'kVVYYVvCk', 'kVYYYYVCk', 'kVVYYVYCk', 'kvVVVVvCk', 'kYvvvvYCk', '.kkkkkkk.'],
  },
  {
    id: 'pets',
    label: 'Party',
    title: '🐾 PARTY',
    color: 'green',
    // A round slime: lit from the top left, a white shine, two eyes, a shaded base.
    pixels: ['...kkk...', '..kLLGk..', '.kLWGGGk.', 'kGLGGGGGk', 'kGkGGGkGk', 'kGGGGGGgk', 'kgggggggk', '.kkkkkkk.'],
  },
  {
    id: 'map',
    label: 'Map',
    title: '🧭 WORLD MAP',
    color: 'cyan',
    // A treasure map between rolled ends: a tree, a dotted path heading for a red X.
    pixels: ['MkkkkkkkM', 'MTTTTRTRM', 'MTFTTTRtM', 'MFFFTRTRM', 'MTMTTTTtM', 'MTTTRTTtM', 'MtRtttttM', 'MkkkkkkkM'],
  },
  {
    id: 'skills',
    label: 'Skill',
    title: '📜 SKILLS',
    color: 'blue',
    // A gold star with a blue gem at its heart, shaded on its lower points.
    pixels: ['....k....', '...kYk...', 'kkkYYYkkk', 'kYYYBYYYk', '.kyYBYyk.', '.kyYYYyk.', 'kyYk.kYyk', 'kkk...kkk'],
  },
  {
    id: 'jobs',
    label: 'Jobs',
    title: '⚙ JOBS',
    color: 'yellow',
    // A terminal in a gold frame: green lines of output and a white cursor.
    pixels: ['.kkkkkkk.', 'kYYYYYYYk', 'kYKHHHKYk', 'kYKKKKKYk', 'kYKHHKKYk', 'kYKKKWKYk', 'kyyyyyyyk', '.kkkkkkk.'],
  },
]

export const entryOf = (id: string): MenuEntry => MENU.find(entry => entry.id === id) ?? MENU[0]!

export const isTab = (value: string): value is Tab => MENU.some(entry => entry.id === value)

// Unselected slots show their icon at this share of its brightness.
const DIM = 0.4

const dim = (rgb: number): number => {
  const channel = (shift: number) => Math.round(((rgb >> shift) & 0xff) * DIM)
  return (channel(16) << 16) | (channel(8) << 8) | channel(0)
}

const DIM_PALETTE = Object.fromEntries(Object.entries(PALETTE).map(([key, rgb]) => [key, dim(rgb)]))

// Off the terminal an unselected icon goes grey rather than dark: its own light, lifted toward a mid grey,
// so it reads as resting next to the selected slot's colours instead of as a muddy smudge.
const toGray = (rgb: number): number => {
  const luma = 0.299 * ((rgb >> 16) & 0xff) + 0.587 * ((rgb >> 8) & 0xff) + 0.114 * (rgb & 0xff)
  const level = Math.round(0x50 + luma * 0.45)
  return (level << 16) | (level << 8) | level
}

const GRAY_PALETTE = Object.fromEntries(Object.entries(PALETTE).map(([key, rgb]) => [key, toGray(rgb)]))

// Off the terminal a card draws the same 9x8 icon a terminal draws as half-block text, as a drawing: the desktop
// draws no pictures (an SVG's data-URI images are scrubbed), so both show the one hand-drawn icon.
export const drawnIcon = (entry: MenuEntry, isSelected: boolean): { art: readonly string[]; palette: Record<string, number> } => ({
  art: entry.pixels,
  palette: isSelected ? PALETTE : GRAY_PALETTE,
})

// One terminal cell of an icon drawn as text: the glyph, its colour and the colour behind it.
export type TextCell = [glyph: string, color: string | null, background: string | null]

const hex = (rgb: number | undefined): string | null =>
  rgb === undefined ? null : `#${rgb.toString(16).padStart(6, '0')}`

// The icon as rows of half-block text cells, for a Client, which draws no Raster.
export const iconText = (entry: MenuEntry, isSelected: boolean): TextCell[][] => {
  const palette = isSelected ? PALETTE : DIM_PALETTE
  const colorAt = (x: number, y: number) => palette[entry.pixels[y]?.[x] ?? '.']
  return Array.from({ length: ICON_ROWS }, (_, row) =>
    Array.from({ length: ICON_COLUMNS }, (_, col): TextCell => {
      const top = colorAt(col, row * 2)
      const bottom = colorAt(col, row * 2 + 1)
      if (top === undefined && bottom === undefined) return [' ', null, null]
      if (top === undefined) return ['▄', hex(bottom), null]
      return ['▀', hex(top), hex(bottom)]
    }),
  )
}
