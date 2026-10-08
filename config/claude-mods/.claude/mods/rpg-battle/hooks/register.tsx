import type { EngineInterface, Register } from 'claude-code'

// Emoji with default emoji presentation only: no VS16, so every terminal gives them two cells.
const SKILLS: ReadonlyArray<readonly [RegExp, string]> = [
  [/^(Bash|BashOutput|KillShell|TaskOutput|TaskStop|Monitor)$/, '🔥'],
  [/^Read$|^NotebookRead$/, '📖'],
  [/^Grep$|^Glob$|^LS$|^ToolSearch$/, '🔍'],
  [/^Edit$|^MultiEdit$|^Write$|^NotebookEdit$/, '🔨'],
  [/^Web(Fetch|Search)$/, '🔭'],
  [/^(Agent|Task|SendMessage)$/, '🧙'],
  [/^Todo|^Task(Create|Update|List|Get)$/, '📜'],
  [/^Skill$/, '✨'],
  [/^mcp__/, '🔮'],
]
const DEFAULT_SKILL = '🎯'
const FAILED = '💀'
const FLED = '🚫'
const GROUP = '🌀'
// Runs this long or longer read as a combo.
export const COMBO_MIN = 3

export const skillIcon = (tool: string): string =>
  SKILLS.find(([pattern]) => pattern.test(tool))?.[1] ?? DEFAULT_SKILL

export const rowIcon = (row: { tool: string; isErrored: boolean; isInterrupted: boolean }): string => {
  if (row.isInterrupted) return FLED
  if (row.isErrored) return FAILED
  return skillIcon(row.tool)
}

// A folded run shows its worst call: fled over failed over the plain group mark.
export const groupIcon = (calls: ReadonlyArray<{ isErrored: boolean; isInterrupted: boolean }>): string => {
  if (calls.some(call => call.isInterrupted)) return FLED
  if (calls.some(call => call.isErrored)) return FAILED
  return GROUP
}

// Cast bar: a Raster under a running row, repainted by blit; a short flash once the call lands.
export const CAST_COLUMNS = 20
const TICK_MS = 80
// One sweep of the bar, in ticks; the bar then pulses for PULSE_TICKS before charging again.
const CHARGE_TICKS = CAST_COLUMNS
const PULSE_TICKS = 4
export const FLASH_TICKS = 5
// Rows whose blit keeps being refused (scrolled away, unmounted) stop animating after this.
const MAX_MISSES = 25

const DEFAULT = 0x01000000
const TRACK = 0x3a3a3a
const WHITE = 0xffffff
const RED = 0xff3b3b
const DIM_RED = 0x5a1010
const GRAY = 0x808080
const SKILL_COLORS: Record<string, number> = {
  '🔥': 0xff7a1a, '📖': 0x5aa0ff, '🔍': 0x3fd0d0, '🔨': 0xd8b04a, '🔭': 0xa078ff,
  '🧙': 0xc060ff, '📜': 0xc8a070, '✨': 0xffe040, '🔮': 0xff50c8, '🎯': 0xff5050,
}
const TRACK_GLYPH = 0x2500 // ─
const FILL_GLYPH = 0x2501 // ━
const HEAD_GLYPH = 0x2588 // █
const SHADES = [0x2593, 0x2592, 0x2591] // ▓ ▒ ░

export type Landing = 'hit' | 'miss' | 'fled'

const pack = (cells: ReadonlyArray<readonly [number, number, number]>): string => {
  const words = new Uint32Array(cells.length * 3)
  cells.forEach(([glyph, fg, bg], i) => words.set([glyph, fg, bg], i * 3))
  return btoa(String.fromCharCode(...new Uint8Array(words.buffer)))
}

const scale = (color: number, k: number): number => {
  const ch = (shift: number) => Math.round(((color >> shift) & 0xff) * k) << shift
  return ch(16) | ch(8) | ch(0)
}

export const castCells = (color: number, tick: number): ReadonlyArray<readonly [number, number, number]> => {
  const t = tick % (CHARGE_TICKS + PULSE_TICKS)
  return Array.from({ length: CAST_COLUMNS }, (_, i) => {
    // Full bar pulsing between bright and the skill's color.
    if (t >= CHARGE_TICKS) return [FILL_GLYPH, t % 2 === 0 ? WHITE : color, DEFAULT] as const
    if (i < t) return [FILL_GLYPH, scale(color, 0.55 + 0.45 * (i / t)), DEFAULT] as const
    if (i === t) return [HEAD_GLYPH, WHITE, DEFAULT] as const
    return [TRACK_GLYPH, TRACK, DEFAULT] as const
  })
}

export const flashCells = (landing: Landing, color: number, tick: number): ReadonlyArray<readonly [number, number, number]> => {
  const fade = SHADES[Math.min(tick - 2, SHADES.length - 1)] ?? HEAD_GLYPH
  const cell = (): readonly [number, number, number] => {
    if (landing === 'miss') return tick % 2 === 0 ? [HEAD_GLYPH, RED, DEFAULT] : [HEAD_GLYPH, DIM_RED, DEFAULT]
    if (landing === 'fled') return [tick < 2 ? FILL_GLYPH : fade, GRAY, DEFAULT]
    if (tick === 0) return [HEAD_GLYPH, WHITE, DEFAULT]
    return [tick === 1 ? HEAD_GLYPH : fade, color, DEFAULT]
  }
  return Array.from({ length: CAST_COLUMNS }, cell)
}

