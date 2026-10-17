import { GRAPH_LIMIT } from './git'
import type { GraphRow } from './git'
import type { Pixels } from './svg'

// The overworld: the history as a road winding left to right across land grown from the repository's seed.
// The oldest step shown sits at the left (or fades into fog when the road goes on), you stand at HEAD, the
// remote's castle marks what is delivered, and a tent beyond you holds the unsaved work.

// Six terminal rows of half blocks: twelve pixels tall.
export const OVERWORLD_ROWS = 6
const HEIGHT = OVERWORLD_ROWS * 2
// The narrowest window that gets a map; below it the road list alone tells the story.
export const OVERWORLD_MIN_COLUMNS = 32
// Pixels between two steps on the road.
const SPACING = 4
// The band of fog at the left edge when the road goes on beyond it.
const FOG_COLUMNS = 10
// The tent and its fire past the hero.
const CAMP_COLUMNS = 7
// Frames of the land's idle animation (water glints, the flag, the fire, the hero's step).
export const OVERWORLD_FRAMES = 2

const PALETTE = {
  grass: 0x4f9a3c,
  grassDark: 0x3f8231,
  grassLight: 0x7cc456,
  forest: 0x2d6e2b,
  forestDark: 0x1f5021,
  canopy: 0x3f8f36,
  trunk: 0x5a3a22,
  water: 0x2f6fc4,
  waterDeep: 0x24569e,
  shallow: 0x5b98dc,
  glint: 0xd8f0ff,
  mountain: 0x9a96a6,
  mountainDark: 0x67637a,
  snow: 0xf4f4fa,
  road: 0xd2b07a,
  roadDark: 0xa98a58,
  bridge: 0x8b5a2b,
  gold: 0xffd23c,
  stone: 0xe6e6e6,
  // The castle.
  wall: 0xb4b2be,
  wallDark: 0x77748a,
  gate: 0x3a2a1e,
  flag: 0xff4a4a,
  pole: 0x5a4a3a,
  // The tent and its fire.
  canvas: 0xe0553c,
  canvasDark: 0xa3382a,
  doorway: 0x3a1e18,
  fire: 0xffb02e,
  ember: 0xff5a1e,
  // The hero.
  skin: 0xf4c8a0,
  tunic: 0x5aa9ff,
  boots: 0x4a3426,
  // A branch's signpost flag.
  branch: 0xc88cff,
} as const

// The hero's hat in the class's colour, as the terminal names it.
const HAT: Readonly<Record<string, number>> = {
  magenta: 0xb466ff,
  red: 0xff4a4a,
  green: 0x5ad27a,
  yellow: 0xffd23c,
  blue: 0x5aa9ff,
  cyan: 0x56c8dc,
}

// FNV-1a: the same repository grows the same land every time.
export const seedOf = (text: string): number => {
  let hash = 0x811c9dc5
  for (let at = 0; at < text.length; at += 1) hash = Math.imul(hash ^ text.charCodeAt(at), 0x01000193)
  return hash >>> 0
}

// A number in [0, 1) for one point of one seed.
const noise = (seed: number, x: number, y: number): number => {
  let hash = seed ^ Math.imul(x, 374761393) ^ Math.imul(y, 668265263)
  hash = Math.imul(hash ^ (hash >>> 13), 1274126177)
  return ((hash ^ (hash >>> 16)) >>> 0) / 4294967296
}

// Value noise over a grid `cell` pixels wide: smooth blobs of lake, wood and hill.
const smooth = (seed: number, x: number, y: number, cell: number): number => {
  const gx = Math.floor(x / cell)
  const gy = Math.floor(y / cell)
  const ease = (t: number) => t * t * (3 - 2 * t)
  const tx = ease(x / cell - gx)
  const ty = ease(y / cell - gy)
  const top = noise(seed, gx, gy) * (1 - tx) + noise(seed, gx + 1, gy) * tx
  const bottom = noise(seed, gx, gy + 1) * (1 - tx) + noise(seed, gx + 1, gy + 1) * tx
  return top * (1 - ty) + bottom * ty
}

