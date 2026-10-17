import type { ElementTable, RenderChildren } from 'claude-code'

import type { Boss, BossFx } from '../types'
import { FRAME_MS } from './anim'
import { barSvg, BAR_HEIGHT, COLUMN_PX, gridToPixels, spriteSvg } from './svg'
import { isEnraged } from './boss'
import { barParts, composeSprite } from './util'

// The encounter: while a boss stands, the status panel turns to a duel. The stats step aside, the hero on the left
// faces the monster on the right, twice its size where it fits, its HP between them. It walks in out of the dark,
// each passing run slashes it and pops the damage off it, and a slain boss bursts apart.

// The monster's art, in pixels: twelve across and nine down.
const BOSS_ART_COLUMNS = 12
const ART_ROWS = 9
// Its terminal cells at its own size, the art and a row to bob in: five rows of half blocks.
export const BOSS_COLUMNS = BOSS_ART_COLUMNS
export const BOSS_ROWS = 5
// How long each moment of the fight stays on the panel.
export const FX_MS: Record<BossFx['event'], number> = { appear: 2400, hit: 1600, defeat: 1800, enrage: 1600 }

type Monster = { art: readonly string[]; palette: Readonly<Record<string, number>> }

// One per kind of check; '.' see-through, nine rows each.
const MONSTERS: Record<string, Monster> = {
  // Three heads on one body: every fix grows another.
  test: {
    art: [
      'GG...GG...GG',
      'KG...KG...GK',
      '.G...G....G.',
      '.gG..G...Gg.',
      '..gGGGGGGg..',
      '..GGGgGGGG..',
      '.GGgGGGgGGG.',
      '.GGGGGGGGGG.',
      '..Y.Y..Y.Y..',
    ],
    palette: { G: 0x5ad27a, g: 0x2f8f4a, K: 0x191e23, Y: 0xf0c040 },
  },
  // Big ears, a mean grin and a club.
  lint: {
    art: [
      '.E..GGGG..E.',
      '.EEGGGGGGEE.',
      '...GRGGRG...',
      '...GGGGGG..W',
      '....GmmG...W',
      '...BBBBBB.W.',
      '..GBBBBBBGW.',
      '...BB..BB...',
      '...KK..KK...',
    ],
    palette: { E: 0x9ac850, G: 0xb4dc64, R: 0xff3b3b, m: 0x3a2a1e, B: 0x8b5a2b, W: 0xa98a58, K: 0x3a2a1e },
  },
  // A ghost of mismatched types, frayed at the hem.
  types: {
    art: [
      '....PPPP....',
      '...PPPPPP...',
      '..PPWPPWPP..',
      '..PPKPPKPP..',
      '..PPPPPPPP..',
      '.PPPPOOPPPP.',
      '.PPPPPPPPPP.',
      'PPpPPPPPPpPP',
      'P..PpP.pP..P',
    ],
    palette: { P: 0xb48cff, p: 0x7a52c8, W: 0xffffff, K: 0x191e23, O: 0x3a1e5a },
  },
  // A browser window come alive, glaring.
  e2e: {
    art: [
      'CCCCCCCCCCCC',
      'CrCyCgCCCCCC',
      'CWWWWWWWWWWC',
      'CWKKWWWWKKWC',
      'CWKRWWWWRKWC',
      'CWWWWWWWWWWC',
      'CWWRRRRRRWWC',
      'CWWWWWWWWWWC',
      'CCCCCCCCCCCC',
    ],
    palette: { C: 0x56c8dc, r: 0xff5f5f, y: 0xffd23c, g: 0x5ad27a, W: 0xe8eef2, K: 0x191e23, R: 0xff3b3b },
  },
}

const monsterOf = (kind: string): Monster => MONSTERS[kind] ?? MONSTERS.test!

const WHITE = 0xffffff
const EMBER = 0xff7a1a
const SHADOW = 0x2a1e3a
// The effects' own pixels, keyed by characters no monster uses.
const FX_PALETTE: Readonly<Record<string, number>> = {
  '#': WHITE,
  '*': 0xffe14a,
  '+': EMBER,
  '%': 0xff3b3b,
  // The arena: its floor, the monster's shadow, the torches' posts.
  '=': 0x564a78,
  '~': 0x3d3456,
  '_': 0x15121e,
  '|': 0x6a4a2e,
}