export const landingOf = (row: { isErrored: boolean; isInterrupted: boolean }): Landing =>
  row.isInterrupted ? 'fled' : row.isErrored ? 'miss' : 'hit'

const LANDING_LABEL: Record<Landing, string> = { hit: ' HIT!', miss: ' MISS', fled: ' FLED' }

export const comboLabel = (count: number): string | undefined =>
  count >= COMBO_MIN ? ` ×${count} COMBO` : undefined

// The engine's row stays whole; the icon sits in a gutter beside it.
// Engine rows open with a blank spacer row, so the gutter starts one row down to meet the title.
const GUTTER_TOP = 1

// Rows seen running, by tool_use_id: charging while running, then flashing once, then done.
type Cast = { color: number; tick: number; misses: number; landing?: Landing }
const casts = new Map<string, Cast>()
const landed = new Set<string>()
let ticker: ReturnType<EngineInterface['clock']['every']> | undefined
// A tick still awaiting its blits makes the next one skip.
let isPainting = false

const frame = (cast: Cast): string =>
  pack(cast.landing === undefined ? castCells(cast.color, cast.tick) : flashCells(cast.landing, cast.color, cast.tick))

// One ticker paints every bar.
async function paint($: EngineInterface) {
  if (isPainting) return
  isPainting = true
  let hasLanded = false
  for (const [id, cast] of casts) {
    cast.tick += 1
    if (cast.landing !== undefined && cast.tick >= FLASH_TICKS) {
      casts.delete(id)
      landed.add(id)
      hasLanded = true
      continue
    }
    const shown = await $.ui
      .blit({ requestId: id, key: 'cast', cells: frame(cast) })
      .catch(() => ({ deny: 'blit failed' }))
    cast.misses = shown.deny === undefined ? 0 : cast.misses + 1
    if (cast.misses >= MAX_MISSES) casts.delete(id)
  }
  isPainting = false
  // A finished flash leaves its row: redraw so the bar goes.
  if (hasLanded) $.ui.invalidate('ui.render')
  if (casts.size === 0) {
    ticker?.cancel()
    ticker = undefined
  }
}

function ensureTicker($: EngineInterface) {
  ticker ??= $.clock.every(TICK_MS, () => void paint($))
}

export const register: Register = on => {
  // ToolResult carries no isInterrupted: remember the fled calls from their ToolUse rows.
  const fled = new Set<string>()

  on('ui.render', { component: 'ToolUse' }, async ($, e, next) => {
    const drawn = await next(e)
    const id = e.props.tool_use_id
    if (e.props.isInterrupted) fled.add(id)
    if (e.surface !== 'terminal') return drawn

    let cast = casts.get(id)
    if (e.props.isRunning && cast === undefined && !landed.has(id)) {
      cast = { color: SKILL_COLORS[skillIcon(e.props.tool)] ?? WHITE, tick: 0, misses: 0 }
      casts.set(id, cast)
    } else if (!e.props.isRunning && cast !== undefined && cast.landing === undefined) {
      cast.landing = landingOf(e.props)
      cast.tick = 0
    }
    if (cast !== undefined) ensureTicker($)

    const { Box, Text, Raster } = $.ui.resolve(e)
    const bar = cast === undefined ? null : (
      <Box flexDirection="row" marginLeft={2}>
        <Raster key="cast" columns={CAST_COLUMNS} rows={1} cells={frame(cast)} />
        {cast.landing === undefined
          ? <Text dimColor>{' casting…'}</Text>
          : <Text color={cast.landing === 'hit' ? 'success' : cast.landing === 'miss' ? 'error' : undefined} dimColor={cast.landing === 'fled'} bold>{LANDING_LABEL[cast.landing]}</Text>}
      </Box>
    )
    return (
      <Box flexDirection="row">
        <Box marginTop={GUTTER_TOP}><Text>{`${rowIcon(e.props)} `}</Text></Box>
        <Box flexGrow={1} flexDirection="column">{drawn}{bar}</Box>
      </Box>
    )
  })

  on('ui.render', { component: 'ToolResult' }, async ($, e, next) => {
    const drawn = await next(e)
    if (e.surface !== 'terminal' || !e.props.isErrored || fled.has(e.props.tool_use_id)) return drawn
    const { Box, Text } = $.ui.resolve(e)
    return (
      <Box flexDirection="column">
        {drawn}
        <Text color="error" bold>{'   ❌ MISS!'}</Text>
      </Box>
    )
  })

  on('ui.render', { component: 'ToolGroup' }, async ($, e, next) => {
    const drawn = await next(e)
    if (e.surface !== 'terminal' || e.props.isExpanded) return drawn
    const combo = comboLabel(e.props.calls.length)
    const { Box, Text } = $.ui.resolve(e)
    return (
      <Box flexDirection="row">
        <Box marginTop={GUTTER_TOP}><Text>{`${groupIcon(e.props.calls)} `}</Text></Box>
        <Box flexGrow={1} flexDirection="column">{drawn}</Box>
        {combo === undefined ? null : <Box marginTop={GUTTER_TOP}><Text color="warning" bold>{combo}</Text></Box>}
      </Box>
    )
  })
}
