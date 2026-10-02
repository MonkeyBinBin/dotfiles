import type { ElementTable } from 'claude-code'

import type { Boss, Combo, ToolCall, Vitals } from '../types'
import { HERO_CELLS, anim } from './anim'
import { barParts, oneLine } from './util'
import { CLASSES, rankOf } from './classes'
import type { HeroClass } from './classes'

// The stats column is as tall as the portrait: name, rank, HP, MP, XP, rule, combo, party, status, boss.
export const STATS_ROWS = 10
// The status panel's double border above and below the stats.
export const STATUS_ROWS = STATS_ROWS + 2
// The border and the padding column on each side.
const PANEL_CHROME_COLUMNS = 4
const PORTRAIT_GAP = 2
// The narrowest stats column worth drawing beside the portrait.
const MIN_STATS_COLUMNS = 24
// 'HP ' before a bar and ' 99/99' after it.
const BAR_LABEL = 3
const BAR_NOTE = 7
const MAX_BAR = 18
const MIN_BAR = 6

// The wizard's rank at a level; other classes go through rankOf.
export const rankFor = (level: number): string => rankOf(CLASSES.wizard, level)

export const HEARTS = 5
const HP_WINDOW = 10
export const CALLS_PER_LEVEL = 10
const MP_MAX = 100

// $.state outlives a reload, so entries the first pane version stored ({ id, tool, isDone }) still arrive here.
export const normalizeCall = (stored: unknown): ToolCall => {
  const call = stored as Partial<ToolCall> & { isDone?: boolean; id: string; tool: string }
  if (call.status !== undefined) return call as ToolCall
  return {
    id: call.id,
    tool: call.tool,
    summary: call.summary ?? '',
    startedAt: call.startedAt ?? 0,
    status: call.isDone === false ? 'run' : 'ok',
  }
}

// Level follows the call count; each failure among the recent calls costs a heart.
export const heroStats = (list: readonly ToolCall[]) => {
  const failures = list.slice(-HP_WINDOW).filter(call => call.status === 'err').length
  return {
    level: 1 + Math.floor(list.length / CALLS_PER_LEVEL),
    xp: list.length % CALLS_PER_LEVEL,
    hp: HEARTS - Math.min(HEARTS, failures),
  }
}

// MP is the context window left; unknown until the first reading.
export const manaLeft = (vitals: Vitals): number | undefined =>
  vitals.contextPercent === undefined ? undefined : Math.max(0, MP_MAX - Math.round(vitals.contextPercent))

// Green while healthy, yellow when hurt, red when nearly out.
export const gaugeColor = (value: number, max: number, healthy: string): string => {
  const share = max <= 0 ? 0 : value / max
  if (share > 0.6) return healthy
  return share > 0.3 ? 'yellow' : 'red'
}

// Whether the portrait fits beside a usable stats column, and how wide that column and its bars are.
export const statusLayout = (width: number, hasRaster: boolean) => {
  const inner = Math.max(0, width - PANEL_CHROME_COLUMNS)
  const hasPortrait = hasRaster && inner >= HERO_CELLS.columns + PORTRAIT_GAP + MIN_STATS_COLUMNS
  const statsWidth = hasPortrait ? inner - HERO_CELLS.columns - PORTRAIT_GAP : inner
  const barWidth = Math.max(MIN_BAR, Math.min(MAX_BAR, statsWidth - BAR_LABEL - BAR_NOTE))
  return { hasPortrait, statsWidth, barWidth }
}

export type StatusData = {
  hero: HeroClass
  list: readonly ToolCall[]
  vitals: Vitals
  combo: Combo
  boss: Boss | null
  trophies: { earned: number; total: number }
  petsOut: number
  // The outpost (worktree) the session works in, when not the repository's main folder.
  camp?: string
  isFlashing: boolean
  width: number
}

const Bar = (ui: ElementTable, label: string, color: string, value: number, max: number, note: string, width: number) => {
  const { Text } = ui
  const { filled, empty } = barParts(value, max, width)
  return (
    <Text wrap="truncate">
      <Text bold color={color}>{label} </Text>
      <Text color={color}>{filled}</Text>
      <Text dimColor>{empty}</Text>
      <Text color={color}> {note}</Text>
    </Text>
  )
}