// A frame as one character per pixel, '.' see-through, in a canvas `scale` times the art's size and one art
// row taller, so the idle frames bob.
type Canvas = string[][]

const blankCanvas = (scale: number, columns: number): Canvas =>
  Array.from({ length: (ART_ROWS + 1) * scale }, () => Array.from({ length: columns }, () => '.'))

// The arena the monster stands in, `columns` wide with the monster from `left`: a stone floor along the bottom,
// its shadow under it, and a torch at either side where the monster (or allies, on the left) leave room, the
// flames flickering with `frame`.
const arena = (scale: number, columns: number, frame: number, left: number, hasAllies: boolean): Canvas => {
  const canvas = blankCanvas(scale, columns)
  const height = canvas.length
  const art = BOSS_ART_COLUMNS * scale
  for (let x = 0; x < columns; x += 1) {
    plot(canvas, x, height - 1, x >= left + scale && x < left + art - scale ? '_' : x % 3 === 0 ? '~' : '=')
  }
  const torches = [...(hasAllies || left < 5 ? [] : [2]), ...(columns - (left + art) < 5 ? [] : [columns - 3])]
  for (const x of torches) {
    for (let y = height - 2; y >= height - 1 - 3 * scale; y -= 1) plot(canvas, x, y, '|')
    // A bowl on the post, the flame leaning one way then the other.
    const top = height - 2 - 3 * scale
    const lean = frame % 2 === 0 ? -1 : 1
    for (const dx of [-1, 0, 1]) plot(canvas, x + dx, top, '|')
    for (const dx of [-1, 0, 1]) plot(canvas, x + dx, top - 1, dx === 0 ? '*' : '+')
    plot(canvas, x, top - 2, '*')
    plot(canvas, x + lean, top - 2, '+')
    plot(canvas, x + lean, top - 3, '*')
    if (frame % 3 === 0) plot(canvas, x - lean, top - 4, '+')
  }
  return canvas
}

// The art drawn into `canvas` `scale` times over, shifted by `dx`, `dy` pixels; `as` paints every lit pixel one
// character (a silhouette).
const stampArt = (canvas: Canvas, art: readonly string[], scale: number, dx: number, dy: number, as?: string) => {
  art.forEach((line, y) =>
    [...line].forEach((ch, x) => {
      if (ch === '.') return
      for (let sy = 0; sy < scale; sy += 1) {
        for (let sx = 0; sx < scale; sx += 1) {
          const row = canvas[y * scale + sy + dy]
          const at = x * scale + sx + dx
          if (row !== undefined && at >= 0 && at < row.length) row[at] = as ?? ch
        }
      }
    }),
  )
}

const plot = (canvas: Canvas, x: number, y: number, ch: string) => {
  const row = canvas[Math.round(y)]
  const at = Math.round(x)
  if (row !== undefined && at >= 0 && at < row.length) row[at] = ch
}

// A 3×5 pixel font for the damage that pops off the monster.
const DIGITS: Readonly<Record<string, readonly string[]>> = {
  '-': ['...', '...', '###', '...', '...'],
  '0': ['###', '#.#', '#.#', '#.#', '###'],
  '1': ['.#.', '##.', '.#.', '.#.', '###'],
  '2': ['###', '..#', '###', '#..', '###'],
  '3': ['###', '..#', '###', '..#', '###'],
  '4': ['#.#', '#.#', '###', '..#', '..#'],
  '5': ['###', '#..', '###', '..#', '###'],
  '6': ['###', '#..', '###', '#.#', '###'],
  '7': ['###', '..#', '..#', '..#', '..#'],
  '8': ['###', '#.#', '###', '#.#', '###'],
  '9': ['###', '#.#', '###', '..#', '###'],
}

