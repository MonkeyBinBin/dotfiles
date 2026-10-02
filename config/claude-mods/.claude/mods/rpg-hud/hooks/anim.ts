import type { Timer } from 'claude-code'

import type { Tab } from '../types'
import { HERO_CLASS_FRAMES, HERO_SIZE } from './hero-cells'
import type { HeroClassId } from './hero-cells'

export const HERO_CELLS = { columns: HERO_SIZE.columns, rows: HERO_SIZE.rows }

export type Mood = 'idle' | 'cast' | 'hurt'

export const FRAME_MS = 100
// Ticks each frame of a mood stays on screen.
const FRAME_TICKS: Record<Mood, number> = { idle: 5, cast: 2, hurt: 3 }
// Ticks each frame of a running pet stays on screen.
export const PET_TICKS = 4
// The smoke puff plays once through after a failed call.
// Every class's puff has the wizard's length.
export const HURT_MS = FRAME_MS * FRAME_TICKS.hurt * HERO_CLASS_FRAMES.wizard.hurt.length

export const pickMood = (running: number, hurtLeftMs: number): Mood => {
  if (hurtLeftMs > 0) return 'hurt'
  return running > 0 ? 'cast' : 'idle'
}

// `tick` counts from the moment the mood began.
export const pickFrame = (mood: Mood, tick: number, hero: HeroClassId = 'wizard'): string => {
  const frames: readonly string[] = HERO_CLASS_FRAMES[hero][mood]
  const frame = frames[Math.floor(tick / FRAME_TICKS[mood]) % frames.length]
  if (frame === undefined) throw new Error(`no ${mood} frames in hero-cells.ts`)
  return frame
}

// The pane's animation: runs while its Rasters take blits, stops once one refuses.
// Module state, so a reload starts it over.
export const anim = {
  running: 0,
  hurtUntil: 0,
  ticker: undefined as Timer | undefined,
  tab: 'spells' as Tab,
  // The class the session rolled; the portrait animates its frames.
  heroClass: 'wizard' as HeroClassId,
  // Whether the status panel drew the portrait this time; a narrow pane leaves it out.
  hasHero: false,
  mood: 'idle' as Mood,
  moodTick: 0,
  tick: 0,
  shownCells: pickFrame('idle', 0),
  // Running pets on screen, by Raster key, with the kind that picks their sprite.
  pets: new Map<string, { kind: string; shown: string }>(),
}
