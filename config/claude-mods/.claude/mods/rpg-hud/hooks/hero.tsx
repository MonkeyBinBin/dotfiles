import type { ElementTable, RenderChildren } from 'claude-code'

import type { Boss, Combo, ToolCall, Vitals } from '../types'
import { HERO_CELLS, anim } from './anim'
import { oneLine } from './util'
import { gauge } from './gauge'
import { HEX, RGB, ramp, rampRgb, tone } from './palette'
import { CLASSES, rankOf } from './classes'
import { battleFrame, duelLayout, renderFoeSide } from './encounter'
import { restingMana } from './rest'
import type { FoeSideProps } from './encounter'
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

// Level follows the call count (`total`, uncapped; the list keeps only the latest calls);
// each failure among the recent calls costs a heart.
export const heroStats = (list: readonly ToolCall[], total: number = list.length) => {
  const failures = list.slice(-HP_WINDOW).filter(call => call.status === 'err').length
  return {
    level: 1 + Math.floor(total / CALLS_PER_LEVEL),
    xp: total % CALLS_PER_LEVEL,
    hp: HEARTS - Math.min(HEARTS, failures),
  }
}

// MP is the context window left; unknown until the first reading.
export const manaLeft = (vitals: Vitals): number | undefined =>
  vitals.contextPercent === undefined ? undefined : Math.max(0, MP_MAX - Math.round(vitals.contextPercent))

// A gauge's colour as it drains: `healthy` from 60% up, sliding through gold to red.
export const gaugeColor = (value: number, max: number, healthy: number): string => ramp(max <= 0 ? 0 : value / max, healthy)

// MP under this share pulses.
export const LOW_MANA = 20

// Whether the portrait fits beside a usable stats column, and how wide that column and its bars are.
export const statusLayout = (width: number, hasRaster: boolean) => {
  const inner = Math.max(0, width - PANEL_CHROME_COLUMNS)
  const hasPortrait = hasRaster && inner >= HERO_CELLS.columns + PORTRAIT_GAP + MIN_STATS_COLUMNS
  const statsWidth = hasPortrait ? inner - HERO_CELLS.columns - PORTRAIT_GAP : inner
  const barWidth = Math.max(MIN_BAR, Math.min(MAX_BAR, statsWidth - BAR_LABEL - BAR_NOTE))
  return { hasPortrait, statsWidth, barWidth }
}

// The duel a foe turns the panel to, when it fits: the stats step aside for it. Scale 0 when it does not.
export const panelDuel = (width: number, hasPicture: boolean) =>
  duelLayout(Math.max(0, width - PANEL_CHROME_COLUMNS), hasPicture, HERO_CELLS.columns)

export type StatusData = {
  hero: HeroClass
  // Every call this session; `list` holds only the latest.
  casts: number
  list: readonly ToolCall[]
  vitals: Vitals
  combo: Combo
  boss: Boss | null
  // Background shells and monitors still running.
  jobsOut: number
  petsOut: number
  // The outpost (worktree) the session works in, when not the repository's main folder.
  camp?: string
  isFlashing: boolean
  width: number
  // The tool the session waits on the person for: a permission prompt, or a question.
  waitingFor?: string
  // Opens or closes the help page; the name row then carries a ? for it.
  onHelp?: () => void
  // Fills the prompt with the boss's fix; the boss row then carries a button for it.
  onFight?: () => void
  // The foe standing (or crumbling) and the moment of the fight: drawn on the panel's right when it fits, in
  // place of the boss row.
  foe?: Omit<FoeSideProps, 'onFight'>
  // Knocked out (every heart lost), or just revived by a clean cast.
  knockout?: 'down' | 'revived'
  // A night at the inn under way: how far into it, and the MP left before it.
  rest?: { elapsed: number; from?: number }
  // The combo's aura, drawn in the gap beside the portrait, and its tier for the frame's colour.
  aura?: { node: RenderChildren; tier: 1 | 2 }
  // The terminal's Raster for the gauges, which the animation can blit (the MP's pulse).
  gaugeRaster?: ElementTable<'terminal'>['Raster']
  // How long ago the level up began, while its flash lasts: the XP gauge fills, flashes and empties, the level glows.
  levelUp?: number
  // The heart just lost, white for a moment, and how long ago a failed call cost it: a red -1 floats up beside the
  // portrait.
  heartFlash?: number
  damage?: number
  // The combo's last change while it shows: a rise lights the count, a break cries BREAK.
  comboFx?: 'up' | 'break'
  // A burst playing in the stats column's lower right: a level up, a revive.
  celebration?: RenderChildren
}