// `text` in the pixel font, centred on `cx` with its top at `top`, outlined in red so it reads over the monster.
const stampText = (canvas: Canvas, text: string, cx: number, top: number, ch: string) => {
  const width = text.length * 4 - 1
  const left = Math.round(cx - width / 2)
  ;[...text].forEach((letter, at) =>
    (DIGITS[letter] ?? []).forEach((line, y) =>
      [...line].forEach((pixel, x) => {
        if (pixel !== '#') return
        for (const [ox, oy] of [[-1, 0], [1, 0], [0, -1], [0, 1]] as const) {
          const px = left + at * 4 + x + ox
          const py = top + y + oy
          if (canvas[py]?.[px] !== ch) plot(canvas, px, py, '%')
        }
        plot(canvas, left + at * 4 + x, top + y, ch)
      }),
    ),
  )
  // The outline went down under neighbouring strokes too: draw the strokes again over it.
  ;[...text].forEach((letter, at) =>
    (DIGITS[letter] ?? []).forEach((line, y) => [...line].forEach((pixel, x) => pixel === '#' && plot(canvas, left + at * 4 + x, top + y, ch))),
  )
}

// A stable [0, 1) per pixel: which pixels crumble first, where sparks fly.
const crumbleOrder = (x: number, y: number): number => {
  let hash = Math.imul(x + 1, 374761393) ^ Math.imul(y + 1, 668265263)
  hash = Math.imul(hash ^ (hash >>> 13), 1274126177)
  return ((hash ^ (hash >>> 16)) >>> 0) / 4294967296
}

// The art with `share` of its pixels gone.
const crumbledArt = (art: readonly string[], share: number): string[] =>
  art.map((line, y) => [...line].map((ch, x) => (ch === '.' || crumbleOrder(x, y) < share ? '.' : ch)).join(''))

export type BossGrid = { art: string[]; palette: Readonly<Record<string, number>> }

const gridOf = (canvas: Canvas, palette: Readonly<Record<string, number>>, fx: Readonly<Record<string, number>> = FX_PALETTE): BossGrid => ({
  art: canvas.map(row => row.join('')),
  palette: { ...palette, ...fx },
})

// Enraged, the torches burn red.
const RAGE_FX_PALETTE: Readonly<Record<string, number>> = { ...FX_PALETTE, '+': 0xd8201a, '*': 0xff5a2a }

// A colour on the rage's red ramp, as light as it was: dark red in the shadows to hot orange in the light.
const rageColor = (color: number): number => {
  const light = (((color >> 16) & 0xff) * 0.3 + ((color >> 8) & 0xff) * 0.59 + (color & 0xff) * 0.11) / 255
  return (Math.round(110 + 145 * light) << 16) | (Math.round(20 + 120 * light ** 2) << 8) | Math.round(20 + 30 * light)
}

// A companion fighting beside the hero: a pet's two frames and palette.
export type Ally = { frames: readonly [readonly string[], readonly string[]]; palette: Readonly<Record<string, number>> }
// The most allies the arena draws, and how long a returning one's shot takes to land.
export const MAX_ALLIES = 3
export const ASSIST_MS = 1600
const ALLY_COLUMNS = 8
const ALLY_GAP = 2

