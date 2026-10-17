// A combo's aura: sparks rising beside the portrait, gold from a combo of ten and every colour from twenty, as
// rpg-battle's SUPER and ULTRA tiers. Two columns of half blocks as tall as the portrait.

export const AURA_COLUMNS = 2
export const AURA_FRAMES = 8
export const AURA_TIERS = [10, 20] as const

const GOLD = [0xffe14a, 0xfff3a0, 0xffb02e]
const RAINBOW = [0xff4a4a, 0xffb02e, 0xffe14a, 0x5ad27a, 0x5aa9ff, 0xb466ff]

// 0 under a combo of ten, 1 gold, 2 rainbow.
export const auraTier = (combo: number): 0 | 1 | 2 => (combo >= AURA_TIERS[1] ? 2 : combo >= AURA_TIERS[0] ? 1 : 0)

// The aura's frames for a portrait `rows` terminal rows tall: a colour per pixel, undefined see-through.
export const auraFrames = (tier: 1 | 2, rows: number): (number | undefined)[][][] => {
  const height = rows * 2
  const colors = tier === 2 ? RAINBOW : GOLD
  const sparks = tier === 2 ? 7 : 5
  return Array.from({ length: AURA_FRAMES }, (_, frame) => {
    const pixels: (number | undefined)[][] = Array.from({ length: height }, () => Array.from({ length: AURA_COLUMNS }, () => undefined))
    for (let k = 0; k < sparks; k += 1) {
      // Each spark climbs two pixels a frame from its own start, the next column over every other one.
      const y = height - 1 - ((frame * 2 + k * Math.ceil(height / sparks)) % height)
      const x = (k + Math.floor(frame / 2)) % AURA_COLUMNS
      const row = pixels[y]
      if (row !== undefined) row[x] = colors[(k + frame) % colors.length]
    }
    return pixels
  })
}
