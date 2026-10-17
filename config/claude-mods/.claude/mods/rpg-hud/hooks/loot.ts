// What one turn of the main loop won, shown after the line that closes it in the transcript:
// `🤺 Battled for 5m · +12 XP · 3 files forged · ☠×1 · ✦ Lv.4`.

export type Loot = {
  // Main-loop calls that ran, one XP each.
  xp: number
  // Files the turn's edits landed in, each once.
  forged: string[]
  bosses: number
  // The level reached, when the turn levelled up.
  level?: number
}

// A finished turn's loot waiting for its closing line, known by the turn's length.
export type TurnLoot = Loot & { durationMs: number }

export const EMPTY_LOOT: Loot = { xp: 0, forged: [], bosses: 0 }

// Turns waiting for their line; one never drawn (too short for a line) falls out.
export const KEPT_UNCLAIMED = 5
// Lines that keep their loot, for a scroll back up the transcript.
export const KEPT_CLAIMED = 100
// How far the line's duration may stray from the one the turn reported.
const DURATION_SLACK_MS = 1500

export const forge = (loot: Loot, path: string): Loot =>
  loot.forged.includes(path) ? loot : { ...loot, forged: [...loot.forged, path] }

// `+12 XP · 3 files forged · ☠×1 · ✦ Lv.4`; empty when the turn won nothing.
export const lootText = (loot: Loot): string => {
  const parts: string[] = []
  if (loot.xp > 0) parts.push(`+${loot.xp} XP`)
  if (loot.forged.length > 0) parts.push(`${loot.forged.length} ${loot.forged.length === 1 ? 'file' : 'files'} forged`)
  if (loot.bosses > 0) parts.push(`☠×${loot.bosses}`)
  if (loot.level !== undefined) parts.push(`✦ Lv.${loot.level}`)
  return parts.join(' · ')
}

// The waiting turn a line of `durationMs` closes: the nearest in length, -1 when none is near enough.
export const claimLoot = (unclaimed: readonly TurnLoot[], durationMs: number): number => {
  let best = -1
  unclaimed.forEach((loot, at) => {
    const gap = Math.abs(loot.durationMs - durationMs)
    if (gap <= DURATION_SLACK_MS && (best === -1 || gap < Math.abs(unclaimed[best]!.durationMs - durationMs))) best = at
  })
  return best
}
