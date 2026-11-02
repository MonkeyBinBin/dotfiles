// Each slot's own colour, for its frame and label under the pointer: bright game-item colours, in a shuffled
// order so neighbours never look like a gradient. The red is the other rpg mods' red.
export const SKILL_COLORS = [0x5ad27a, 0xff5f5f, 0x56c8dc, 0xffd23c, 0xc88cff, 0xffa53c, 0x5aa9ff, 0xff8caa] as const

// FNV-1a over the name: the same skill hashes the same in every session and every slot.
const hashOf = (name: string): number => {
  let hash = 0x811c9dc5
  for (const ch of name) hash = Math.imul(hash ^ ch.charCodeAt(0), 0x01000193) >>> 0
  return hash
}

// By name: a skill keeps its colour wherever it sits on the bar.
export const colorFor = (name: string): number => SKILL_COLORS[hashOf(name) % SKILL_COLORS.length] ?? SKILL_COLORS[0]

// The bar's colours: each skill its own, but a slot that would match its left neighbour takes the next colour.
export const colorsFor = (names: readonly string[]): number[] => {
  const colors: number[] = []
  for (const name of names) {
    let at = hashOf(name) % SKILL_COLORS.length
    if (SKILL_COLORS[at] === colors[colors.length - 1]) at = (at + 1) % SKILL_COLORS.length
    colors.push(SKILL_COLORS[at] ?? SKILL_COLORS[0])
  }
  return colors
}

export const toHex = (rgb: number): string => `#${rgb.toString(16).padStart(6, '0')}`

// The panel colour the cells are tinted from, as rpg-hud's dark cards.
export const PANEL = 0x14111c
export const WHITE = 0xffffff

// `rgb` mixed into `base`: 0 is all base, 1 all rgb.
export const mix = (rgb: number, base: number, amount: number): number => {
  const channel = (shift: number) => {
    const from = (base >> shift) & 0xff
    const to = (rgb >> shift) & 0xff
    return Math.round(from + (to - from) * amount) << shift
  }
  return channel(16) | channel(8) | channel(0)
}
