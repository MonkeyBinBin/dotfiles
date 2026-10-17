import { atom, read, update } from 'claude-code'
import type { ElementTable, EngineInterface, Register, Timer } from 'claude-code'

import type { BandInfo, ContextInfo } from '../types'
import { layoutGauge, manaLevel } from './context-bar'
import { TUBE_ROWS, TUBE_TICKS, groundPixels, groundSvg } from './mana-tube'
import type { ContextGauge } from './context-bar'
import { SLIME_FRAMES, SLIME_PALETTE, SLIME_ROWS, SLIME_WIDTH } from './slime-sprite'
import type { SlimePose } from './slime-sprite'
import { formatTokens, layoutHud } from './hud'
import type { HudFact, HudPixel } from './hud'
import { sceneSize, sceneSvg, sceneWidth, walkAt } from './desktop'
import { SHIMMER_TICKS, bannerFor, readMoments } from './banner'
import type { Banner } from './banner'
import type { SceneSlime } from './desktop'

const info = atom({ plugin: 'slime-band', key: 'info' } as const, {
  branch: '',
  dirty: 0,
  lastMs: 0,
  inTokens: 0,
  outTokens: 0,
})

const EMPTY_CONTEXT: ContextInfo = { slices: [], total: 0, max: 0, percent: 0 }
const contextInfo = atom({ plugin: 'slime-band', key: 'context' } as const, EMPTY_CONTEXT)

const FRAME_MS = 80
// The desktop tube: CSS pixels per tube pixel, a band column's CSS width, and how long each ripple step holds.
const TUBE_FRAME_MS = FRAME_MS * TUBE_TICKS
// Ticks each hop frame (squash, stretch) stays up.
const RUN_TICKS = 3
// How long the slime sits after a turn before it naps.
export const NAP_AFTER_MS = 20_000
// Ticks each 'z Z' frame of the nap stays up.
const SNORE_TICKS = 10

const UPPER_HALF = 0x2580
const LOWER_HALF = 0x2584
const SPACE = 0x20
const DEFAULT_COLOR = 0x01000000
const SNORE_COLOR = 0xc8d2ff
const ALERT_COLOR = 0xffd23c
const SWEAT_COLOR = 0x7ad0ff
// Ticks the '!' stays lit, then dark, while the slime waits on the person.
const ALERT_TICKS = 5

// The track: the slime's six pixel rows, then a grass row and a soil row.
export const TRACK_ROWS = SLIME_ROWS + 1
const GRASS_Y = SLIME_ROWS * 2
const GRASS = [0x4caf50, 0x66bb6a, 0x4caf50, 0x81c784]
const SOIL = [0x8d5a2b, 0x8d5a2b, 0x6d4220, 0x8d5a2b, 0x7a4b24]

// A fixed pattern by column, so the floor stays still while the slime moves.
export const floorAt = (col: number, y: number): number | undefined => {
  if (y === GRASS_Y) return GRASS[col % GRASS.length]
  if (y === GRASS_Y + 1) return SOIL[(col * 3) % SOIL.length]
  return undefined
}

// Waiting on the person (a permission prompt, a question) it sits up, never hopping or napping.
export const slimePose = (isWorking: boolean, idleMs: number, tick: number, isWaiting = false): SlimePose => {
  if (isWaiting) return 'sit'
  if (isWorking) return Math.floor(tick / RUN_TICKS) % 2 === 0 ? 'run1' : 'run2'
  return idleMs >= NAP_AFTER_MS ? 'sleep' : 'sit'
}

// One step along the track, turning round at either end.
export const stepSlime = (x: number, dir: 1 | -1, trackWidth: number) => {
  const last = Math.max(0, trackWidth - SLIME_WIDTH)
  const next = x + dir
  if (next < 0) return { x: Math.min(1, last), dir: 1 as const }
  if (next > last) return { x: Math.max(0, last - 1), dir: -1 as const }
  return { x: next, dir }
}

const pixelAt = (pose: SlimePose, row: number, col: number, dir: 1 | -1): number | undefined => {
  const line = SLIME_FRAMES[pose][row] ?? ''
  const ch = line[dir === 1 ? col : SLIME_WIDTH - 1 - col] ?? '.'
  return SLIME_PALETTE[ch]
}

// Where the mana nears the rune, embers glow through cracks in the soil under the grass.
const EMBER = 0xff5a3a
const isCrack = (col: number) => (col * 7 + 3) % 13 === 0

