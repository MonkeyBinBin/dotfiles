import type { EngineInterface, Register } from 'claude-code'

import { castSize, chargeSvg, flashSvg } from './cast-svg'

// Each skill's icon and the color its cast bar charges in.
// Emoji with default emoji presentation only: no VS16, so every terminal gives them two cells.
const SKILLS: ReadonlyArray<readonly [RegExp, string, number]> = [
  [/^(Bash|BashOutput|KillShell|TaskOutput|TaskStop|Monitor)$/, '🔥', 0xff7a1a],
  [/^Read$|^NotebookRead$/, '📖', 0x5aa0ff],
  [/^Grep$|^Glob$|^LS$|^ToolSearch$/, '🔍', 0x3fd0d0],
  [/^Edit$|^MultiEdit$|^Write$|^NotebookEdit$/, '🔨', 0xd8b04a],
  [/^Web(Fetch|Search)$/, '🔭', 0xa078ff],
  [/^(Agent|Task|SendMessage)$/, '🧙', 0xc060ff],
  [/^Todo|^Task(Create|Update|List|Get)$/, '📜', 0xc8a070],
  [/^Skill$/, '✨', 0xffe040],
  [/^mcp__/, '🔮', 0xff50c8],
]
const DEFAULT_SKILL = '🎯'
const DEFAULT_SKILL_COLOR = 0xff5050
const FAILED = '💀'
const FLED = '🚫'
const GROUP = '🌀'
// Runs this long or longer read as a combo.
export const COMBO_MIN = 3

const skillOf = (tool: string) => SKILLS.find(([pattern]) => pattern.test(tool))

export const skillIcon = (tool: string): string => skillOf(tool)?.[1] ?? DEFAULT_SKILL

const skillColor = (tool: string): number => skillOf(tool)?.[2] ?? DEFAULT_SKILL_COLOR

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
// Long enough to read the damage the landing deals.
export const FLASH_TICKS = 12
// Rows whose blit keeps being refused (scrolled away, unmounted) stop animating after this.
const MAX_MISSES = 25

const DEFAULT = 0x01000000
const TRACK = 0x3a3a3a
const WHITE = 0xffffff
const RED = 0xff3b3b
const DIM_RED = 0x5a1010
const GRAY = 0x808080
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

// A hit's damage is what it brought back: the output's size in characters.
export const damageOf = (output: unknown): number => {
  if (output === undefined || output === null) return 0
  if (typeof output === 'string') return output.length
  try {
    return JSON.stringify(output)?.length ?? 0
  } catch {
    return 0
  }
}

// A haul this big lands as a critical hit.
export const CRIT_DAMAGE = 10_000

export const formatDamage = (damage: number): string =>
  damage < 1000 ? `${damage}` : `${(damage / 1000).toFixed(damage < 10_000 ? 1 : 0)}k`

export type LandingText = { text: string; color?: string; dimColor?: boolean }

// What a landing says beside its flash: a hit its damage, a critical one louder.
export const landingText = (landing: Landing, damage = 0): LandingText => {
  if (landing === 'miss') return { text: LANDING_LABEL.miss, color: 'error' }
  if (landing === 'fled') return { text: LANDING_LABEL.fled, dimColor: true }
  if (damage >= CRIT_DAMAGE) return { text: ` CRITICAL! -${formatDamage(damage)}`, color: 'warning' }
  return { text: damage > 0 ? ` HIT! -${formatDamage(damage)}` : LANDING_LABEL.hit, color: 'success' }
}

// Longer runs climb the tiers: a combo, a super combo from ten, an ultra combo from twenty.
export const comboLabel = (count: number): string | undefined => {
  if (count < COMBO_MIN) return undefined
  if (count >= 20) return ` ×${count} ULTRA COMBO`
  if (count >= 10) return ` ×${count} SUPER COMBO`
  return ` ×${count} COMBO`
}

export const comboColor = (count: number): string => (count >= 20 ? 'error' : count >= 10 ? 'permission' : 'warning')

type TextElement = ReturnType<EngineInterface['ui']['resolve']>['Text']

const landingLabel = (Text: TextElement, said: LandingText) => (
  <Text {...(said.color === undefined ? {} : { color: said.color })} dimColor={said.dimColor === true} bold>
    {said.text}
  </Text>
)

// The engine's row stays whole; the icon sits in a gutter beside it.
// Terminal rows open with a blank spacer row, so there the gutter starts one row down to meet the title.
const gutterTop = (surface: string) => (surface === 'terminal' ? 1 : 0)

// Rows seen running, by tool_use_id: charging while running, then flashing once, then done.
type Cast = { color: number; tick: number; misses: number; landing?: Landing; damage?: number }
const casts = new Map<string, Cast>()
const landed = new Set<string>()
// When each running call was first seen, by tool_use_id: the channelling line counts from it.
const castStarts = new Map<string, number>()
// The channelling lines under long calls, by their site's requestId: the call each counts for and the text shown.
const channels = new Map<string, { toolUseId: string; shown: string; misses: number }>()

