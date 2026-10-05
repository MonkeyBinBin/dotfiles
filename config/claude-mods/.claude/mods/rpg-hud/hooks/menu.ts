import type { Tab } from '../types'

export const ICON_COLUMNS = 8
// Six pixels tall: three terminal rows of half blocks.
export const ICON_ROWS = 3

export type MenuEntry = {
  id: Tab
  // At most five letters, so the label fits a ten-column slot with room to spare.
  label: string
  title: string
  color: string
  pixels: readonly string[]
}

const PALETTE: Record<string, number> = {
  V: 0x8c5ad2, v: 0x5a3296, Y: 0xffd23c, y: 0xb48c1e, W: 0xfff0dc,
  G: 0x5ad27a, g: 0x2d8c4b, K: 0x191e23,
  T: 0xf0dcaa, t: 0xa0643c, R: 0xff5a5a,
  B: 0x5aa9ff, b: 0x2a5fb4,
}

export const MENU: readonly MenuEntry[] = [
  {
    id: 'spells',
    label: 'Spell',
    title: '📖 SPELL BOOK',
    color: 'magenta',
    pixels: ['.VVVVVV.', 'VWYYYYVv', 'VWYVVYVv', 'VWYYYYVv', 'VWVVVVVv', '.vvvvvv.'],
  },
  {
    id: 'pets',
    label: 'Party',
    title: '🐾 PARTY',
    color: 'green',
    pixels: ['........', '..GGGG..', '.GWGGGG.', 'GGKGGKGG', 'GGGGGGGG', '.gggggg.'],
  },
  {
    id: 'map',
    label: 'Map',
    title: '🧭 WORLD MAP',
    color: 'cyan',
    pixels: ['TTTTTTTT', 'TtTTTRTR', 'TTtTTTRT', 'TTTtTRTR', 'TTTTtTTT', 'tttttttt'],
  },
  {
    id: 'skills',
    label: 'Skill',
    title: '📜 SKILLS',
    color: 'blue',
    pixels: ['...YY...', '...YY...', 'YYYBBYYY', '.YYYYYY.', '.YY..YY.', 'Y......Y'],
  },
  {
    id: 'jobs',
    label: 'Jobs',
    title: '⚙ JOBS',
    color: 'yellow',
    pixels: ['yyyyyyyy', 'yKKKKKKy', 'yKGKKKKy', 'yKKGKKKy', 'yKGKWWKy', 'yyyyyyyy'],
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