// The road's row at each column: a gentle wander through the lower half, leaving the top for the sprites.
export const roadRows = (seed: number, width: number): number[] => {
  const phase = noise(seed, 7, 7) * Math.PI * 2
  const ripple = noise(seed, 9, 9) * Math.PI * 2
  return Array.from({ length: width }, (_, x) =>
    Math.max(6, Math.min(HEIGHT - 3, Math.round(8 + 1.8 * Math.sin(x / 6 + phase) + 0.9 * Math.sin(x / 2.6 + ripple)))),
  )
}

export type Terrain = 'plains' | 'lake' | 'wood' | 'peak'

// The first-parent road from HEAD back, as far as the log reaches: what the overworld walks.
export const mainRoad = (rows: readonly GraphRow[]): GraphRow[] => {
  const byHash = new Map(rows.map(row => [row.hash, row]))
  const road: GraphRow[] = []
  let step = rows.find(row => row.isHead) ?? rows[0]
  while (step !== undefined && !road.includes(step)) {
    road.push(step)
    step = step.parents[0] === undefined ? undefined : byHash.get(step.parents[0])
  }
  return road
}

// Each other branch tip and the step of the main road it forks from, as far as the log shows.
const sideRoads = (rows: readonly GraphRow[], road: readonly GraphRow[]): number[] => {
  const byHash = new Map(rows.map(row => [row.hash, row]))
  const onRoad = new Map(road.map((row, index) => [row.hash, index]))
  const forks: number[] = []
  // A local branch's name among the refs: not HEAD, a tag or a remote-tracking ref.
  const isBranch = (tip: GraphRow) =>
    tip.refs
      .split(',')
      .map(ref => ref.trim())
      .some(ref => ref !== '' && ref !== 'HEAD' && !ref.startsWith('tag: ') && !ref.endsWith('/HEAD') && !tip.remotes.includes(ref))
  for (const tip of rows) {
    if (onRoad.has(tip.hash) || !isBranch(tip)) continue
    let step: GraphRow | undefined = tip
    const seen = new Set<string>()
    while (step !== undefined && !onRoad.has(step.hash) && !seen.has(step.hash)) {
      seen.add(step.hash)
      step = step.parents[0] === undefined ? undefined : byHash.get(step.parents[0])
    }
    const at = step === undefined ? undefined : onRoad.get(step.hash)
    if (at !== undefined && !forks.includes(at)) forks.push(at)
  }
  return forks
}

// Sprites as one character per pixel, '.' see-through, bottom row standing on the anchor.
type Sprite = { art: readonly string[]; colors: Readonly<Record<string, number>> }

const castle = (frame: number): Sprite => ({
  art: [frame === 0 ? '..PFF..' : '..P.FF.', '..P....', 'W.W.W.W', 'WWWWWWW', 'WWdGdWW', 'WWdGdWW'],
  colors: { P: PALETTE.pole, F: PALETTE.flag, W: PALETTE.wall, d: PALETTE.wallDark, G: PALETTE.gate },
})

const tent = (frame: number): Sprite => ({
  art: ['..T....', '.TTt...', frame === 0 ? 'TTDTt.F' : 'TTDTt.E', 'TTDTt.e'],
  colors: { T: PALETTE.canvas, t: PALETTE.canvasDark, D: PALETTE.doorway, F: PALETTE.fire, E: PALETTE.ember, e: PALETTE.ember },
})

const hero = (frame: number, hat: number): Sprite => ({
  art: ['..H..', '.HHH.', '.SSS.', 'SBBBS', '.BBB.', frame === 0 ? '.L.L.' : 'L...L'],
  colors: { H: hat, S: PALETTE.skin, B: PALETTE.tunic, L: PALETTE.boots },
})

const startFlag: Sprite = { art: ['PS', 'PS', 'P.'], colors: { P: PALETTE.pole, S: PALETTE.stone } }

const branchFlag: Sprite = { art: ['PB', 'PB', 'P.'], colors: { P: PALETTE.pole, B: PALETTE.branch } }

// The time of day by the local hour: the land's light, and what glows in the dark.
export type Phase = 'dawn' | 'day' | 'dusk' | 'night'

