import type { ToolCallStatus } from '../types'
import { composeSprite } from './util'

export const PET_COLUMNS = 8
// Six pixels tall: three terminal rows of half blocks.
export const PET_ROWS = 3

type Species = {
  name: string
  color: string
  palette: Record<string, number>
  frames: readonly [readonly string[], readonly string[]]
}

const SLIME: Species = {
  name: 'Slime',
  color: 'blue',
  palette: { G: 0x5aa9ff, g: 0x2a5fb4, L: 0xd2e8ff, K: 0x191e23 },
  frames: [
    ['........', '..GGGG..', '.GLGGGG.', 'GGKGGKGG', 'GGGGGGGG', '.gggggg.'],
    ['........', '........', '.GGGGGG.', 'GLGKGGKG', 'GGGGGGGG', 'gggggggg'],
  ],
}

const HAWK: Species = {
  name: 'Scout Hawk',
  color: 'yellow',
  palette: { B: 0xa0643c, H: 0xf0dcaa, K: 0x191e23, O: 0xffa53c },
  frames: [
    ['B......B', 'BB.HH.BB', '.BBHKBB.', '..BBBB..', '...BB...', '...O.O..'],
    ['........', '...HH...', '..BHKB..', 'BBBBBBBB', 'B..BB..B', '...O.O..'],
  ],
}

const OWL: Species = {
  name: 'Sage Owl',
  color: 'magenta',
  palette: { O: 0x8c64c8, W: 0xffffff, K: 0x191e23, Y: 0xffd23c, c: 0xd2b4f0 },
  frames: [
    ['.O....O.', '.OOOOOO.', 'OWKOOKWO', 'OOOYYOOO', '.OccccO.', '..Y..Y..'],
    ['.O....O.', '.OOOOOO.', 'OKKOOKKO', 'OOOYYOOO', '.OccccO.', '..Y..Y..'],
  ],
}

const WISP: Species = {
  name: 'Wisp',
  color: 'cyan',
  palette: { W: 0xb4f0ff, K: 0x1e3c5a },
  frames: [
    ['..WWWW..', '.WWWWWW.', 'WWKWWKWW', 'WWWWWWWW', 'WWWWWWWW', 'W.WW.WW.'],
    ['........', '..WWWW..', '.WWWWWW.', 'WWKWWKWW', 'WWWWWWWW', '.WW.WW.W'],
  ],
}

const FOX: Species = {
  name: 'Code Fox',
  color: 'red',
  palette: { F: 0xff7832, W: 0xfff0dc, K: 0x191e23 },
  frames: [
    ['F.....F.', 'FF...FF.', 'FFFFFFF.', 'FKFFKFF.', '.FWWWF..', '..F.F...'],
    ['........', 'F.....F.', 'FF...FF.', 'FFFFFFF.', 'FKFFKFF.', '.FWWWFF.'],
  ],
}

const BAT: Species = {
  name: 'Night Bat',
  color: 'magenta',
  palette: { B: 0x6a4690, b: 0x3a2850, R: 0xff3c50 },
  frames: [
    ['B......B', 'BB....BB', 'BBBBBBBB', '.BRBBRB.', '..BBBB..', '...bb...'],
    ['........', '........', '.BBBBBB.', 'BBRBBRBB', 'B.BBBB.B', '...bb...'],
  ],
}

const FROG: Species = {
  name: 'Bog Frog',
  color: 'green',
  palette: { F: 0x5ac85a, f: 0x2f7a3a, W: 0xffffff, K: 0x191e23, P: 0xff8ca0 },
  frames: [
    ['........', '.WW..WW.', 'FKWFFKWF', 'FFFFFFFF', 'FFPPPPFF', 'ff....ff'],
    ['.WW..WW.', 'FKWFFKWF', 'FFFFFFFF', 'FFPPPPFF', '.f....f.', '........'],
  ],
}

const CAT: Species = {
  name: 'Shadow Cat',
  color: 'white',
  palette: { C: 0xc8c8d2, c: 0x8c8c9b, K: 0x191e23, P: 0xffa0b4 },
  frames: [
    ['C...C...', 'CCCCC...', 'CKCKC..C', 'CCPCC..C', '.CCCCCCC', '.c.c..c.'],
    ['C...C...', 'CCCCC..C', 'CKCKC.C.', 'CCPCC.C.', '.CCCCCC.', 'c.c..c..'],
  ],
}

const TURTLE: Species = {
  name: 'Shell Turtle',
  color: 'green',
  palette: { S: 0x3c9650, s: 0x8cd264, H: 0xb4dc78, K: 0x191e23 },
  frames: [
    ['........', '.SSSS...', 'SsSSsSHH', 'SSSSSSHK', '.H..H...', '........'],
    ['........', '.SSSS...', 'SsSSsSHH', 'SSSSSSHK', 'H..H....', '........'],
  ],
}

const SHROOM: Species = {
  name: 'Spore Shroom',
  color: 'red',
  palette: { R: 0xe63c3c, W: 0xffffff, T: 0xf0dcb4, K: 0x191e23 },
  frames: [
    ['..RRRR..', '.RWRRWR.', 'RRRRRRRR', '..TTTT..', '..KTTK..', '..TTTT..'],
    ['........', '..RRRR..', '.RWRRWR.', 'RRRRRRRR', '..KTTK..', '.TTTTTT.'],
  ],
}

const WHELP: Species = {
  name: 'Jade Whelp',
  color: 'cyan',
  palette: { D: 0x3cb48c, d: 0x1e785a, K: 0x191e23 },
  frames: [
    ['.....DDD', '.d..DDKD', 'dd.DDDD.', '.DDDDDD.', '.DDDDD..', '.D...D..'],
    ['.....DDD', '....DDKD', '.d.DDDD.', 'dDDDDDD.', '.DDDDD..', '..D.D...'],
  ],
}

// Every creature a summon can bring; a pet's seed picks one, so the party is a mix.
const ROSTER: readonly Species[] = [SLIME, HAWK, OWL, WISP, FOX, BAT, FROG, CAT, TURTLE, SHROOM, WHELP]

// What picks a pet's creature: the agent, which a pet met by its tool calls and then by its spawn shares.
export const petSeed = (pet: { id: string; agentId?: string }): string => pet.agentId ?? pet.id

// FNV-1a: the same seed always lands on the same creature.
const hash = (text: string): number => {
  let value = 0x811c9dc5
  for (let at = 0; at < text.length; at += 1) value = Math.imul(value ^ text.charCodeAt(at), 0x01000193)
  return value >>> 0
}

export const speciesFor = (seed: string): Species => ROSTER[hash(seed) % ROSTER.length] ?? SLIME

const FAINTED: Record<string, number> = { _: 0x6e6e78 }

// Every coloured pixel grey: a pet that failed.
const faint = (species: Species): Record<string, number> =>
  Object.fromEntries(Object.keys(species.palette).map(key => [key, FAINTED._ ?? 0]))

const cache = new Map<string, string>()

// The pet's cells: running pets alternate frames, finished ones rest on the first, fainted ones go grey.
export const petCells = (seed: string, status: ToolCallStatus, frame: number): string => {
  const species = speciesFor(seed)
  const key = `${species.name}:${status}:${frame % 2}`
  const hit = cache.get(key)
  if (hit !== undefined) return hit
  const pixels = status === 'run' && frame % 2 === 1 ? species.frames[1] : species.frames[0]
  const cells = composeSprite(pixels, status === 'err' ? faint(species) : species.palette)
  cache.set(key, cells)
  return cells
}
