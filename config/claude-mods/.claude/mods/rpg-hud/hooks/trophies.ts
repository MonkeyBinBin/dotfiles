import type { Progress } from '../types'

export const EMPTY_PROGRESS: Progress = {
  totalCalls: 0,
  bashCalls: 0,
  bestCombo: 0,
  turnStreak: 0,
  bestTurnStreak: 0,
  bossesDefeated: 0,
  petsSummoned: 0,
  maxPetsAtOnce: 0,
  peakContext: 0,
  isNightOwl: false,
  classesPlayed: [],
  skillUses: {},
  unlocked: {},
}

export type Trophy = { id: string; title: string; hint: string; isEarned: (p: Progress) => boolean }

export const TROPHIES: readonly Trophy[] = [
  { id: 'first-cast', title: 'First Spark', hint: 'Cast your first spell', isEarned: p => p.totalCalls >= 1 },
  { id: 'centurion', title: 'Centurion', hint: 'Cast 100 spells', isEarned: p => p.totalCalls >= 100 },
  { id: 'thousand', title: 'Tome of a Thousand', hint: 'Cast 1,000 spells', isEarned: p => p.totalCalls >= 1000 },
  { id: 'shell-adept', title: 'Shell Adept', hint: 'Run Bash 100 times', isEarned: p => p.bashCalls >= 100 },
  { id: 'combo-20', title: 'Chain Caster', hint: 'Reach a 20-spell combo', isEarned: p => p.bestCombo >= 20 },
  { id: 'combo-50', title: 'Unbroken', hint: 'Reach a 50-spell combo', isEarned: p => p.bestCombo >= 50 },
  { id: 'flawless', title: 'Flawless', hint: '10 turns in a row without a fizzle', isEarned: p => p.bestTurnStreak >= 10 },
  { id: 'boss-slayer', title: 'Boss Slayer', hint: 'Defeat a failing test or lint run', isEarned: p => p.bossesDefeated >= 1 },
  { id: 'boss-hunter', title: 'Boss Hunter', hint: 'Defeat 10 bosses', isEarned: p => p.bossesDefeated >= 10 },
  { id: 'summoner', title: 'Summoner', hint: 'Summon your first pet', isEarned: p => p.petsSummoned >= 1 },
  { id: 'pack-leader', title: 'Pack Leader', hint: 'Have 3 pets out at once', isEarned: p => p.maxPetsAtOnce >= 3 },
  { id: 'scholar', title: 'Scholar', hint: 'Use 5 different skills', isEarned: p => Object.keys(p.skillUses).length >= 5 },
  { id: 'deep-diver', title: 'Deep Diver', hint: 'Fill the context window to 80%', isEarned: p => p.peakContext >= 80 },
  { id: 'jack', title: 'Jack of All Trades', hint: 'Play every hero class', isEarned: p => p.classesPlayed.length >= 6 },
  { id: 'night-owl', title: 'Night Owl', hint: 'Cast between midnight and 4 a.m.', isEarned: p => p.isNightOwl },
]

// Trophies the progress has earned that are not unlocked yet.
export const newlyEarned = (p: Progress): Trophy[] => TROPHIES.filter(t => p.unlocked[t.id] === undefined && t.isEarned(p))
