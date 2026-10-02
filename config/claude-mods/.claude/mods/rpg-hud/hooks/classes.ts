import { HERO_CLASS_FRAMES } from './hero-cells'
import type { HeroClassId } from './hero-cells'

export type { HeroClassId }

export type HeroClass = {
  id: HeroClassId
  // `CLAUDE THE <title>` heads the status panel.
  title: string
  // The panel's frame and the name's colour.
  color: string
  // Titles from level 1, 3, 5, 7 and 10.
  ranks: readonly [string, string, string, string, string]
  // The status line while a tool runs, and while none does.
  acting: string
  resting: string
  // What the failures count as: `3 spells fizzled`.
  failures: string
}

export const CLASSES: Readonly<Record<HeroClassId, HeroClass>> = {
  wizard: {
    id: 'wizard',
    title: 'WIZARD',
    color: 'magenta',
    ranks: ['Apprentice', 'Adept', 'Sorcerer', 'Archmage', 'Grand Wizard'],
    acting: '✦ casting',
    resting: '☾ meditating in the tower',
    failures: 'spells fizzled',
  },
  knight: {
    id: 'knight',
    title: 'KNIGHT',
    color: 'red',
    ranks: ['Squire', 'Knight', 'Knight-Captain', 'Paladin', 'Lord Commander'],
    acting: '⚔ striking',
    resting: '⛨ standing guard',
    failures: 'blows parried',
  },
  ranger: {
    id: 'ranger',
    title: 'RANGER',
    color: 'green',
    ranks: ['Scout', 'Tracker', 'Pathfinder', 'Warden', 'Ranger Lord'],
    acting: '➶ shooting',
    resting: '♣ scouting the woods',
    failures: 'arrows missed',
  },
  rogue: {
    id: 'rogue',
    title: 'ROGUE',
    color: '#a78bfa',
    ranks: ['Cutpurse', 'Shadow', 'Nightblade', 'Phantom', 'Guildmaster'],
    acting: '✧ sneaking',
    resting: '☾ lurking in the shadows',
    failures: 'traps sprung',
  },
  cleric: {
    id: 'cleric',
    title: 'CLERIC',
    color: 'yellow',
    ranks: ['Acolyte', 'Priest', 'Bishop', 'Saint', 'Oracle'],
    acting: '✚ praying',
    resting: '✧ tending the shrine',
    failures: 'prayers unanswered',
  },
  artificer: {
    id: 'artificer',
    title: 'ARTIFICER',
    color: '#e0874a',
    ranks: ['Tinker', 'Mechanic', 'Engineer', 'Inventor', 'Grand Artificer'],
    acting: '⚙ tinkering',
    resting: '⚙ oiling the gears',
    failures: 'gadgets misfired',
  },
}

export const CLASS_IDS = Object.keys(HERO_CLASS_FRAMES) as HeroClassId[]

export const isClassId = (value: string): value is HeroClassId => CLASS_IDS.includes(value as HeroClassId)

export const classOf = (id: string | undefined): HeroClass => CLASSES[id !== undefined && isClassId(id) ? id : 'wizard']

// A class at random; `roll` in [0, 1) as Math.random gives, `not` to roll something else.
export const rollClass = (roll: number, not?: string): HeroClassId => {
  const pool = CLASS_IDS.filter(id => id !== not)
  return pool[Math.min(pool.length - 1, Math.floor(roll * pool.length))] ?? 'wizard'
}

const RANK_LEVELS = [1, 3, 5, 7, 10] as const

export const rankOf = (hero: HeroClass, level: number): string => {
  let rank = hero.ranks[0]
  RANK_LEVELS.forEach((from, at) => {
    if (level >= from) rank = hero.ranks[at] ?? rank
  })
  return rank
}
