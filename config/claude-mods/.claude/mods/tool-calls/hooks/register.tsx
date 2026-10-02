import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, Timer } from 'claude-code'

import type { ToolCall, ToolCallStatus } from '../types'
import { HERO_FRAMES } from './hero-cells'

const HERO_CELLS = { columns: HERO_FRAMES.columns, rows: HERO_FRAMES.rows }

const PANE = 'tool-calls'
const calls = atom({ plugin: 'tool-calls', key: 'calls' } as const, [])
// Rows scrolled down the newest-first log; the header above it never scrolls.
const logOffset = atom({ plugin: 'tool-calls', key: 'logOffset' } as const, 0)

// Hero beside the stats needs the portrait plus this much room for them.
const STATS_COLUMNS = 28
// Title, rule, level, blank, HP, blank, XP, rule, status, fizzles.
const STATS_ROWS = 10
const HEADER_TOP_ROWS = 1
// The stats text's width when it sits beside the hero.
const STATS_WIDTH = 28
// The accent line and the column after it, left of the stats text.
const ACCENT_COLUMNS = 2
// Columns between the hero and the accent line.
const HERO_GAP = 2

const RANKS: readonly (readonly [number, string])[] = [
  [10, 'Grand Wizard'],
  [7, 'Archmage'],
  [5, 'Sorcerer'],
  [3, 'Adept'],
  [1, 'Apprentice'],
]

export const rankFor = (level: number): string =>
  RANKS.find(([from]) => level >= from)?.[1] ?? 'Apprentice'
// '✦ casting ' before the running tool's name.
const CASTING_LABEL = 10
// Fixed log columns; the summary takes what is left.
// The tool column fits 'AskUserQuestion' whole; longer names (MCP tools) are cut.
const LOG_COLUMNS = { mark: 2, tool: 17, time: 7 }
// The log's title row and the rule under it.
const LOG_CHROME_ROWS = 2
// The log's padding column on each side.
const LOG_PADDING = 1
// The ornament row between the wizard and the log.
const DIVIDER_ROWS = 1
// ' ✧ ⋆ ✦ ⋆ ✧ ' at the divider's centre.
const DIVIDER_CENTER = 11

// The heavy rule either side of the divider's stars, filling `width`.
export const dividerSides = (width: number) => {
  const room = Math.max(0, width - DIVIDER_CENTER)
  const left = Math.floor(room / 2)
  return { left: '━'.repeat(left), right: '━'.repeat(room - left) }
}
const HEARTS = 5
const HP_WINDOW = 10
const CALLS_PER_LEVEL = 10
// Cells across the HP and XP bars.
const BAR_WIDTH = 16

// How many of a bar's cells are filled for `value` out of `max`.
export const barFill = (value: number, max: number): number =>
  Math.round((Math.max(0, Math.min(value, max)) / max) * BAR_WIDTH)
const SUMMARY_KEYS = ['file_path', 'command', 'pattern', 'url', 'query', 'description']

const TOOL_COLORS: Record<string, string> = {
  Read: 'cyan',
  Edit: 'yellow',
  Write: 'yellow',
  Bash: 'magenta',
  Grep: 'blue',
  Glob: 'blue',
  Agent: 'green',
}

const STATUS_MARKS: Record<ToolCallStatus, { glyph: string; color: string }> = {
  run: { glyph: '✦', color: 'yellow' },
  ok: { glyph: '✓', color: 'green' },
  err: { glyph: '✗', color: 'red' },
}

// Pick the most telling input field; file paths shrink to their basename.
const summarize = (input: object): string => {
  const fields = input as Record<string, unknown>
  for (const key of SUMMARY_KEYS) {
    const value = fields[key]
    if (typeof value === 'string' && value.length > 0) {
      return key === 'file_path' ? (value.split('/').pop() ?? value) : value
    }
  }
  return ''
}

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

