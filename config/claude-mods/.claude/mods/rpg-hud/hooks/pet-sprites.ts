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

// Agent type to the creature it summons; types not listed are wisps.
const BY_KIND: Record<string, Species> = {
  Explore: HAWK,
  Plan: OWL,
  'general-purpose': SLIME,
  claude: SLIME,
  fork: WISP,
}

export const speciesFor = (kind: string): Species => {
  if (BY_KIND[kind] !== undefined) return BY_KIND[kind]
  return /review|code|feature/i.test(kind) ? FOX : WISP
}

const FAINTED: Record<string, number> = { _: 0x6e6e78 }

// Every coloured pixel grey: a pet that failed.
const faint = (species: Species): Record<string, number> =>
  Object.fromEntries(Object.keys(species.palette).map(key => [key, FAINTED._ ?? 0]))

const cache = new Map<string, string>()

// The pet's cells: running pets alternate frames, finished ones rest on the first, fainted ones go grey.
export const petCells = (kind: string, status: ToolCallStatus, frame: number): string => {
  const key = `${kind}:${status}:${frame % 2}`
  const hit = cache.get(key)
  if (hit !== undefined) return hit
  const species = speciesFor(kind)
  const pixels = status === 'run' && frame % 2 === 1 ? species.frames[1] : species.frames[0]
  const cells = composeSprite(pixels, status === 'err' ? faint(species) : species.palette)
  cache.set(key, cells)
  return cells
}