// The hero's status window: always on top, whatever the menu shows below.
export function renderStatus(ui: ElementTable, data: StatusData, Raster?: ElementTable<'terminal'>['Raster']) {
  const { Box, Text } = ui
  const { list, vitals, combo, boss, width } = data
  const { level, xp, hp } = heroStats(list)
  const mp = manaLeft(vitals)
  const current = list.findLast(call => call.status === 'run')
  const failed = list.filter(call => call.status === 'err').length
  const { hasPortrait, statsWidth, barWidth } = statusLayout(width, Raster !== undefined)
  const { hero } = data
  const frame = data.isFlashing ? 'yellow' : hero.color
  const fullName = `CLAUDE THE ${hero.title}`
  const name = statsWidth >= fullName.length + 6 ? fullName : 'CLAUDE'
  const gold = vitals.usd === undefined ? '' : `⛁ ${vitals.usd.toFixed(2)}`
  anim.hasHero = hasPortrait

  const bossRow =
    boss === null ? null : (
      <Text wrap="truncate">
        <Text bold color="red">☠ {boss.name} </Text>
        <Text color="red">{barParts(boss.hp, boss.maxHp, Math.max(4, Math.min(10, statsWidth - boss.name.length - 9))).filled}</Text>
        <Text dimColor>{barParts(boss.hp, boss.maxHp, Math.max(4, Math.min(10, statsWidth - boss.name.length - 9))).empty}</Text>
        <Text color="red"> {boss.hp}/{boss.maxHp}</Text>
      </Text>
    )

  return (
    <Box flexDirection="row" width={width} height={STATUS_ROWS} borderStyle="double" borderColor={frame} paddingX={1}>
      {hasPortrait && Raster && (
        <Box width={HERO_CELLS.columns + PORTRAIT_GAP}>
          <Raster key="hero" {...HERO_CELLS} cells={anim.shownCells} />
        </Box>
      )}
      <Box flexDirection="column" width={statsWidth} height={STATS_ROWS}>
        <Box height={1}>
          <Box flexGrow={1}>
            <Text bold color={frame}>
              {name}
            </Text>
          </Box>
          <Text bold color="yellow">
            Lv.{level}
          </Text>
        </Box>
        <Text wrap="truncate">
          <Text italic color="cyan">{rankOf(hero, level)}</Text>
          <Text dimColor> · {list.length} casts</Text>
        </Text>
        {Bar(ui, 'HP', gaugeColor(hp, HEARTS, 'green'), hp, HEARTS, `${hp}/${HEARTS}`, barWidth)}
        {mp === undefined
          ? Bar(ui, 'MP', 'blue', 0, MP_MAX, '?', barWidth)
          : Bar(ui, 'MP', gaugeColor(mp, MP_MAX, 'blue'), mp, MP_MAX, `${mp}%`, barWidth)}
        {Bar(ui, 'XP', 'magenta', xp, CALLS_PER_LEVEL, `${xp}/${CALLS_PER_LEVEL}`, barWidth)}
        <Text color={frame} dimColor>
          {'┈'.repeat(statsWidth)}
        </Text>
        <Box height={1}>
          <Box flexGrow={1}>
            <Text wrap="truncate">
              <Text bold color={combo.current >= 10 ? 'yellow' : 'white'}>⚡×{combo.current}</Text>
              <Text dimColor> best {combo.best}</Text>
            </Text>
          </Box>
          {gold !== '' && <Text color="yellow">{gold}</Text>}
        </Box>
        <Text wrap="truncate">
          <Text color="yellow">★ {data.trophies.earned}/{data.trophies.total}</Text>
          <Text dimColor> feats</Text>
          <Text color="green">  ♣ {data.petsOut}</Text>
          <Text dimColor> in party</Text>
        </Text>
        {current ? (
          <Text color="yellow" wrap="truncate">
            {hero.acting} <Text bold>{current.tool}</Text>{' '}
            <Text dimColor>{oneLine(current.summary, statsWidth - hero.acting.length - 2 - current.tool.length)}</Text>
          </Text>
        ) : (
          <Text dimColor wrap="truncate">
            {data.camp === undefined ? hero.resting : `🏕 camping at ${data.camp}`}
          </Text>
        )}
        {bossRow ??
          (failed > 0 ? (
            <Text color="red" wrap="truncate">
              ✗ {failed} {hero.failures}
            </Text>
          ) : (
            <Text color="green" dimColor>
              ✓ no {hero.failures}
            </Text>
          ))}
      </Box>
    </Box>
  )
}