// Collapse whitespace (multi-line commands) and cut the middle so a row never wraps.
export const oneLine = (text: string, max: number): string => {
  const flat = text.replace(/\s+/g, ' ').trim()
  if (max <= 0) return ''
  if (flat.length <= max) return flat
  if (max === 1) return '…'
  const head = Math.ceil((max - 1) / 2)
  return `${flat.slice(0, head)}…${flat.slice(flat.length - (max - 1 - head))}`
}

export type Mood = 'idle' | 'cast' | 'hurt'

const FRAME_MS = 100
// Ticks each frame of a mood stays on screen.
const FRAME_TICKS: Record<Mood, number> = { idle: 5, cast: 2, hurt: 3 }
// The smoke puff plays once through after a failed call.
export const HURT_MS = FRAME_MS * FRAME_TICKS.hurt * HERO_FRAMES.hurt.length

export const pickMood = (running: number, hurtLeftMs: number): Mood => {
  if (hurtLeftMs > 0) return 'hurt'
  return running > 0 ? 'cast' : 'idle'
}

// `tick` counts from the moment the mood began.
export const pickFrame = (mood: Mood, tick: number): string => {
  const frames = HERO_FRAMES[mood]
  const frame = frames[Math.floor(tick / FRAME_TICKS[mood]) % frames.length]
  if (frame === undefined) throw new Error(`no ${mood} frames in hero-cells.ts`)
  return frame
}

// Clamp the scroll position so the last window is still full.
export const clampOffset = (offset: number, total: number, logRows: number): number =>
  Math.max(0, Math.min(offset, total - logRows))