// The frames a moment of the fight shows, as pixel grids `scale` times the art, and how long each holds (in
// animation ticks). It walks in out of the dark, takes a slash and the damage pops off it, or bursts apart.
// The arena is `columns` pixels wide (the monster's own width when absent), the monster in its middle.
export const bossFrames = (
  kind: string,
  event: BossFx['event'] | undefined,
  scale = 1,
  damage = 0,
  columns = BOSS_ART_COLUMNS * scale,
  isEnraged = false,
  // Pets out in the background stand on the arena's left; `assist`, the one just back, throws a shot at the boss.
  party: { allies?: readonly Ally[]; assist?: number } = {},
): { grids: BossGrid[]; ticks: number; loop: boolean } => {
  const monster = monsterOf(kind)
  const { art } = monster
  // Enraged, it flushes red, its shading kept, and its torches with it.
  const palette = isEnraged ? Object.fromEntries(Object.entries(monster.palette).map(([ch, color]) => [ch, rageColor(color)])) : monster.palette
  const fxPalette = isEnraged ? RAGE_FX_PALETTE : FX_PALETTE
  const grid = (canvas: Canvas, colors: Readonly<Record<string, number>>) => gridOf(canvas, { ...colors, ...allyPalette }, fxPalette)
  const width = columns
  const height = (ART_ROWS + 1) * scale
  const span = BOSS_ART_COLUMNS * scale
  // The allies that fit left of the monster, which steps right to make room for them.
  const allies = (party.allies ?? []).slice(0, MAX_ALLIES).filter((_, at) => ALLY_GAP + (at + 1) * (ALLY_COLUMNS + ALLY_GAP) + span <= columns)
  const left = allies.length === 0 ? Math.floor((columns - span) / 2) : columns - span - Math.max(0, Math.min(2, columns - span - allies.length * (ALLY_COLUMNS + ALLY_GAP) - ALLY_GAP))
  const allyX = (at: number) => ALLY_GAP + at * (ALLY_COLUMNS + ALLY_GAP)
  // Each ally's characters, out of the monster's way: one block of code points apiece.
  const allyChars = allies.map((ally, at) => new Map(Object.keys(ally.palette).map((ch, k) => [ch, String.fromCharCode(0x100 + at * 32 + k)])))
  const allyPalette = Object.fromEntries(
    allies.flatMap((ally, at) => Object.entries(ally.palette).map(([ch, color]) => [allyChars[at]!.get(ch)!, color])),
  )
  // Each frame numbered as it is made, so the torches flicker and the allies hop through every moment.
  let made = 0
  const stage = () => {
    const frame = made++
    const canvas = arena(scale, columns, frame, left, allies.length > 0)
    allies.forEach((ally, at) => {
      const art = ally.frames[frame % 2]!
      const top = canvas.length - 1 - art.length
      art.forEach((line, y) =>
        [...line].forEach((ch, x) => {
          const mapped = allyChars[at]!.get(ch)
          if (mapped !== undefined) plot(canvas, allyX(at) + x, top + y, mapped)
        }),
      )
    })
    return canvas
  }
  const pose = (dx: number, dy: number, as?: string) => {
    const canvas = stage()
    stampArt(canvas, art, scale, left + dx, dy, as)
    return canvas
  }
  // Enraged, flames lick up off its top edge, flickering frame to frame.
  const burning = (canvas: Canvas, frame: number) => {
    if (!isEnraged) return canvas
    for (let x = 0; x < width; x += 1) {
      const top = canvas.findIndex(row => row[x] !== '.' && row[x] !== '=' && row[x] !== '~' && row[x] !== '_' && row[x] !== '|' && row[x] !== '+' && row[x] !== '*')
      if (top <= 0 || x < left || x >= left + BOSS_ART_COLUMNS * scale) continue
      const lick = crumbleOrder(x, frame) < 0.5 ? 1 : 2
      for (let up = 1; up <= lick; up += 1) plot(canvas, x, top - up, up === lick ? '*' : '+')
    }
    return canvas
  }
  const idle = [grid(burning(pose(0, 0), 0), palette), grid(burning(pose(0, scale), 1), palette)]

  if (event === 'enrage') {
    // It flashes red, shakes with fury, flashes white, and stands burning.
    const red = { X: 0xff2a1a }
    const shakes = [scale, -scale, scale, -scale].map(dx => grid(pose(dx, 0, 'X'), red))
    return { grids: [grid(pose(0, 0, 'X'), red), ...shakes, grid(pose(0, 0, 'X'), { X: WHITE }), ...idle, ...idle, ...idle], ticks: 1, loop: false }
  }

  if (event === 'appear') {
    // A shadow slides in from the right, flashes white, then flickers into the light.
    const slide = [1, 0.66, 0.33, 0].map(share => grid(pose(Math.round((width - left) * share), 0, 'X'), { X: SHADOW }))
    return {
      grids: [...slide, grid(pose(0, 0, 'X'), { X: WHITE }), idle[0]!, grid(pose(0, 0, 'X'), { X: SHADOW }), idle[0]!, grid(pose(0, 0, 'X'), { X: WHITE }), ...idle, ...idle],
      ticks: 1,
      loop: false,
    }
  }

  if (event === 'hit') {
    // A slash crosses it from the top right, it flashes and shakes red, and the damage rises off it.
    const slashed = (upTo: number, canvas: Canvas) => {
      for (let step = 0; step <= upTo; step += 1) {
        const x = left + span - 1 - step * (span / height)
        plot(canvas, x, step, '#')
        plot(canvas, x + 1, step, '*')
        plot(canvas, x - 1, step, '*')
      }
      return canvas
    }
    const red = Object.fromEntries(Object.keys(palette).map(ch => [ch, 0xff3b3b]))
    const cuts = [0.35, 0.7, 1].map(share => grid(slashed(Math.round((height - 1) * share), pose(0, 0)), palette))
    const shakes = [scale, -scale, scale, 0].map(dx => {
      const canvas = pose(dx, 0)
      return grid(canvas, dx === 0 ? palette : red)
    })
    const pops = [0, 1, 2, 3, 4, 5].map(rise => {
      const canvas = pose(0, rise % 2 === 0 ? 0 : scale)
      if (damage > 0) stampText(canvas, `-${damage}`, width / 2, Math.max(0, Math.round(height / 2) - 2 - rise * scale), rise < 4 ? '*' : '#')
      return grid(canvas, palette)
    })
    return { grids: [...cuts, grid(pose(0, 0, 'X'), { X: WHITE }), ...shakes, ...pops], ticks: 1, loop: false }
  }

  if (event === 'defeat') {
    // A white flash, an ember glow, then it bursts: the pixels fall away as sparks fly out from its middle.
    const cx = width / 2
    const cy = height / 2
    const burst = [0.15, 0.35, 0.55, 0.75, 0.9, 1].map((share, step) => {
      const canvas = stage()
      stampArt(canvas, crumbledArt(art, share), scale, left, 0)
      for (let k = 0; k < 18; k += 1) {
        const angle = crumbleOrder(k, 7) * Math.PI * 2
        const reach = (step + 1) * (Math.max(width, BOSS_ART_COLUMNS * scale * 1.5) / 14) * (0.6 + crumbleOrder(k, 9) * 0.6)
        plot(canvas, cx + Math.cos(angle) * reach, cy + Math.sin(angle) * reach * 0.6, step < 3 ? '*' : '+')
      }
      return grid(canvas, palette)
    })
    return {
      grids: [grid(pose(0, 0, 'X'), { X: WHITE }), grid(pose(0, 0, 'X'), { X: EMBER }), ...burst],
      ticks: 2,
      loop: false,
    }
  }
  if (party.assist !== undefined && allies[party.assist] !== undefined) {
    // The ally just back throws a star: it arcs over to the monster, which flashes as it lands.
    const fromX = allyX(party.assist) + ALLY_COLUMNS / 2
    const toX = left + span / 2
    const shots = [0, 1, 2, 3, 4, 5].map(step => {
      const canvas = burning(pose(0, 0), step)
      const t = step / 5
      const x = fromX + (toX - fromX) * t
      const y = height * 0.6 - Math.sin(t * Math.PI) * height * 0.45
      plot(canvas, x, y, '#')
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) plot(canvas, x + dx, y + dy, '*')
      return grid(canvas, palette)
    })
    return { grids: [...shots, grid(pose(0, 0, 'X'), { X: WHITE }), idle[0]!, grid(pose(0, 0, 'X'), { X: WHITE }), ...idle], ticks: 1, loop: false }
  }
  // Standing, it bobs in place.
  return { grids: idle, ticks: 5, loop: true }
}

