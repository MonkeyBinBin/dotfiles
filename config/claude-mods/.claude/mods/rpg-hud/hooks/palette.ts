// The HUD's colours as the sprites paint them: text drawn in these hexes matches the pixel art beside it whatever
// the terminal's ANSI theme does to its named colours. Grey, dim text and the theme's own names (warning, error)
// stay as they are; this is for the colours the HUD picks on purpose.

export const RGB = {
  gold: 0xffd23c,
  red: 0xff5f5f,
  green: 0x5ad27a,
  cyan: 0x56c8dc,
  blue: 0x5aa9ff,
  magenta: 0xc88cff,
  pink: 0xff8caa,
  white: 0xe6e6e6,
  gray: 0x8a8a8a,
} as const

export type Hue = keyof typeof RGB

export const hexOf = (rgb: number): string => `#${(rgb & 0xffffff).toString(16).padStart(6, '0')}`

export const HEX = Object.fromEntries(Object.entries(RGB).map(([hue, rgb]) => [hue, hexOf(rgb)])) as Record<Hue, string>

// The ANSI names the HUD's tables were written in, as the palette's hexes. White stays the terminal's own (on a
// light theme the default foreground reads where a fixed white would vanish), and grey stays dim.
const NAMED: Readonly<Record<string, string>> = {
  yellow: HEX.gold,
  red: HEX.red,
  green: HEX.green,
  cyan: HEX.cyan,
  blue: HEX.blue,
  magenta: HEX.magenta,
}

// A named colour as the palette's hex; hexes, grey, white and theme names pass through.
export const tone = (color: string): string => NAMED[color] ?? color

// The rarity ladder shared by the spell book, the bag and the skills: a glyph and a colour per tier.
export type Tier = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary'
export const TIERS: Readonly<Record<Tier, { glyph: string; color: string }>> = {
  common: { glyph: '◇', color: 'white' },
  uncommon: { glyph: '◆', color: HEX.green },
  rare: { glyph: '◆', color: HEX.blue },
  epic: { glyph: '✦', color: HEX.magenta },
  legendary: { glyph: '★', color: HEX.gold },
}

// How a call, a pet or a job stands, one mark for all three lists: under way, back, fallen, recalled, ended.
export type Standing = 'run' | 'ok' | 'err' | 'kill' | 'ended' | 'deny'
export const STATUS_MARKS: Readonly<Record<Standing, { glyph: string; color: string }>> = {
  run: { glyph: '✦', color: HEX.gold },
  ok: { glyph: '✓', color: HEX.green },
  err: { glyph: '✗', color: HEX.red },
  kill: { glyph: '■', color: 'gray' },
  ended: { glyph: '·', color: 'gray' },
  deny: { glyph: '⊘', color: 'gray' },
}

const mix = (from: number, to: number, t: number): number => {
  const channel = (shift: number) => {
    const a = (from >> shift) & 0xff
    const b = (to >> shift) & 0xff
    return Math.round(a + (b - a) * t) & 0xff
  }
  return (channel(16) << 16) | (channel(8) << 8) | channel(0)
}

export const mixRgb = mix

// A gauge's colour at `share` full: `healthy` from 60% up, sliding through gold to red as it drains.
export const rampRgb = (share: number, healthy: number): number => {
  const s = Math.max(0, Math.min(1, share))
  if (s >= 0.6) return healthy
  if (s >= 0.3) return mix(RGB.gold, healthy, (s - 0.3) / 0.3)
  return mix(RGB.red, RGB.gold, s / 0.3)
}

export const ramp = (share: number, healthy: number): string => hexOf(rampRgb(share, healthy))

// A colour lifted toward white by `t`, for a gauge's lit top edge and a flash.
export const lighten = (rgb: number, t: number): number => mix(rgb, 0xffffff, t)
export const darken = (rgb: number, t: number): number => mix(rgb, 0x000000, t)