const formatMs = (ms?: number): string => {
  if (ms === undefined) return '…'
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`
}

// The wizard's animation: runs while the pane's Raster takes blits, stops once it refuses.
// Module state, so a reload starts it over.
const anim = {
  running: 0,
  hurtUntil: 0,
  ticker: undefined as Timer | undefined,
  mood: 'idle' as Mood,
  moodTick: 0,
  shownCells: pickFrame('idle', 0),
}

async function paint($: EngineInterface) {
  const now = await $.clock.now()
  const nextMood = pickMood(anim.running, anim.hurtUntil - now)
  if (nextMood === anim.mood) {
    anim.moodTick += 1
  } else {
    anim.mood = nextMood
    anim.moodTick = 0
  }
  const cells = pickFrame(anim.mood, anim.moodTick)
  if (cells === anim.shownCells) return

  // A refusal and a failed blit both mean nothing of ours is on screen to paint.
  const done = await $.ui
    .blit({ requestId: PANE, key: 'hero', cells, ...HERO_CELLS })
    .catch(() => ({ deny: 'blit failed' }))
  if (done.deny !== undefined) {
    // Closed pane, or not mounted yet: the next draw starts the clock again.
    anim.ticker?.cancel()
    anim.ticker = undefined
    return
  }
  anim.shownCells = cells
}

export const register: Register = on => {
  // The last drawn log window; scrolling clamps against it.
  let layout = { logRows: 1, total: 0, ownsScroll: false }

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'tool-calls',
      description: 'Open the wizard\'s spell book of tool calls',
    })
    void $.ui.open({ id: PANE, title: 'Spell book' })

    return next(e)
  })

  on('command.run', { command: 'tool-calls' }, async $ => {
    await $.ui.open({ id: PANE, title: 'Spell book' })

    return { text: 'Spell book opened.' }
  })

  on('tool.call', async ($, e, next) => {
    const startedAt = await $.clock.now()
    const call: ToolCall = {
      id: e.tool_use_id,
      tool: e.tool,
      summary: summarize(e),
      startedAt,
      status: 'run',
    }
    await update($, calls, list => [...list, call].slice(-200))
    anim.running += 1
    let ran: Awaited<ReturnType<typeof next>>
    try {
      ran = await next(e)
    } finally {
      anim.running -= 1
    }
    const endedAt = await $.clock.now()
    const ms = Math.round(endedAt - startedAt)
    const status: ToolCallStatus = 'deny' in ran || ran.isError ? 'err' : 'ok'
    if (status === 'err') {
      anim.hurtUntil = endedAt + HURT_MS
    }
    await update($, calls, list =>
      list.map(one => (one.id === call.id ? { ...normalizeCall(one), ms, status } : one)),
    )

    return ran
  })

  // The pane's tree always fits its body, so the engine has nothing to scroll:
  // the wheel and scroll keys move the log window instead.
  on('ui.scroll', { component: 'Pane', requestId: PANE }, async ($, e, next) => {
    if (!layout.ownsScroll) {
      return next(e)
    }
    await update($, logOffset, offset => clampOffset(offset + e.by, layout.total, layout.logRows))

    return {}
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const list = (await read($, calls)).map(normalizeCall)
    const { level, xp, hp } = heroStats(list)
    const current = list.findLast(call => call.status === 'run')
    const width = e.props.bodyColumns
    const isSideBySide = width >= HERO_CELLS.columns + STATS_COLUMNS
    // One blank row above the header keeps it off the pane's top edge.
    const headerRows =
      HEADER_TOP_ROWS +
      (isSideBySide ? Math.max(HERO_CELLS.rows, STATS_ROWS) : HERO_CELLS.rows + STATS_ROWS)
    const roomRows = e.props.scroll.bodyRows - headerRows - DIVIDER_ROWS - LOG_CHROME_ROWS
    // Too short to pin the header: draw a few rows and let the engine scroll it all.
    const logRows = Math.max(3, roomRows)
    const offset = clampOffset(await read($, logOffset), list.length, logRows)
    layout = { logRows, total: list.length, ownsScroll: e.surface === 'terminal' && roomRows >= 3 }
    const newestFirst = list.slice().reverse()
    const shown = newestFirst.slice(offset, offset + logRows)
    const range =
      list.length > logRows ? `${offset + 1}–${offset + shown.length} of ${list.length}` : ''

    if (e.surface === 'terminal') {
      anim.ticker ??= $.clock.every(FRAME_MS, () => void paint($))
      const { Box, Text, Raster } = $.ui.resolve(e)
      const failed = list.filter(call => call.status === 'err').length
      const statsWidth = Math.min(
        STATS_WIDTH,
        width - ACCENT_COLUMNS - (isSideBySide ? HERO_CELLS.columns + HERO_GAP : 0),
      )
      // The stats and the line beside them stand as tall as the hero.
      const statsLines = Math.max(HERO_CELLS.rows, STATS_ROWS)
      const rule = '┈'.repeat(Math.max(0, statsWidth - 1))
      const logInnerWidth = width - LOG_PADDING * 2
      const divider = dividerSides(width)
      const summaryWidth = Math.max(
        0,
        logInnerWidth - LOG_COLUMNS.mark - LOG_COLUMNS.tool - LOG_COLUMNS.time,
      )

      return (
        <Box flexDirection="column" width={width}>
          <Box
            flexDirection={isSideBySide ? 'row' : 'column'}
            justifyContent="flex-start"
            alignItems="flex-start"
            paddingTop={HEADER_TOP_ROWS}
          >
            <Raster key="hero" {...HERO_CELLS} cells={anim.shownCells} />
            <Box marginLeft={isSideBySide ? HERO_GAP : 0}>
              <Box width={ACCENT_COLUMNS} flexDirection="column">
                {Array.from({ length: statsLines }, (_, row) => (
                  <Text key={`accent-${row}`} bold color="magenta">
                    ┃
                  </Text>
                ))}
              </Box>
              <Box flexDirection="column" width={statsWidth} height={statsLines}>
              <Text bold color="magenta">✦ CLAUDE THE WIZARD ✦</Text>
              <Text color="magenta" dimColor>{rule}</Text>
              <Text wrap="truncate">
                <Text bold color="yellow">Lv.{level} </Text>
                <Text italic color="cyan">{rankFor(level)}</Text>
                <Text dimColor> · {list.length} casts</Text>
              </Text>
              <Text> </Text>
              <Text>
                <Text bold color="red">HP </Text>
                <Text color="red">{'█'.repeat(barFill(hp, HEARTS))}</Text>
                <Text dimColor>{'░'.repeat(BAR_WIDTH - barFill(hp, HEARTS))}</Text>
                <Text dimColor> {hp}/{HEARTS}</Text>
              </Text>
              <Text> </Text>
              <Text>
                <Text bold color="blue">XP </Text>
                <Text color="blue">{'█'.repeat(barFill(xp, CALLS_PER_LEVEL))}</Text>
                <Text dimColor>{'░'.repeat(BAR_WIDTH - barFill(xp, CALLS_PER_LEVEL))}</Text>
                <Text dimColor> {xp}/{CALLS_PER_LEVEL}</Text>
              </Text>
              <Text color="magenta" dimColor>{rule}</Text>
              {current ? (
                <Text color="yellow" wrap="truncate">
                  ✦ casting <Text bold>{current.tool}</Text>{' '}
                  <Text dimColor>
                    {oneLine(current.summary, statsWidth - CASTING_LABEL - current.tool.length - 1)}
                  </Text>
                </Text>
              ) : (
                <Text dimColor>☾ meditating in the tower</Text>
              )}
              {failed > 0 ? (
                <Text color="red">✗ {failed} spells fizzled</Text>
              ) : (
                <Text color="green" dimColor>
                  ✓ no spells fizzled
                </Text>
              )}
              </Box>
            </Box>
          </Box>
          <Text wrap="truncate">
            <Text bold color="magenta">{divider.left}</Text>
            <Text color="magenta"> ✧ ⋆ </Text>
            <Text bold color="yellow">✦</Text>
            <Text color="magenta"> ⋆ ✧ </Text>
            <Text bold color="magenta">{divider.right}</Text>
          </Text>
          <Box
            flexDirection="column"
            paddingX={LOG_PADDING}
            width={width}
            height={logRows + LOG_CHROME_ROWS}
          >
            <Box>
              <Box flexGrow={1}>
                <Text bold color="magenta">✦ SPELL BOOK ✦</Text>
              </Box>
              {range !== '' && (
                <Text dimColor wrap="truncate">
                  {offset > 0 ? '↑' : ' '}
                  {offset + logRows < list.length ? '↓' : ' '} {range}
                </Text>
              )}
            </Box>
            <Text color="magenta" dimColor>
              {'┈'.repeat(Math.max(0, logInnerWidth))}
            </Text>
            {list.length === 0 && <Text dimColor>No spells cast yet. The tome awaits.</Text>}
            {shown.map(call => {
              const mark = STATUS_MARKS[call.status]
              return (
                <Box key={call.id} height={1}>
                  <Box width={LOG_COLUMNS.mark}>
                    <Text color={mark.color}>{mark.glyph}</Text>
                  </Box>
                  <Box width={LOG_COLUMNS.tool}>
                    <Text color={TOOL_COLORS[call.tool] ?? 'white'} wrap="truncate">
                      {oneLine(call.tool, LOG_COLUMNS.tool - 1)}
                    </Text>
                  </Box>
                  <Box width={summaryWidth}>
                    <Text dimColor wrap="truncate">
                      {oneLine(call.summary, summaryWidth)}
                    </Text>
                  </Box>
                  <Box width={LOG_COLUMNS.time} justifyContent="flex-end">
                    <Text dimColor={call.status !== 'run'} wrap="truncate">
                      {formatMs(call.ms)}
                    </Text>
                  </Box>
                </Box>
              )
            })}
          </Box>
        </Box>
      )
    }

    // Other surfaces have no Raster: the same stats as text.
    const { Box, Text } = $.ui.resolve(e)
    return (
      <Box flexDirection="column">
        <Text bold>✦ CLAUDE THE WIZARD · Lv. {level} · HP {hp}/{HEARTS}</Text>
        {list.length === 0 && <Text dimColor>No spells cast yet. The tome awaits.</Text>}
        {shown.map(call => (
          <Text key={call.id} wrap="truncate">
            {STATUS_MARKS[call.status].glyph} {call.tool} {oneLine(call.summary, width)} {formatMs(call.ms)}
          </Text>
        ))}
      </Box>
    )
  })
}