export const phaseOf = (hour: number): Phase => {
  if (hour >= 5 && hour < 7) return 'dawn'
  if (hour >= 7 && hour < 17) return 'day'
  if (hour >= 17 && hour < 19) return 'dusk'
  return 'night'
}

// Each channel's share of its daylight value; daylight leaves the land as drawn.
const TINTS: Record<Phase, readonly [number, number, number]> = {
  dawn: [1, 0.84, 0.86],
  day: [1, 1, 1],
  dusk: [1, 0.72, 0.55],
  night: [0.36, 0.44, 0.78],
}

const tint = (color: number, [r, g, b]: readonly [number, number, number]): number => {
  const channel = (shift: number, k: number) => Math.min(255, Math.round(((color >> shift) & 0xff) * k)) << shift
  return channel(16, r) | channel(8, g) | channel(0, b)
}

// Lights keep their colour whatever the hour: fire, a lit gate, fireflies, a spell's spark, rain.
const LIGHT = { gate: 0xffc864, firefly: 0xe8ff7a, spark: 0xfff07a, sparkCool: 0x9ae6ff, rain: 0x9cc4f0 }

// The sky follows the boss fight: a storm while one stands, a rainbow once it falls.
export type Weather = 'clear' | 'storm' | 'rainbow'

// How long the rainbow stays once the boss falls.
export const RAINBOW_MS = 60_000

export const weatherOf = (boss: object | null, fx: { event: string; at: number } | null, now: number): Weather =>
  boss !== null ? 'storm' : fx?.event === 'defeat' && now - fx.at < RAINBOW_MS ? 'rainbow' : 'clear'

// Under a storm the land darkens further, whatever the hour.
const STORM_TINT: readonly [number, number, number] = [0.55, 0.58, 0.7]
const CLOUD = { light: 0x9a9eb2, dark: 0x6c7084 }
const cloud: readonly string[] = ['.cCCc..', 'cCCCCCc', 'CCCCCCC']
// Outermost band first, each mixed over the land so it shows through.
const RAINBOW = [0xff4a4a, 0xffb02e, 0xffe14a, 0x5ad27a, 0x5aa9ff, 0xb466ff]
const RAINBOW_SHARE = 0.6

export type OverworldInput = {
  rows: readonly GraphRow[]
  dirty: number
  width: number
  // What the land grows from: the repository's first commit, so every branch walks the same world.
  seed: string
  // The class's colour name, for the hero's hat.
  heroColor?: string
  // Daylight when absent.
  phase?: Phase
  // A spell's spark above the hero while a call runs.
  isCasting?: boolean
  // Clear when absent.
  weather?: Weather
}

export type Overworld = {
  // One colour matrix per frame, `HEIGHT` rows of `width`; undefined never occurs on land.
  frames: number[][][]
  terrain: Terrain
  // Whether the road goes on past the left edge, into fog.
  isCut: boolean
  // How many steps of the road the map shows.
  steps: number
}

const scale = (color: number, k: number): number => {
  const channel = (shift: number) => Math.round(((color >> shift) & 0xff) * k) << shift
  return channel(16) | channel(8) | channel(0)
}

const mix = (a: number, b: number, share: number): number => {
  const channel = (shift: number) => Math.round(((a >> shift) & 0xff) * (1 - share) + ((b >> shift) & 0xff) * share) << shift
  return channel(16) | channel(8) | channel(0)
}

