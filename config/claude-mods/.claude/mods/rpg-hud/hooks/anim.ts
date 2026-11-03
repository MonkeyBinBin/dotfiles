import type { Timer } from 'claude-code'

import type { Tab } from '../types'
import type { Burst } from './fx'
import { HERO_CLASS_FRAMES, HERO_SIZE } from './hero-cells'
import type { HeroClassId } from './hero-cells'

export const HERO_CELLS = { columns: HERO_SIZE.columns, rows: HERO_SIZE.rows }

export type Mood = 'idle' | 'cast' | 'hurt'

export const FRAME_MS = 100
// Ticks each frame of a mood stays on screen.
export const FRAME_TICKS: Record<Mood, number> = { idle: 5, cast: 2, hurt: 3 }
// Ticks each frame of a running pet stays on screen.
export const PET_TICKS = 4
// Ticks each frame of the overworld's idle animation stays on screen.
export const OVERWORLD_TICKS = 6
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
  // Whether the portrait is a picture (an Image swapped frame by frame) rather than Raster cells.
  heroImage: false,
  shownPng: '',
  // Running pets on screen, by Raster key, with the seed that picks their sprite.
  pets: new Map<string, { seed: string; shown: string }>(),
  // The encounter card's monster while on screen: the frames of the moment it plays, from the tick it began.
  // The combo's aura beside the portrait, while one burns.
  aura: undefined as { frames: string[]; shown: string } | undefined,
  // `base` is the monster's frame last painted, `shown` what is on screen: the base with any arena burst laid on.
  boss: undefined as { key: string; frames: string[]; ticks: number; loop: boolean; columns: number; rows: number; start: number; base: string; shown: string } | undefined,
  // A burst over the arena as half-block cells, where the terminal draws no pictures: laid onto the monster's
  // cells from the moment (ms) it began, a frame a tick, at (left, top) in the arena.
  bossOverlay: undefined as { at: number; frames: string[]; columns: number; left: number; top: number } | undefined,
  // Running jobs on screen, by Raster key: the march strip shown last.
  jobs: new Map<string, { shown: string }>(),
  // The map tab's overworld while on screen: its frames as Raster cells and the one shown.
  overworld: undefined as { frames: string[]; columns: number; rows: number; shown: string } | undefined,
  // Baked bursts playing, by Image key: the burst, the moment it began (ms) and the frame shown. Each leaves once
  // played through, and the pane is drawn again without it.
  bursts: new Map<string, { burst: Burst; at: number; shown: string }>(),
  // Raster cells played once, by key: a pet fainting, a hero's colour coming back, an aura going out. From the
  // moment (ms) they began, `frameMs` a frame, the last held.
  sprites: new Map<string, { frames: string[]; at: number; frameMs: number; columns: number; rows: number; shown: string }>(),
  // A gauge that pulses (MP running low): its frames in turn, `ticks` each.
  pulse: undefined as { key: string; frames: string[]; ticks: number; columns: number; shown: string } | undefined,
  // Running spells' marks on screen, by Raster key: the glyph shown last.
  spells: new Map<string, { shown: string }>(),
}