export const bossCells = (
  kind: string,
  event: BossFx['event'] | undefined,
  scale = 1,
  damage = 0,
  columns?: number,
  isEnraged = false,
  party: { allies?: readonly Ally[]; assist?: number } = {},
): { frames: string[]; ticks: number; loop: boolean } => {
  const { grids, ticks, loop } = bossFrames(kind, event, scale, damage, columns, isEnraged, party)
  return { frames: grids.map(one => composeSprite(one.art, one.palette)), ticks, loop }
}

// The moment of the fight still on the card at `now`, if any.
export const liveFx = (fx: BossFx | null, now: number): BossFx | undefined =>
  fx !== null && now - fx.at < FX_MS[fx.event] ? fx : undefined

// The boss the card shows: the one standing, or the one just slain while it crumbles.
export const shownBoss = (boss: Boss | null, fx: BossFx | undefined): Boss | undefined =>
  boss ?? (fx?.event === 'defeat' ? fx.boss : undefined)

export type FoeSideProps = {
  boss: Boss
  fx?: BossFx
  // The terminal's Raster, which the animation blits; elsewhere the monster is a drawing.
  Raster?: ElementTable<'terminal'>['Raster']
  // The cells the Raster first draws, before the animation's next blit.
  cells?: string
  onFight?: () => void
  // Background pets fighting beside the hero, and the one just back with a shot.
  party?: { allies?: readonly Ally[]; assist?: number }
}