export function drawOverworld(input: OverworldInput): Overworld {
  const { rows, dirty, width } = input
  const seed = seedOf(input.seed)
  const road = roadRows(seed, width)
  const main = mainRoad(rows)
  const heroX = width - 3 - (dirty > 0 ? CAMP_COLUMNS : 0)
  const fits = Math.max(1, Math.floor((heroX - 2) / SPACING) + 1)
  const isCut = main.length > fits || (main.length >= rows.length && rows.length >= GRAPH_LIMIT)
  // A road that goes on leaves the fog its band.
  const steps = Math.min(main.length, isCut ? Math.max(1, Math.floor((heroX - FOG_COLUMNS / 2) / SPACING) + 1) : fits)
  const stepX = (index: number) => heroX - index * SPACING
  const oldestX = stepX(steps - 1)
  const roadFrom = isCut ? 0 : oldestX
  const townAt = main.findIndex(row => row.remotes.length > 0)
  const forks = sideRoads(rows, main).filter(at => at < steps).slice(0, 3)

  // The land, then the road over it, then the sprites over both.
  const counts: Record<Terrain, number> = { plains: 0, lake: 0, wood: 0, peak: 0 }
  // Each world leans its own way: some wet, some wooded.
  const lakeLevel = 0.22 + noise(seed, 1, 1) * 0.16
  const woodLevel = 0.72 - noise(seed, 2, 2) * 0.16
  const kinds: (keyof typeof PALETTE)[][] = Array.from({ length: HEIGHT }, (_, y) =>
    Array.from({ length: width }, (_, x) => {
      const near = Math.abs(y - (road[x] ?? 0)) <= 1
      const n = smooth(seed, x, y * 1.4, 7) * 0.85 + smooth(seed + 1, x, y, 3) * 0.15
      const grain = noise(seed + 2, x, y)
      if (!near && n < lakeLevel) {
        counts.lake += 1
        return n < lakeLevel - 0.06 ? 'waterDeep' : n < lakeLevel - 0.02 ? 'water' : 'shallow'
      }
      if (!near && n > woodLevel) {
        counts.wood += 1
        // The forest floor; the trees are stamped over it below.
        return 'forestDark'
      }
      counts.plains += 1
      return grain < 0.07 ? 'grassLight' : grain < 0.2 ? 'grassDark' : 'grass'
    }),
  )

  // Trees in staggered rows over the forest floor, each a lit crown on a trunk.
  for (let y = 0; y < HEIGHT; y += 3) {
    for (let x = (y / 3) % 2 === 0 ? 0 : 1; x < width; x += 3) {
      if (kinds[y + 1]?.[x + 1] !== 'forestDark') continue
      const tree = ['.c.', 'FFF', '.t.']
      tree.forEach((line, dy) =>
        [...line].forEach((ch, dx) => {
          const row = kinds[y + dy]
          if (row === undefined || ch === '.' || row[x + dx] !== 'forestDark') return
          row[x + dx] = ch === 'c' ? 'canopy' : ch === 'F' ? 'forest' : 'trunk'
        }),
      )
    }
  }

  // Peaks along the top where the road keeps low.
  for (let x = 0; x < width - 7; x += 1) {
    const lift = smooth(seed + 3, x, 0, 9)
    if (lift < 0.6 || (road[x + 3] ?? 0) < 8 || noise(seed + 4, x, 0) < 0.55) continue
    const art = ['...s...', '..sMm..', '.MMMmm.', 'MMMMMmm']
    art.forEach((line, y) =>
      [...line].forEach((ch, dx) => {
        const row = kinds[y]
        if (row === undefined || ch === '.') return
        row[x + dx] = ch === 's' ? 'snow' : ch === 'M' ? 'mountain' : 'mountainDark'
        counts.peak += 1
      }),
    )
    x += 6
  }

  const roadAt = (x: number, y: number, kind: keyof typeof PALETTE) => {
    const row = kinds[y]
    if (row === undefined || x < 0 || x >= width) return
    const under = row[x] ?? 'grass'
    row[x] = kind === 'road' && (under === 'water' || under === 'waterDeep' || under === 'shallow') ? 'bridge' : kind
  }
  for (let x = roadFrom; x < width; x += 1) {
    const y = road[x] ?? 0
    const before = road[x - 1] ?? y
    // The road ahead of you is not yet built: a dotted trail.
    const ahead = x > heroX
    if (ahead && x % 2 === 1) continue
    for (let fill = Math.min(y, before); fill <= Math.max(y, before); fill += 1) roadAt(x, fill, ahead ? 'roadDark' : 'road')
  }
  // Side roads: a short spur off the fork, up or down, to a flag.
  for (const at of forks) {
    const x = stepX(at)
    const y = road[x] ?? 0
    const down = y + 4 < HEIGHT
    for (let d = 1; d <= 2; d += 1) roadAt(x + d, down ? y + d : y - d, 'roadDark')
  }
  // Each step a milestone beside the road; the steps you carry, not yet delivered, gold.
  for (let index = 1; index < steps; index += 1) {
    const x = stepX(index)
    const y = road[x] ?? 0
    const carried = townAt === -1 || index < townAt
    roadAt(x, y, 'roadDark')
    const post = kinds[y - 1]
    if (post !== undefined) post[x] = carried ? 'gold' : 'stone'
  }

  const hat = HAT[input.heroColor ?? 'magenta'] ?? HAT.magenta!
  const phase = input.phase ?? 'day'
  const isNight = phase === 'night'
  const weather = input.weather ?? 'clear'
  // The castle where the boss's storm gathers and its rainbow ends, when the map shows it.
  const townX = townAt !== -1 && townAt < steps ? stepX(townAt) - (townAt === 0 ? 4 : 0) : undefined
  const frames = Array.from({ length: OVERWORLD_FRAMES }, (_, frame) => {
    const colors: number[][] = kinds.map(row => row.map((kind): number => PALETTE[kind]))
    // Pixels that shine on their own, untouched by the hour's light.
    const lights = new Set<number>()
    const light = (x: number, y: number, color: number) => {
      const row = colors[y]
      if (row === undefined || x < 0 || x >= width) return
      row[x] = color
      lights.add(y * width + x)
    }
    // Water glints shift between frames.
    kinds.forEach((row, y) =>
      row.forEach((kind, x) => {
        if ((kind === 'water' || kind === 'waterDeep') && noise(seed + 5 + frame, x, y) < 0.07) colors[y]![x] = PALETTE.glint
      }),
    )
    // The rainbow arcs over the land from the castle (the middle without one), behind every sprite.
    if (weather === 'rainbow') {
      const centerX = townX ?? Math.floor(width / 2)
      const centerY = HEIGHT - 2
      const reachX = Math.max(8, Math.min(24, Math.floor(width / 2) - 2))
      colors.forEach((row, y) => {
        if (y > centerY - 4) return
        for (let x = 0; x < width; x += 1) {
          const d = Math.hypot((x - centerX) / reachX, (y - centerY) / centerY)
          const band = Math.floor((1 - d) * centerY)
          const color = RAINBOW[band]
          if (color !== undefined) row[x] = mix(row[x] ?? 0, color, RAINBOW_SHARE)
        }
      })
    }
    // `glows` names the sprite's characters that shine: its fire, a gate lit at night.
    const stamp = (sprite: Sprite, centerX: number, bottomY: number, glows = '') => {
      const left = centerX - Math.floor((sprite.art[0]?.length ?? 0) / 2)
      const top = bottomY - sprite.art.length + 1
      sprite.art.forEach((line, dy) =>
        [...line].forEach((ch, dx) => {
          const color = sprite.colors[ch]
          const row = colors[top + dy]
          const x = left + dx
          if (color === undefined || row === undefined || x < 0 || x >= width) return
          if (glows.includes(ch)) light(x, top + dy, color)
          else row[x] = color
        }),
      )
    }
    // Fireflies over the grass at night, a few, blinking between frames.
    if (isNight) {
      kinds.forEach((row, y) =>
        row.forEach((kind, x) => {
          if (kind.startsWith('grass') && noise(seed + 11 + frame, x, y) < 0.018) light(x, y, LIGHT.firefly)
        }),
      )
    }
    for (const at of forks) {
      const x = stepX(at) + 3
      const y = road[stepX(at)] ?? 0
      stamp(branchFlag, x + 1, y + 4 < HEIGHT ? y + 3 : y - 2)
    }
    if (!isCut) stamp(startFlag, oldestX, (road[oldestX] ?? 0) - 1)
    if (townX !== undefined) {
      // Synced, you stand at the gate: the castle steps back a little to make room.
      const x = townX
      const keep = castle(frame)
      // At night the gate is lit from within.
      stamp(isNight ? { ...keep, colors: { ...keep.colors, G: LIGHT.gate } } : keep, x, (road[x] ?? 0) - 1, isNight ? 'G' : '')
    }
    if (dirty > 0) {
      const x = width - 4
      stamp(tent(frame), x, (road[x] ?? 0) - 1, 'FEe')
    }
    const heroY = road[heroX] ?? 0
    stamp(hero(frame, hat), heroX, heroY)
    // Casting, a spark dances over the hat: up and right, then up and left.
    if (input.isCasting === true) {
      light(heroX + (frame === 0 ? 2 : -2), heroY - 6, frame === 0 ? LIGHT.spark : LIGHT.sparkCool)
      light(heroX + (frame === 0 ? 1 : -1), heroY - 7 + frame, LIGHT.spark)
    }
    if (weather === 'storm') {
      // Clouds drift along the top, one always over the castle; rain falls a step down and left each frame.
      const at = new Set<number>([...(townX === undefined ? [] : [townX]), ...Array.from({ length: Math.ceil(width / 16) }, (_, k) => k * 16 + Math.floor(noise(seed + 20, k, 0) * 8))])
      for (const x of at) {
        const left = x - 3 + frame
        cloud.forEach((line, y) =>
          [...line].forEach((ch, dx) => {
            // Clouds stand out of the storm's gloom, dimmed by the hour alone.
            if (ch !== '.') light(left + dx, y, tint(ch === 'c' ? CLOUD.light : CLOUD.dark, TINTS[phase]))
          }),
        )
      }
      // Each drop a two-pixel streak slanting down to the left.
      for (let y = 3; y < HEIGHT - 1; y += 1) {
        for (let x = 1; x < width; x += 1) {
          if (noise(seed + 21, x + y + frame, y - frame * 2) >= 0.035) continue
          light(x, y, LIGHT.rain)
          light(x - 1, y + 1, LIGHT.rain)
        }
      }
    }
    if (phase !== 'day' || weather === 'storm') {
      const day = TINTS[phase]
      const k: [number, number, number] = weather === 'storm' ? [day[0] * STORM_TINT[0], day[1] * STORM_TINT[1], day[2] * STORM_TINT[2]] : [...day]
      colors.forEach((row, y) => {
        for (let x = 0; x < width; x += 1) if (!lights.has(y * width + x)) row[x] = tint(row[x] ?? 0, k)
      })
    }
    // Fog where the road goes on past the edge: darker the further back.
    if (isCut) {
      const reach = Math.max(FOG_COLUMNS, oldestX)
      colors.forEach(row => {
        for (let x = 0; x < Math.min(width, reach); x += 1) row[x] = scale(row[x] ?? 0, 0.3 + 0.7 * (x / reach) ** 1.5)
      })
    }
    return colors
  })

  const terrain = (Object.entries(counts) as [Terrain, number][])
    .filter(([kind]) => kind !== 'plains')
    .map(([kind, count]): [Terrain, number] => [kind, count / (width * HEIGHT) / (kind === 'peak' ? 0.4 : 1)])
    .sort((a, b) => b[1] - a[1])[0]
  return {
    frames,
    terrain: terrain !== undefined && terrain[1] > 0.12 ? terrain[0] : 'plains',
    isCut,
    steps,
  }
}

const TERRAIN_NAMES: Record<Terrain, readonly string[]> = {
  plains: ['Plains', 'Meadows', 'Fields', 'Greenlands'],
  lake: ['Lakes', 'Marshes', 'Waterlands', 'Fens'],
  wood: ['Woods', 'Forest', 'Thicket', 'Wildwood'],
  peak: ['Highlands', 'Peaks', 'Crags', 'Uplands'],
}
const EPITHETS = ['Whispering', 'Golden', 'Misty', 'Ancient', 'Silent', 'Sunlit', 'Hollow', 'Starfall']

// The region's name for the banner under the map: `Misty Woods of main`.
export const regionName = (seed: string, terrain: Terrain, branch: string): string => {
  const hash = seedOf(seed)
  const names = TERRAIN_NAMES[terrain]
  return `${EPITHETS[hash % EPITHETS.length]} ${names[(hash >>> 8) % names.length]} of ${branch || 'nowhere'}`
}

const hex = (rgb: number): string => `#${(rgb & 0xffffff).toString(16).padStart(6, '0')}`

export const colorsToPixels = (colors: readonly (readonly number[])[]): Pixels => colors.map(row => row.map(hex))