const FIGHT_LABEL = '⚔ fix'

// The level up's XP gauge: full, then white, then empty again.
export const XP_FULL_MS = 350
export const XP_FLASH_MS = 700
// The -1's climb beside the portrait, a row a step.
export const DAMAGE_MS = 600
const DAMAGE_STEP_MS = 150
const DAMAGE_ROW = 6

type SvgElement = ElementTable<'desktop'>['Svg']

// A gauge row: the label, the gauge and its reading, in one colour.
const Bar = (ui: ElementTable, label: string, rgb: number, share: number, note: string, width: number, Raster?: ElementTable<'terminal'>['Raster'], cells?: string) => {
  const { Box, Text } = ui
  const color = `#${rgb.toString(16).padStart(6, '0')}`
  return (
    <Box flexDirection="row" height={1} alignItems="center">
      <Text bold color={color}>
        {label}{' '}
      </Text>
      {gauge(ui, { key: `bar-${label}`, share, width, rgb, alt: `${label} ${note}`, ...(Raster === undefined ? {} : { Raster }), ...(cells === undefined ? {} : { cells }) })}
      <Text color={color}> {note}</Text>
    </Box>
  )
}

// The HP gauge, in the same style as MP and XP: white for a moment when a failed call has just cost a heart.
const HpBar = (ui: ElementTable, hp: number, width: number, Raster: ElementTable<'terminal'>['Raster'] | undefined, flash?: number) =>
  Bar(ui, 'HP', flash === undefined ? rampRgb(hp / HEARTS, RGB.green) : 0xffffff, hp / HEARTS, `${hp}/${HEARTS}`, width, Raster)