// The seconds a long call has channelled, right-aligned in the line's few columns: ` 12s`, `1m 05s`.
export const CHANNEL_COLUMNS = 7
export const channelText = (ms: number): string => {
  const seconds = Math.max(0, Math.floor(ms / 1000))
  const text = seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m ${String(seconds % 60).padStart(2, '0')}s`
  return text.padStart(CHANNEL_COLUMNS).slice(-CHANNEL_COLUMNS)
}
const CHANNEL_COLOR = 0xffd23c
const channelCells = (text: string): string => pack([...text].map(ch => [ch.codePointAt(0) ?? 0x20, CHANNEL_COLOR, DEFAULT] as const))
let ticker: ReturnType<EngineInterface['clock']['every']> | undefined
// A tick still awaiting its blits makes the next one skip.
let isPainting = false

const frame = (cast: Cast): string =>
  pack(cast.landing === undefined ? castCells(cast.color, cast.tick) : flashCells(cast.landing, cast.color, cast.tick))

// One ticker paints every bar.
async function paint($: EngineInterface) {
  if (isPainting) return
  isPainting = true
  try {
    let hasLanded = false
    // Blits between frames fold into one, so every bar's goes out at once rather than a frame apiece.
    const blits: Array<Promise<void>> = []
    for (const [id, cast] of casts) {
      cast.tick += 1
      if (cast.landing !== undefined && cast.tick >= FLASH_TICKS) {
        casts.delete(id)
        landed.add(id)
        hasLanded = true
        continue
      }
      blits.push($.ui
        .blit({ requestId: id, key: 'cast', cells: frame(cast) })
        .catch(() => ({ deny: 'blit failed' }))
        .then(shown => {
          cast.misses = shown.deny === undefined ? 0 : cast.misses + 1
          if (cast.misses >= MAX_MISSES) casts.delete(id)
        }))
    }
    // Each channelling line ticks its seconds over; one whose call has landed (or that keeps being refused) stops.
    const now = await $.clock.now()
    for (const [site, channel] of channels) {
      const start = castStarts.get(channel.toolUseId)
      if (start === undefined || landed.has(channel.toolUseId) || casts.get(channel.toolUseId)?.landing !== undefined) {
        channels.delete(site)
        continue
      }
      const text = channelText(now - start)
      if (text === channel.shown) continue
      blits.push($.ui
        .blit({ requestId: site, key: 'channel', cells: channelCells(text) })
        .catch(() => ({ deny: 'blit failed' }))
        .then(shown => {
          if (shown.deny === undefined) {
            channel.shown = text
            channel.misses = 0
          } else if ((channel.misses += 1) >= MAX_MISSES) channels.delete(site)
        }))
    }
    await Promise.all(blits)
    // A finished flash leaves its row: redraw so the bar goes.
    if (hasLanded) $.ui.invalidate('ui.render')
  } finally {
    // A throw must not leave every later tick skipping.
    isPainting = false
    if (casts.size === 0 && channels.size === 0) {
      ticker?.cancel()
      ticker = undefined
    }
  }
}

function ensureTicker($: EngineInterface) {
  ticker ??= $.clock.every(TICK_MS, () => void paint($))
}

// Off the terminal the bar animates itself: a row charges until its call lands, flashes once, then goes.
type DrawnCast = { color: number; landing?: Landing; damage?: number }
const drawnCasts = new Map<string, DrawnCast>()
export const FLASH_MS = FLASH_TICKS * TICK_MS
const CHARGE_MS = CHARGE_TICKS * TICK_MS
const PULSE_MS = PULSE_TICKS * TICK_MS

const castFor = ($: EngineInterface, props: { tool_use_id: string; tool: string; isRunning: boolean; isErrored: boolean; isInterrupted: boolean; output?: unknown }) => {
  const id = props.tool_use_id
  let cast = drawnCasts.get(id)
  if (props.isRunning && cast === undefined && !landed.has(id)) {
    cast = { color: skillColor(props.tool) }
    drawnCasts.set(id, cast)
  } else if (!props.isRunning && cast !== undefined && cast.landing === undefined) {
    cast.landing = landingOf(props)
    cast.damage = damageOf(props.output)
    $.clock.after(FLASH_MS, () => {
      drawnCasts.delete(id)
      landed.add(id)
      $.ui.invalidate('ui.render')
    })
  }
  return cast
}

export const register: Register = on => {
  // ToolResult carries no isInterrupted: remember the fled calls from their ToolUse rows.
  const fled = new Set<string>()

  on('ui.render', { component: 'ToolUse' }, async ($, e, next) => {
    const drawn = await next(e)
    const id = e.props.tool_use_id
    if (e.props.isInterrupted) fled.add(id)
    if (e.props.isRunning && !castStarts.has(id)) castStarts.set(id, await $.clock.now())
    if (!e.props.isRunning) castStarts.delete(id)
    if (e.surface !== 'terminal') {
      const drawnCast = castFor($, e.props)
      const { Box, Text, Svg } = $.ui.resolve(e)
      return (
        <Box flexDirection="row">
          <Text>{`${rowIcon(e.props)} `}</Text>
          <Box flexGrow={1} flexDirection="column">
            {drawn}
            {drawnCast && (
              <Box flexDirection="row" alignItems="center" marginLeft={2}>
                <Svg
                  key="cast"
                  source={
                    drawnCast.landing === undefined
                      ? chargeSvg(drawnCast.color, CAST_COLUMNS, CHARGE_MS, PULSE_MS)
                      : flashSvg(drawnCast.landing, drawnCast.color, CAST_COLUMNS, FLASH_MS)
                  }
                  alt={drawnCast.landing === undefined ? 'casting' : landingText(drawnCast.landing, drawnCast.damage).text.trim()}
                  {...castSize(CAST_COLUMNS)}
                  isInteractive
                />
                {drawnCast.landing === undefined ? (
                  <Text dimColor>{' casting…'}</Text>
                ) : (
                  landingLabel(Text, landingText(drawnCast.landing, drawnCast.damage))
                )}
              </Box>
            )}
          </Box>
        </Box>
      )
    }

    let cast = casts.get(id)
    if (e.props.isRunning && cast === undefined && !landed.has(id)) {
      cast = { color: skillColor(e.props.tool), tick: 0, misses: 0 }
      casts.set(id, cast)
    } else if (!e.props.isRunning && cast !== undefined && cast.landing === undefined) {
      cast.landing = landingOf(e.props)
      cast.damage = damageOf(e.props.output)
      cast.tick = 0
    }
    if (cast !== undefined) ensureTicker($)

    const { Box, Text, Raster } = $.ui.resolve(e)
    const bar = cast === undefined ? null : (
      <Box flexDirection="row" marginLeft={2}>
        <Raster key="cast" columns={CAST_COLUMNS} rows={1} cells={frame(cast)} />
        {cast.landing === undefined
          ? <Text dimColor>{' casting…'}</Text>
          : landingLabel(Text, landingText(cast.landing, cast.damage))}
      </Box>
    )
    return (
      <Box flexDirection="row">
        <Box marginTop={gutterTop(e.surface)}><Text>{`${rowIcon(e.props)} `}</Text></Box>
        <Box flexGrow={1} flexDirection="column">{drawn}{bar}</Box>
      </Box>
    )
  })

  // A call running long enough to offer the background channels: its seconds tick by beside the engine's hint.
  on('ui.render', { component: 'ToolProgress' }, async ($, e, next) => {
    if (e.props.kind !== 'background_hint') return next(e)
    const id = e.props.tool_use_id
    const now = await $.clock.now()
    const hint = e.props.hint.replace(/^\((.*)\)$/, '$1')
    const rest = hint === '' ? '' : ` · ${hint}`
    if (e.surface !== 'terminal') {
      const { Box, Text } = $.ui.resolve(e)
      return (
        <Box flexDirection="row" marginLeft={2}>
          <Text color="warning" bold>⌛ Channeling…</Text>
          <Text dimColor wrap="truncate">{rest}</Text>
        </Box>
      )
    }
    const text = channelText(now - (castStarts.get(id) ?? now))
    channels.set(e.requestId, { toolUseId: id, shown: text, misses: 0 })
    ensureTicker($)
    const { Box, Text, Raster } = $.ui.resolve(e)
    return (
      <Box flexDirection="row" marginLeft={2}>
        <Text color="warning" bold>⌛ Channeling</Text>
        <Raster key="channel" columns={CHANNEL_COLUMNS} rows={1} cells={channelCells(text)} />
        <Text dimColor wrap="truncate">{rest}</Text>
      </Box>
    )
  })

  on('ui.render', { component: 'ToolResult' }, async ($, e, next) => {
    const drawn = await next(e)
    if (!e.props.isErrored || fled.has(e.props.tool_use_id)) return drawn
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
    if (e.props.isExpanded) return drawn
    const combo = comboLabel(e.props.calls.length)
    const { Box, Text } = $.ui.resolve(e)
    return (
      <Box flexDirection="row">
        <Box marginTop={gutterTop(e.surface)}><Text>{`${groupIcon(e.props.calls)} `}</Text></Box>
        <Box flexGrow={1} flexDirection="column">{drawn}</Box>
        {/* The label keeps its width; only the drawn row shrinks, so the combo never wraps. */}
        {combo === undefined ? null : <Box flexShrink={0} marginTop={gutterTop(e.surface)}><Text color={comboColor(e.props.calls.length)} bold wrap="truncate">{combo}</Text></Box>}
      </Box>
    )
  })
}
