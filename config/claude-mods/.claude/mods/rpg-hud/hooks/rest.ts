// A compaction is a night at the inn: the MP left before it pours back to what the window holds now.

// How long the MP bar takes to pour back.
export const REST_MS = 2500

// The MP the bar shows `elapsed` into a rest: from what was left to what is now, easing in.
export const restingMana = (from: number, to: number, elapsed: number): number => {
  const t = Math.min(1, Math.max(0, elapsed / REST_MS))
  return Math.round(from + (to - from) * (1 - (1 - t) ** 3))
}