// The duel's middle column: the foe's name and HP over a big VS, the moment of the fight cried under it. It
// widens a little on a wide pane; the arena takes the rest.
export const DUEL_MID_COLUMNS = 10
const DUEL_MID_MAX_COLUMNS = 16
const DUEL_GAP = 1
const FIGHT_LABEL = '⚔ STRIKE'

// The big VS between the fighters, in pixels: six tall in four terminal rows of half blocks, a pixel spare above
// and below, so under the three rows of the foe's name and HP it sits in the panel's exact middle.
export const VS_COLUMNS = 10
export const VS_ROWS = 4
const VS_ART = [
  '..........',
  'V...V..SSS',
  'V...V.S...',
  'V...V..SS.',
  '.V.V.....S',
  '.V.V.....S',
  '..V...SSS.',
  '..........',
]
// Burning down from gold to red; all gold once the foe falls.
const VS_FLAME = [0, 0xffe14a, 0xffe14a, 0xff9a2e, 0xff9a2e, 0xff3b3b, 0xff3b3b]

export const vsGrid = (isDefeat: boolean): BossGrid => ({
  art: VS_ART.map((line, y) => line.replace(/[VS]/g, String(y))),
  palette: Object.fromEntries(VS_FLAME.map((color, y) => [String(y), isDefeat ? 0xffd23c : color])),
})

export type Duel = { hasPortrait: boolean; scale: number; midColumns: number; arenaColumns: number }

// How the panel's `inner` columns hold a duel: the hero's picture when it still fits, and the monster at twice
// its size when there is room, else at its own; scale 0 when even that does not fit. Columns to spare widen the
// middle column, then the arena.
export const duelLayout = (inner: number, hasPicture: boolean, pictureColumns: number): Duel => {
  const room = (withPicture: boolean) => inner - (withPicture ? pictureColumns + DUEL_GAP : 0) - DUEL_GAP
  const pick = (withPicture: boolean): Duel | undefined => {
    const free = room(withPicture)
    const scale = [2, 1].find(one => free >= DUEL_MID_COLUMNS + BOSS_COLUMNS * one)
    if (scale === undefined) return undefined
    const midColumns = Math.min(DUEL_MID_MAX_COLUMNS, free - BOSS_COLUMNS * scale)
    return { hasPortrait: withPicture, scale, midColumns, arenaColumns: free - midColumns }
  }
  return (hasPicture ? pick(true) : undefined) ?? pick(false) ?? { hasPortrait: false, scale: 0, midColumns: 0, arenaColumns: 0 }
}

// The status panel's frame through the fight: red while it stands, white as a blow lands, gold when it falls.
export const battleFrame = (fx: BossFx | undefined): string => (fx?.event === 'defeat' ? 'yellow' : fx?.event === 'hit' ? 'white' : 'red')