// The whole track as Raster cells: the slime at `x`, the HUD's big numbers, the grass and soil, then the
// ground below them (the mana tube set in soil) when there is one; the rest see-through.
export const composeTrack = (
  trackWidth: number,
  slime: { x: number; dir: 1 | -1; pose: SlimePose; snore: number; alert?: boolean; sweat?: boolean; embers?: boolean },
  hud: readonly HudPixel[] = [],
  ground?: readonly (readonly number[])[],
): string => {
  const lit = new Map(hud.map(pixel => [pixel.y * trackWidth + pixel.x, pixel.rgb]))
  const groundTop = GRASS_Y + 2
  const rows = TRACK_ROWS + Math.ceil((ground?.length ?? 0) / 2)
  const colorAt = (col: number, y: number): number | undefined => {
    if (y >= groundTop) return ground?.[y - groundTop]?.[col]
    if (slime.embers === true && y === GRASS_Y + 1 && isCrack(col)) return EMBER
    const floor = floorAt(col, y)
    if (floor !== undefined) return floor
    const spriteCol = col - slime.x
    if (spriteCol >= 0 && spriteCol < SLIME_WIDTH) {
      const sprite = pixelAt(slime.pose, y, spriteCol, slime.dir)
      if (sprite !== undefined) return sprite
    }
    return lit.get(y * trackWidth + col)
  }
  const words = new Uint32Array(trackWidth * rows * 3)
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < trackWidth; col += 1) {
      const at = (row * trackWidth + col) * 3
      const top = colorAt(col, row * 2)
      const bottom = colorAt(col, row * 2 + 1)
      if (top === undefined && bottom === undefined) {
        words.set([SPACE, DEFAULT_COLOR, DEFAULT_COLOR], at)
      } else if (top === undefined) {
        // A default foreground is the text colour, not see-through: paint the lower half.
        words.set([LOWER_HALF, bottom ?? DEFAULT_COLOR, DEFAULT_COLOR], at)
      } else {
        words.set([UPPER_HALF, top, bottom ?? DEFAULT_COLOR], at)
      }
    }
  }
  // While napping, a 'z' then a 'Z' drift up beside its head.
  if (slime.pose === 'sleep' && slime.snore > 0) {
    const col = Math.min(trackWidth - 1, slime.x + (slime.dir === 1 ? SLIME_WIDTH - 2 : 1))
    const glyph = slime.snore === 1 ? 0x7a : 0x5a
    words.set([glyph, SNORE_COLOR, DEFAULT_COLOR], (0 * trackWidth + col) * 3)
  }
  // Low on mana, a drop of sweat beads behind its head.
  if (slime.sweat === true) {
    const col = Math.max(0, Math.min(trackWidth - 1, slime.dir === 1 ? slime.x - 1 : slime.x + SLIME_WIDTH))
    words.set([0x2c, SWEAT_COLOR, DEFAULT_COLOR], (1 * trackWidth + col) * 3)
  }
  // Waiting on the person, a '!' blinks just ahead of its face.
  if (slime.alert === true) {
    const col = Math.max(0, Math.min(trackWidth - 1, slime.dir === 1 ? slime.x + SLIME_WIDTH : slime.x - 1))
    words.set([0x21, ALERT_COLOR, DEFAULT_COLOR], (0 * trackWidth + col) * 3)
  }
  return toBase64(new Uint8Array(words.buffer))
}

// btoa takes a binary string; chunks keep fromCharCode's argument list short.
const toBase64 = (bytes: Uint8Array): string => {
  let binary = ''
  for (let at = 0; at < bytes.length; at += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(at, at + 0x8000))
  }
  return btoa(binary)
}

export { formatTokens }

