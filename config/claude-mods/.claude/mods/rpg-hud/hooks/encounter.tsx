import type { ElementTable, RenderChildren } from 'claude-code'

import type { Boss, BossFx } from '../types'
import { FRAME_MS } from './anim'
import { barSvg, BAR_HEIGHT, COLUMN_PX, gridToPixels, spriteSvg } from './svg'
import { barParts, composeSprite, oneLine } from './util'

// The encounter: while a boss stands, a card under the status panel shows it as a monster to beat, its HP as a
// long bar, and the blow each passing run lands: a white flash and the damage dealt. A slain boss crumbles away.

export const BOSS_COLUMNS = 12
// Nine pixel rows of art and one to bob in: five terminal rows of half blocks.
export const BOSS_ROWS = 5
// The card: the sprite's rows inside a border.
export const ENCOUNTER_ROWS = BOSS_ROWS + 2
// The narrowest pane the card is worth drawing in: the sprite, a gap and a usable bar.
export const ENCOUNTER_MIN_COLUMNS = 40
// How long each moment of the fight stays on the card.
export const FX_MS: Record<BossFx['event'], number> = { appear: 2400, hit: 1200, defeat: 1800 }

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

// The art in a canvas one row taller, `drop` rows down: 0 or 1, so the idle frames bob.
const canvas = (art: readonly string[], drop: number): string[] => {
  const blank = '.'.repeat(BOSS_COLUMNS)
  return [...Array.from({ length: drop }, () => blank), ...art, ...Array.from({ length: 1 - drop }, () => blank)]
}

// Every lit pixel one colour: the frame a blow lands on.
const silhouette = (monster: Monster, color: number): Monster => ({
  art: monster.art.map(line => line.replace(/[^.]/g, 'X')),
  palette: { X: color },
})

// A stable [0, 1) per pixel: which pixels crumble first.
const crumbleOrder = (x: number, y: number): number => {
  let hash = Math.imul(x + 1, 374761393) ^ Math.imul(y + 1, 668265263)
  hash = Math.imul(hash ^ (hash >>> 13), 1274126177)
  return ((hash ^ (hash >>> 16)) >>> 0) / 4294967296
}

// The monster falling apart: at `share` that much of it gone, and the bottom row of what is left aglow.
const crumbled = (monster: Monster, share: number): Monster => ({
  art: monster.art.map((line, y) => [...line].map((ch, x) => (ch === '.' || crumbleOrder(x, y) < share ? '.' : ch)).join('')),
  palette: monster.palette,
})

export type BossFrames = { frames: string[][]; ticks: number; loop: boolean }

const WHITE = 0xffffff
const EMBER = 0xff7a1a

// The frames a moment of the fight shows, as pixel grids, and how long each holds (in animation ticks).
export const bossFrames = (kind: string, event: BossFx['event'] | undefined): { grids: Monster[]; ticks: number; loop: boolean } => {
  const monster = monsterOf(kind)
  const idle = [
    { art: canvas(monster.art, 0), palette: monster.palette },
    { art: canvas(monster.art, 1), palette: monster.palette },
  ]
  if (event === 'hit') {
    const flash = silhouette(monster, WHITE)
    const flashed = { art: canvas(flash.art, 0), palette: flash.palette }
    return { grids: [flashed, idle[0]!, flashed, idle[0]!, ...idle, ...idle], ticks: 1, loop: false }
  }
  if (event === 'defeat') {
    const burn = silhouette(monster, EMBER)
    const steps = [0.15, 0.35, 0.55, 0.75, 0.9, 1].map(share => crumbled(monster, share))
    return {
      grids: [
        { art: canvas(silhouette(monster, WHITE).art, 0), palette: { X: WHITE } },
        { art: canvas(burn.art, 0), palette: burn.palette },
        ...steps.map(step => ({ art: canvas(step.art, 0), palette: step.palette })),
      ],
      ticks: 2,
      loop: false,
    }
  }
  // Standing (or just appeared), it bobs in place.
  return { grids: idle, ticks: 5, loop: true }
}

export const bossCells = (kind: string, event: BossFx['event'] | undefined): { frames: string[]; ticks: number; loop: boolean } => {
  const { grids, ticks, loop } = bossFrames(kind, event)
  return { frames: grids.map(grid => composeSprite(grid.art, grid.palette)), ticks, loop }
}

// The moment of the fight still on the card at `now`, if any.
export const liveFx = (fx: BossFx | null, now: number): BossFx | undefined =>
  fx !== null && now - fx.at < FX_MS[fx.event] ? fx : undefined

// The boss the card shows: the one standing, or the one just slain while it crumbles.
export const shownBoss = (boss: Boss | null, fx: BossFx | undefined): Boss | undefined =>
  boss ?? (fx?.event === 'defeat' ? fx.boss : undefined)

