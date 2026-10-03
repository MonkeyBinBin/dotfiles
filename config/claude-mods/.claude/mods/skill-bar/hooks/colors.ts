// Each slot's own colour, for its frame and label under the pointer: bright game-item colours, in a shuffled
// order so neighbours never look like a gradient.
export const SKILL_COLORS = [0x5ad27a, 0xff5a5a, 0x56c8dc, 0xffd23c, 0xc88cff, 0xffa53c, 0x5aa9ff, 0xff8caa] as const

// By slot: up to eight skills each get a different colour, and the same list keeps the same colours.
export const colorFor = (slot: number): number => SKILL_COLORS[slot % SKILL_COLORS.length] ?? SKILL_COLORS[0]

export const toHex = (rgb: number): string => `#${rgb.toString(16).padStart(6, '0')}`