// Module state, so a reload starts the slime over.
const slime = {
  x: 0,
  dir: 1 as 1 | -1,
  tick: 0,
  isWorking: false,
  idleSince: 0,
  // The tool a permission prompt asks about, or 'AskUserQuestion', while the session waits on the person.
  waitingFor: undefined as string | undefined,
  // The loop that tool runs in: a subagent's id, undefined for the main loop.
  waitingAgent: undefined as string | undefined,
  trackWidth: 0,
  // The columns left of the HUD, where the slime hops.
  areaWidth: 0,
  hud: [] as HudPixel[],
  // While a banner shows: its letters in each colour of its shimmer, taking turns on the terminal.
  shimmer: [] as HudPixel[][],
  // Draws the band again once the banner's moment passes.
  bannerTimer: undefined as Timer | undefined,
  requestId: '',
  ticker: undefined as Timer | undefined,
  shown: '',
  // The context window the ground below the grass shows as a tube of mana; none, and the track ends at the soil.
  mana: undefined as ContextInfo | undefined,
  // The mana near the rune: the slime sweats.
  isManaCritical: false,
  // The surface that last drew the band.
  surface: undefined as string | undefined,
  // On an SVG surface: the lap the scene animates, from where and when it set off.
  walk: undefined as { x: number; dir: 1 | -1; last: number; since: number } | undefined,
  napTimer: undefined as Timer | undefined,
}

// The track's rows: the slime and its floor, and the ground under them while it shows the mana.
const trackRows = () => TRACK_ROWS + (slime.mana === undefined ? 0 : TUBE_ROWS)

// An SVG surface animates the scene itself and is drawn again only when the slime's state changes.
const redraw = ($: EngineInterface) => {
  if (slime.surface !== undefined && slime.surface !== 'terminal') $.ui.invalidate('ui.render')
}

async function paint($: EngineInterface) {
  if (slime.trackWidth === 0) return
  const now = await $.clock.now()
  slime.tick += 1
  const isWaiting = slime.waitingFor !== undefined
  const pose = slimePose(slime.isWorking, now - slime.idleSince, slime.tick, isWaiting)
  const alert = isWaiting && Math.floor(slime.tick / ALERT_TICKS) % 2 === 0
  // The slime only travels while it is in the air.
  if (pose === 'run2') {
    const moved = stepSlime(slime.x, slime.dir, slime.areaWidth)
    slime.x = moved.x
    slime.dir = moved.dir
  }
  const snore = pose === 'sleep' ? Math.floor(slime.tick / SNORE_TICKS) % 3 : 0
  const hud = slime.shimmer.length > 0 ? (slime.shimmer[Math.floor(slime.tick / SHIMMER_TICKS) % slime.shimmer.length] ?? slime.hud) : slime.hud
  // Near the rune the slime sweats and the cracks glow, by turns.
  const danger = slime.isManaCritical && Math.floor(slime.tick / ALERT_TICKS) % 2 === 1
  const ground = slime.mana === undefined ? undefined : groundPixels(slime.mana, slime.trackWidth, slime.tick, slime.isWorking)
  const cells = composeTrack(slime.trackWidth, { x: slime.x, dir: slime.dir, pose, snore, alert, sweat: danger, embers: danger }, hud, ground)
  if (cells === slime.shown) return

  // A refusal and a failed blit both mean the track is not on screen.
  const done = await $.ui
    .blit({ requestId: slime.requestId, key: 'track', cells, columns: slime.trackWidth, rows: trackRows() })
    .catch(() => ({ deny: 'blit failed' }))
  if (done.deny !== undefined) {
    slime.ticker?.cancel()
    slime.ticker = undefined
    slime.shown = ''
    return
  }
  slime.shown = cells
}

async function refreshGit($: EngineInterface) {
  const cwd = await $.session.cwd()
  const branch = await $.process.run(['git', 'branch', '--show-current'], { cwd, timeoutMs: 2000 })
  const status = await $.process.run(['git', 'status', '--porcelain'], { cwd, timeoutMs: 2000 })
  const isRepo = branch.exitCode === 0
  await update($, info, value => ({
    ...value,
    branch: isRepo ? branch.stdout.trim() || '(detached)' : '',
    dirty: isRepo ? status.stdout.split('\n').filter(line => line.trim() !== '').length : 0,
  }))
}

// A local estimate, as /context's summary counts it: no token-count requests.
async function refreshContext($: EngineInterface) {
  const usage = await $.session.usage({ breakdown: 'summary' })
  const breakdown = usage.context.breakdown
  if (breakdown === undefined) return
  await update($, contextInfo, () => ({
    slices: breakdown.categories.map(c => ({ name: c.name, tokens: c.tokens, color: c.color, kind: c.kind })),
    total: breakdown.totalTokens,
    max: breakdown.rawMaxTokens,
    percent: breakdown.percentage,
    compactAt: breakdown.isAutoCompactEnabled ? breakdown.autoCompactThreshold : undefined,
  }))
}