export function renderStatus(ui: ElementTable, data: StatusData, Raster?: ElementTable<'terminal'>['Raster'], portrait?: RenderChildren) {
  const { Box, Text, Button } = ui
  const { list, vitals, combo, boss, width } = data
  const { level, xp, hp } = heroStats(list, data.casts)
  const mp = manaLeft(vitals)
  const current = list.findLast(call => call.status === 'run')
  const failed = list.filter(call => call.status === 'err').length
  const hasPicture = Raster !== undefined || portrait !== undefined
  const duel = data.foe === undefined ? undefined : panelDuel(width, hasPicture)
  const hasFoeSide = duel !== undefined && duel.scale > 0
  const { statsWidth, barWidth, ...layout } = statusLayout(width, hasPicture)
  const hasPortrait = hasFoeSide ? duel.hasPortrait : layout.hasPortrait
  const { hero } = data
  // Every surface but the terminal (the one with a Raster) draws SVG.
  const Svg = Raster === undefined && 'Svg' in ui ? (ui.Svg as SvgElement) : undefined
  const frame =
    data.knockout === 'down' ? 'gray'
    : data.knockout === 'revived' ? 'green'
    : data.rest !== undefined ? 'cyan'
    : data.isFlashing ? 'yellow'
    : hasFoeSide ? battleFrame(data.foe?.fx)
    : data.aura !== undefined ? (data.aura.tier === 2 ? 'magenta' : 'yellow')
    : hero.color
  const fullName = `CLAUDE THE ${hero.title}`
  // Room for the ` Lv.NN ` badge beside the name, and for the ? after it.
  const name = statsWidth >= fullName.length + 8 + (data.onHelp === undefined ? 0 : 2) ? fullName : 'CLAUDE'
  const { usd } = vitals
  // Only the terminal's Raster takes the animation's blits; a drawing animates itself.
  anim.hasHero = hasPortrait && Raster !== undefined

  const fightRoom = data.onFight === undefined ? 0 : FIGHT_LABEL.length + 1
  const bossWidth = Math.max(4, Math.min(10, statsWidth - (boss?.name.length ?? 0) - 9 - fightRoom))
  const bossRow =
    boss === null || hasFoeSide ? null : (
      <Box height={1}>
        <Box flexGrow={1} flexDirection="row" height={1} alignItems="center">
          <Text bold color={HEX.red} wrap="truncate">
            ☠ {boss.name}{' '}
          </Text>
          {gauge(ui, {
            key: 'bar-boss',
            share: boss.maxHp <= 0 ? 0 : boss.hp / boss.maxHp,
            width: bossWidth,
            rgb: RGB.red,
            alt: `${boss.name} ${boss.hp}/${boss.maxHp}`,
            ...(data.gaugeRaster === undefined ? {} : { Raster: data.gaugeRaster }),
          })}
          <Text color={HEX.red}> {boss.hp}/{boss.maxHp}</Text>
        </Box>
        {data.onFight !== undefined && <Button key="fight" label={FIGHT_LABEL} plain onPress={data.onFight} />}
      </Box>
    )

  // A failed call's -1 climbs the gap beside the portrait, a row a step.
  const damage =
    data.damage === undefined || hasFoeSide ? null : (
      <Box key="damage" position="absolute" left={HERO_CELLS.columns} top={Math.max(1, DAMAGE_ROW - Math.floor(data.damage / DAMAGE_STEP_MS))} width={PORTRAIT_GAP} height={1}>
        <Text bold color={HEX.red}>-1</Text>
      </Box>
    )

  return (
    <Box flexDirection="row" width={width} height={STATUS_ROWS} borderStyle="double" borderColor={frame} paddingX={1}>
      {hasPortrait && (
        // A drawing sits at the top of its box: off the terminal the portrait is centred down the stats column.
        <Box width={HERO_CELLS.columns + (hasFoeSide ? 1 : PORTRAIT_GAP)} {...(Svg === undefined ? {} : { height: STATS_ROWS, alignItems: 'center' as const })}>
          {Raster ? <Raster key="hero" {...HERO_CELLS} cells={anim.shownCells} /> : portrait}
          {!hasFoeSide && data.aura?.node}
          {damage}
        </Box>
      )}
      {hasFoeSide && data.foe !== undefined
        ? renderFoeSide(ui, { ...data.foe, ...(data.onFight === undefined ? {} : { onFight: data.onFight }) }, STATS_ROWS, duel)
        : renderStats()}
    </Box>
  )

  function renderStats() {
    const gaugeRaster = data.gaugeRaster
    const levelUp = data.levelUp
    // The level up's gauge: full, then white, then back to what the new level holds.
    const xpBar =
      levelUp !== undefined && levelUp < XP_FULL_MS
        ? Bar(ui, 'XP', RGB.magenta, 1, `${CALLS_PER_LEVEL}/${CALLS_PER_LEVEL}`, barWidth, gaugeRaster)
        : levelUp !== undefined && levelUp < XP_FLASH_MS
        ? Bar(ui, 'XP', 0xffffff, 1, `${CALLS_PER_LEVEL}/${CALLS_PER_LEVEL}`, barWidth, gaugeRaster)
        : Bar(ui, 'XP', RGB.magenta, xp / CALLS_PER_LEVEL, `${xp}/${CALLS_PER_LEVEL}`, barWidth, gaugeRaster)
    const isGlowing = data.isFlashing
    const comboStyle =
      data.comboFx === 'up'
        ? { inverse: true, color: HEX.gold }
        : combo.current === 0
        ? { dimColor: true }
        : combo.current >= 10
        ? { color: HEX.gold }
        : {}
    return (
      <Box flexDirection="column" width={statsWidth} height={STATS_ROWS}>
        <Box height={1}>
          <Box flexGrow={1}>
            <Text bold color={tone(frame)}>
              {name}
            </Text>
          </Box>
          {/* The level as a badge: gold, white while a level up glows. */}
          <Text bold color="#1a1020" backgroundColor={isGlowing ? '#ffffff' : HEX.gold}>
            {` Lv.${level} `}
          </Text>
          {data.onHelp !== undefined && <Text> </Text>}
          {data.onHelp !== undefined && <Button key="help" label="?" plain onPress={data.onHelp} />}
        </Box>
        <Text wrap="truncate">
          <Text italic color={HEX.cyan}>{rankOf(hero, level)}</Text>
          <Text dimColor> · {data.casts} casts</Text>
        </Text>
        {HpBar(ui, hp, barWidth, gaugeRaster, data.heartFlash)}
        {mp === undefined
          ? Bar(ui, 'MP', RGB.blue, 0, '?', barWidth, gaugeRaster)
          : data.rest !== undefined
          ? (() => {
              const poured = restingMana(data.rest.from ?? 0, mp, data.rest.elapsed)
              return Bar(ui, 'MP', RGB.cyan, poured / MP_MAX, `${poured}%`, barWidth, gaugeRaster)
            })()
          : Bar(ui, 'MP', rampRgb(mp / MP_MAX, RGB.blue), mp / MP_MAX, `${mp}%`, barWidth, gaugeRaster)}
        {xpBar}
        <Text color={tone(frame)} dimColor wrap="truncate">
          {'┈'.repeat(statsWidth)}
        </Text>
        <Box height={1}>
          <Box flexGrow={1}>
            <Text wrap="truncate">
              <Text bold {...comboStyle}>⚡×{combo.current}</Text>
              {data.comboFx === 'break' && <Text bold color={HEX.red}> BREAK</Text>}
              <Text dimColor> best {combo.best}</Text>
            </Text>
          </Box>
          {usd !== undefined && (
            <Text>
              <Text dimColor>⛁ </Text>
              <Text color={HEX.gold}>{usd.toFixed(2)}</Text>
            </Text>
          )}
        </Box>
        <Text wrap="truncate">
          <Text {...(data.jobsOut === 0 ? { dimColor: true } : { color: HEX.gold })}>⚙ {data.jobsOut}</Text>
          <Text dimColor> {data.jobsOut === 1 ? 'job' : 'jobs'}</Text>
          <Text {...(data.petsOut === 0 ? { dimColor: true } : { color: HEX.green })}>  ♣ {data.petsOut}</Text>
          <Text dimColor> in party</Text>
        </Text>
        {data.rest !== undefined ? (
          <Text bold color={HEX.cyan} wrap="truncate">
            🌙 Resting at the inn <Text dimColor>· MP restored</Text>
          </Text>
        ) : data.knockout === 'down' ? (
          <Text bold color={HEX.red} wrap="truncate">
            💀 K.O. <Text dimColor>· a clean cast revives</Text>
          </Text>
        ) : data.knockout === 'revived' ? (
          <Text bold color={HEX.green} wrap="truncate">
            ✨ REVIVED! <Text dimColor>hearts restored</Text>
          </Text>
        ) : data.waitingFor !== undefined ? (
          <Text bold color={HEX.gold} wrap="truncate">
            ❗ {data.waitingFor === 'AskUserQuestion' ? 'awaiting your answer' : `awaiting your word on ${data.waitingFor}`}
          </Text>
        ) : current ? (
          <Text color={HEX.gold} wrap="truncate">
            {hero.acting} <Text bold>{current.tool}</Text>{' '}
            <Text dimColor>{oneLine(current.summary, statsWidth - hero.acting.length - 2 - current.tool.length)}</Text>
          </Text>
        ) : (
          <Text dimColor wrap="truncate">
            {data.camp === undefined ? hero.resting : `⛺ camping at ${data.camp}`}
          </Text>
        )}
        {bossRow ??
          (failed > 0 ? (
            <Text color={HEX.red} wrap="truncate">
              ✗ {failed} {hero.failures}
            </Text>
          ) : (
            <Text color={HEX.green} dimColor>
              ✓ no {hero.failures}
            </Text>
          ))}
        {data.celebration !== undefined && (
          <Box key="celebration" position="absolute" right={0} bottom={0}>
            {data.celebration}
          </Box>
        )}
      </Box>
    )
  }
}