// The foe's side of the duel: the middle column, then the monster `scale` times its size, `rows` tall.
export function renderFoeSide(ui: ElementTable, props: FoeSideProps, rows: number, duel: Duel) {
  const { scale, midColumns } = duel
  const { Box, Text, Button } = ui
  const { boss, fx, Raster } = props
  const Svg = Raster === undefined && 'Svg' in ui ? ui.Svg : undefined
  const isDefeat = fx?.event === 'defeat'
  const hp = isDefeat ? 0 : boss.hp
  const bar = barParts(hp, boss.maxHp, midColumns)
  const columns = duel.arenaColumns
  const spriteRows = BOSS_ROWS * scale
  const damage = fx?.event === 'hit' ? fx.damage : 0
  const enraged = !isDefeat && isEnraged(boss)

  let sprite: RenderChildren = null
  if (Raster !== undefined) {
    sprite = <Raster key="boss" columns={columns} rows={spriteRows} cells={props.cells ?? ''} />
  } else if (Svg !== undefined) {
    const { grids, ticks } = bossFrames(boss.kind, fx?.event, scale, damage, columns, enraged, props.party)
    const drawn = spriteSvg(grids.map(one => gridToPixels(one.art, one.palette)), COLUMN_PX, FRAME_MS * ticks)
    sprite = <Svg key="boss" source={drawn.source} alt={boss.name} width={drawn.width} height={drawn.height} {...(drawn.isAnimated ? { isInteractive: true } : {})} />
  }

  // The moment, cried under the VS; a rage it stays in; quiet while it only stands.
  const cry = isDefeat ? (
    <Text bold color="yellow">✦ VICTORY</Text>
  ) : fx?.event === 'appear' ? (
    <Text bold color="red">! APPEARS</Text>
  ) : damage > 0 ? (
    <Text bold color="yellow">{damage * 2 >= fx!.boss.maxHp ? '💥 CRIT!' : '⚔ HIT!'}</Text>
  ) : enraged ? (
    <Text bold color="red">🔥 ENRAGED</Text>
  ) : (
    <Text> </Text>
  )
  const accent = isDefeat ? 'yellow' : 'red'
  const vs = vsGrid(isDefeat)
  let vsDrawn: RenderChildren = <Text bold color={accent}>VS</Text>
  if (Raster !== undefined) {
    vsDrawn = <Raster key="vs" columns={VS_COLUMNS} rows={VS_ROWS} cells={composeSprite(vs.art, vs.palette)} />
  } else if (Svg !== undefined) {
    const drawn = spriteSvg([gridToPixels(vs.art, vs.palette)], COLUMN_PX, FRAME_MS)
    vsDrawn = <Svg key="vs" source={drawn.source} alt="VS" width={drawn.width} height={drawn.height} />
  }

  return (
    <Box key="foe" flexDirection="row" height={rows} columnGap={DUEL_GAP}>
      <Box flexDirection="column" width={midColumns} height={rows}>
        <Text bold color={accent} wrap="truncate">{boss.name}</Text>
        {Svg !== undefined ? (
          <Svg key="bar-encounter" source={barSvg(hp, boss.maxHp, midColumns, 'red')} alt={`${boss.name} ${hp}/${boss.maxHp}`} width={midColumns * COLUMN_PX} height={BAR_HEIGHT} />
        ) : (
          <Text wrap="truncate">
            <Text color="red">{bar.filled}</Text>
            <Text dimColor>{bar.empty}</Text>
          </Text>
        )}
        <Text color="red">HP {hp}/{boss.maxHp}</Text>
        <Box height={VS_ROWS} justifyContent="center">
          {vsDrawn}
        </Box>
        <Box height={1} justifyContent="center">
          {cry}
        </Box>
        <Box flexGrow={1} />
        {/* A command of the battle menu: a solid red key that turns gold under the pointer or the focus. */}
        {!isDefeat && props.onFight !== undefined && (
          <Box height={1} justifyContent="center">
            <Button key="fight" label={FIGHT_LABEL} plain onPress={props.onFight}>
              <Text bold color="#1a1020" backgroundColor="#ff5a3c" hover={{ backgroundColor: '#ffd23c' }}>
                {` ${FIGHT_LABEL} `}
              </Text>
            </Button>
          </Box>
        )}
      </Box>
      <Box width={columns} height={rows}>{sprite}</Box>
    </Box>
  )
}