export type EncounterProps = {
  boss: Boss
  fx?: BossFx
  width: number
  // The terminal's Raster, which the animation blits; elsewhere the monster is a drawing.
  Raster?: ElementTable<'terminal'>['Raster']
  // The cells the Raster first draws, before the animation's next blit.
  cells?: string
  onFight?: () => void
}

const FIGHT_LABEL = '⚔ fix it'

// The card: the monster on the left, then its name, the HP bar, the command it guards and the call to arms.
export function renderEncounter(ui: ElementTable, props: EncounterProps) {
  const { Box, Text, Button } = ui
  const { boss, fx, Raster } = props
  const Svg = Raster === undefined && 'Svg' in ui ? ui.Svg : undefined
  const isDefeat = fx?.event === 'defeat'
  const inner = props.width - 4
  const textWidth = Math.max(8, inner - BOSS_COLUMNS - 2)
  const hp = isDefeat ? 0 : boss.hp
  const barWidth = Math.max(6, textWidth - String(boss.maxHp).length * 2 - 5)
  const bar = barParts(hp, boss.maxHp, barWidth)
  const frame = isDefeat ? 'yellow' : fx?.event === 'hit' ? 'white' : 'red'

  let sprite: RenderChildren = null
  if (Raster !== undefined) {
    sprite = <Raster key="boss" columns={BOSS_COLUMNS} rows={BOSS_ROWS} cells={props.cells ?? ''} />
  } else if (Svg !== undefined) {
    const { grids } = bossFrames(boss.kind, fx?.event)
    const drawn = spriteSvg(
      grids.map(grid => gridToPixels(grid.art, grid.palette)),
      COLUMN_PX,
      FRAME_MS * (fx === undefined || fx.event === 'appear' ? 5 : 2),
    )
    sprite = <Svg key="boss" source={drawn.source} alt={boss.name} width={drawn.width} height={drawn.height} {...(drawn.isAnimated ? { isInteractive: true } : {})} />
  }

  const headline = isDefeat
    ? <Text bold color="yellow">✦ {boss.name} is defeated! ✦</Text>
    : fx?.event === 'appear'
    ? <Text bold color="red">! A wild {boss.name} appears!</Text>
    : <Text bold color="red">☠ {boss.name}</Text>
  const damage = fx?.event === 'hit' && fx.damage > 0
  const isCritical = damage && fx.damage * 2 >= fx.boss.maxHp

  return (
    <Box key="encounter" flexDirection="row" width={props.width} height={ENCOUNTER_ROWS} borderStyle="round" borderColor={frame} paddingX={1}>
      <Box width={BOSS_COLUMNS + 2} height={BOSS_ROWS}>{sprite}</Box>
      <Box flexDirection="column" width={textWidth} height={BOSS_ROWS}>
        <Box height={1}>
          <Box flexGrow={1}>
            <Text wrap="truncate">{headline}</Text>
          </Box>
          {!isDefeat && <Text dimColor>ENCOUNTER</Text>}
        </Box>
        {Svg !== undefined ? (
          <Box flexDirection="row" height={1} alignItems="center">
            <Text bold color="red">HP </Text>
            <Svg key="bar-encounter" source={barSvg(hp, boss.maxHp, barWidth, 'red')} alt={`${boss.name} ${hp}/${boss.maxHp}`} width={barWidth * COLUMN_PX} height={BAR_HEIGHT} />
            <Text color="red"> {hp}/{boss.maxHp}</Text>
          </Box>
        ) : (
          <Text wrap="truncate">
            <Text bold color="red">HP </Text>
            <Text color="red">{bar.filled}</Text>
            <Text dimColor>{bar.empty}</Text>
            <Text color="red"> {hp}/{boss.maxHp}</Text>
          </Text>
        )}
        <Box height={1}>
          {damage ? (
            <Text bold color="yellow">
              {isCritical ? '💥 CRITICAL! ' : '⚔ '}-{fx.damage} HP
            </Text>
          ) : isDefeat ? (
            <Text color="yellow">⚑ The check passes. Victory!</Text>
          ) : (
            <Text dimColor wrap="truncate">guards {oneLine(boss.command, textWidth - 7)}</Text>
          )}
        </Box>
        <Text> </Text>
        <Box height={1}>
          <Box flexGrow={1}>
            <Text dimColor wrap="truncate">{isDefeat ? '' : 'pass the check to slay it'}</Text>
          </Box>
          {!isDefeat && props.onFight !== undefined && <Button key="encounter-fight" label={FIGHT_LABEL} plain onPress={props.onFight} />}
        </Box>
      </Box>
    </Box>
  )
}