// Only what the person's status line leaves out: it already shows the model,
// the branch and a dirty mark, so the band adds the count of changed files.
// The big numbers need RGB; the labels use the matching named colour.
const FACT_COLORS = {
  yellow: 0xffd23c,
  cyan: 0x56c8dc,
  magenta: 0xc88cff,
  blue: 0x5aa9ff,
  green: 0x5ad27a,
  red: 0xff5f5f,
} as const

// The banner's shimmer: its colour, then a flash of white.
const SHIMMER = 0xffffff

const LABEL_HEX: Record<string, string> = Object.fromEntries(
  Object.entries(FACT_COLORS).map(([name, rgb]) => [name, `#${rgb.toString(16).padStart(6, '0')}`]),
)

const MODE_ALT: Record<SceneSlime['mode'], string> = {
  walk: 'hopping while Claude works',
  sit: 'sitting',
  sleep: 'napping',
  wait: 'waiting on you',
}

const fact = (
  key: string,
  icon: string,
  value: string,
  label: string,
  color: keyof typeof FACT_COLORS,
): HudFact => ({ key, icon, value, label, color, rgb: FACT_COLORS[color] })

export const infoSegments = (value: BandInfo, turns: number): HudFact[] => {
  const segments: HudFact[] = []
  if (value.branch !== '' && value.dirty > 0) {
    segments.push({ ...fact('dirty', '✎', `${value.dirty}`, 'changed', 'yellow'), dropFirst: true })
  }
  segments.push(fact('turns', '↻', `${turns}`, turns === 1 ? 'turn' : 'turns', 'cyan'))
  if (value.lastMs > 0) {
    segments.push(
      // On a narrow band the turn's time goes, after the changed count, before the token counts.
      { ...fact('last', '◷', `${Math.round(value.lastMs / 1000)}s`, 'last turn', 'magenta'), dropFirst: true },
      fact('in', '↓', formatTokens(value.inTokens), 'in', 'blue'),
      fact('out', '↑', formatTokens(value.outTokens), 'out', 'green'),
    )
  }
  return segments
}

// A banner as the band's one fact: the word in big letters, what happened beneath it.
export const bannerFact = (banner: Banner, rgb?: number): HudFact => ({
  ...fact('banner', banner.icon, banner.word, banner.label, banner.color),
  ...(rgb === undefined ? {} : { rgb }),
})

// The facts the band shows now, a banner in their place while one lasts; the band is drawn again when it ends.
async function bandFacts($: EngineInterface, value: BandInfo): Promise<{ facts: HudFact[]; banner?: Banner }> {
  const now = await $.clock.now()
  const banner = bannerFor(await readMoments($), now)
  slime.bannerTimer?.cancel()
  slime.bannerTimer = banner === undefined ? undefined : $.clock.after(banner.until - now, () => $.ui.invalidate('ui.render'))
  if (banner !== undefined) return { facts: [bannerFact(banner)], banner }
  return { facts: infoSegments(value, await $.session.turns()) }
}

const SEPARATOR = '  │  '

export const infoLine = (value: BandInfo, turns: number): string =>
  infoSegments(value, turns)
    .map(s => `${s.icon} ${s.value} ${s.label}`)
    .join(SEPARATOR)


type BandElements = Pick<ElementTable<'terminal'>, 'Box' | 'Text'>

// Under the ground: what the mana is made of, with how full it is at the line's end; a long legend goes on below.
const renderGauge = ({ Box, Text }: BandElements, gauge: ContextGauge) => {
  const legendRow = (row: readonly ContextGauge['legend'][number][]) =>
    row.map((item, i) => (
      <Text key={item.name}>
        {i > 0 ? '  ' : ''}
        {`${item.icon} `}
        <Text color={item.color}>{item.name}</Text>
        <Text dimColor> {item.tokens}</Text>
      </Text>
    ))
  const [first = [], ...rest] = gauge.legendRows
  return [
    <Box key="ctx-info" flexDirection="row" height={1}>
      <Box flexGrow={1}>
        <Text wrap="truncate">{legendRow(first)}</Text>
      </Box>
      {/* The fill keeps its width: the legend gives way, never the numbers. */}
      <Box flexShrink={0} marginLeft={2}>
        <Text wrap="truncate">{fillText(Text, gauge)}</Text>
      </Box>
    </Box>,
    ...rest.map((row, at) => (
      <Text key={`ctx-legend-${at + 1}`} wrap="truncate">
        {legendRow(row)}
      </Text>
    )),
  ]
}

// `45%` in the mana's colour, then what is used out of what.
const fillText = (Text: ElementTable['Text'], gauge: ContextGauge) => {
  const [percent = '', tokens = ''] = gauge.fill.split(' · ')
  return [
    <Text key="fill-percent" color={gauge.percentColor} bold>{percent}</Text>,
    <Text key="fill-tokens" dimColor>{` · ${tokens}`}</Text>,
  ]
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    slime.idleSince = await $.clock.now()
    await refreshGit($).catch(() => undefined)

    return next(e)
  })

  // The engine raises this whenever the window's fill moves: turns, compaction, /clear, a /model switch.
  on('session.measure', async ($, e, next) => {
    const result = await next(e)
    if (e.changed.includes('context')) await refreshContext($).catch(() => undefined)
    return result
  })

  // /clear and resume end this conversation without a session.start: drop its gauge until the next measure.
  on('session.end', async ($, e, next) => {
    await update($, contextInfo, () => EMPTY_CONTEXT)
    return next(e)
  })

  // A permission prompt is about to ask the person; the slime waits with them until that tool is done. A hook
  // beneath that decides leaves no prompt to wait on.
  on('classic.PermissionRequest', async ($, e, next) => {
    const result = await next(e)
    if (result.decision === undefined) {
      slime.waitingFor = e.tool_name
      slime.waitingAgent = e.agent_id
      redraw($)
    }
    return result
  })

  // A question to the person waits on them while it is open; a call of the tool a prompt asked about, in the
  // same loop, ends the wait once it has run or been refused.
  on('tool.call', async ($, e, next) => {
    if (e.tool === 'AskUserQuestion') {
      slime.waitingFor = e.tool
      slime.waitingAgent = e.agentId
      redraw($)
    }
    try {
      return await next(e)
    } finally {
      if (slime.waitingFor === e.tool && slime.waitingAgent === e.agentId) {
        slime.waitingFor = undefined
        redraw($)
      }
    }
  })

  on('prompt.submit', async ($, e, next) => {
    slime.isWorking = true
    slime.waitingFor = undefined
    redraw($)

    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    // A subagent's turn ends inside the main one; only the main turn rests the slime.
    if (e.agentId === undefined) {
      slime.isWorking = false
      slime.waitingFor = undefined
      slime.idleSince = await $.clock.now()
      const usage = e.usage
      await update($, info, value => ({
        ...value,
        lastMs: e.durationMs,
        inTokens: usage ? usage.input_tokens + usage.cache_read_input_tokens : value.inTokens,
        outTokens: usage ? usage.output_tokens : value.outTokens,
      }))
      await refreshGit($).catch(() => undefined)
      redraw($)
    }

    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) {
      return next(e)
    }
    const engine = await next(e)
    const value = await read($, info)
    const context = await read($, contextInfo)

    slime.surface = e.surface
    if (e.surface !== 'terminal') {
      const { Box, Text, Svg } = $.ui.resolve(e)
      const now = await $.clock.now()
      if (e.props.isWorking && !slime.isWorking) slime.isWorking = true
      const segments = (await bandFacts($, value)).facts
      const width = sceneWidth(e.props.bodyColumns)
      const hud = layoutHud(segments, width)
      const last = Math.max(0, hud.areaWidth - SLIME_WIDTH)
      const isWaiting = slime.waitingFor !== undefined
      // A lap that ends (rest, a wait, a resize) leaves the slime where it had hopped to.
      if (slime.walk !== undefined && (!slime.isWorking || isWaiting || slime.walk.last !== last)) {
        const at = walkAt(slime.walk.x, slime.walk.dir, slime.walk.last, now - slime.walk.since)
        slime.x = at.x
        slime.dir = at.dir
        slime.walk = undefined
      }
      slime.x = Math.min(slime.x, last)
      if (slime.isWorking && !isWaiting && slime.walk === undefined) {
        slime.walk = { x: slime.x, dir: slime.dir, last, since: now }
      }
      const idleMs = now - slime.idleSince
      const mode: SceneSlime['mode'] = isWaiting ? 'wait' : slime.walk ? 'walk' : idleMs >= NAP_AFTER_MS ? 'sleep' : 'sit'
      slime.napTimer?.cancel()
      slime.napTimer = mode === 'sit' ? $.clock.after(NAP_AFTER_MS - idleMs, () => $.ui.invalidate('ui.render')) : undefined
      const gauge = layoutGauge(context, e.props.bodyColumns)
      // The ground under the soil shows the mana, a step of its ripple each hop.
      const ground = gauge === undefined ? undefined : { info: context, isWorking: slime.isWorking, frameMs: TUBE_FRAME_MS }
      const scene = sceneSvg(width, hud, { mode, x: slime.walk?.x ?? slime.x, dir: slime.walk?.dir ?? slime.dir, last }, LABEL_HEX, ground)
      const size = sceneSize(width, ground !== undefined)
      const facts = segments.map(s => `${s.icon} ${s.value} ${s.label}`).join(', ')

      return (
        <Box flexDirection="column">
          <Svg
            key="track"
            source={scene}
            alt={`Slime ${MODE_ALT[mode]}. ${facts}${gauge === undefined ? '' : `. Mana ${gauge.fill}`}`}
            width={size.width}
            height={size.height}
            isInteractive
          />
          {gauge && (
            <Box flexDirection="column">
              <Box flexDirection="row" justifyContent="space-between" columnGap={2}>
                <Box flexDirection="row" flexWrap="wrap" columnGap={2} flexShrink={1}>
                  {gauge.legend.map(item => (
                    <Text key={item.name}>
                      {`${item.icon} `}
                      <Text color={item.color}>{item.name}</Text>
                      <Text dimColor> {item.tokens}</Text>
                    </Text>
                  ))}
                </Box>
                <Box flexShrink={0}>
                  <Text>{fillText(Text, gauge)}</Text>
                </Box>
              </Box>
            </Box>
          )}
          {engine}
        </Box>
      )
    }

    const { Box, Text, Raster } = $.ui.resolve(e)
    if (e.props.isWorking && !slime.isWorking) {
      slime.isWorking = true
    }
    const trackWidth = e.props.bodyColumns
    const gauge = layoutGauge(context, trackWidth)
    // The ground animates with the slime's ticker, in step with its hops; its first frame is drawn here.
    slime.mana = gauge === undefined ? undefined : context
    slime.isManaCritical = gauge !== undefined && manaLevel(context) === 'critical'
    let band = await bandFacts($, value)
    let hud = layoutHud(band.facts, trackWidth)
    // A band too narrow for the banner keeps its facts.
    if (band.banner !== undefined && hud.pixels.length === 0) {
      band = { facts: infoSegments(value, await $.session.turns()) }
      hud = layoutHud(band.facts, trackWidth)
    }
    slime.trackWidth = trackWidth
    slime.areaWidth = hud.areaWidth
    slime.hud = hud.pixels
    slime.shimmer = band.banner === undefined ? [] : [hud.pixels, layoutHud([bannerFact(band.banner, SHIMMER)], trackWidth).pixels]
    slime.x = Math.min(slime.x, Math.max(0, hud.areaWidth - SLIME_WIDTH))
    slime.requestId = e.requestId
    slime.ticker ??= $.clock.every(FRAME_MS, () => void paint($))
    const pose = slimePose(slime.isWorking, (await $.clock.now()) - slime.idleSince, slime.tick, slime.waitingFor !== undefined)
    const ground = slime.mana === undefined ? undefined : groundPixels(slime.mana, trackWidth, slime.tick, slime.isWorking)
    slime.shown = composeTrack(trackWidth, { x: slime.x, dir: slime.dir, pose, snore: 0 }, hud.pixels, ground)

    // Each label sits centred over its big number.
    let cursor = 0
    const labelPieces = hud.labels.map(label => {
      const length = [...label.text].length
      const start = label.x + Math.floor((label.width - length) / 2)
      const pad = ' '.repeat(Math.max(0, start - cursor))
      cursor = start + length
      return (
        <Text key={label.text}>
          {pad}
          <Text color={label.color}>{label.text}</Text>
        </Text>
      )
    })

    return (
      <Box flexDirection="column">
        <Text wrap="truncate">{labelPieces}</Text>
        <Raster key="track" columns={trackWidth} rows={trackRows()} cells={slime.shown} />
        {gauge && renderGauge({ Box, Text }, gauge)}
        {engine}
      </Box>
    )
  })
}
