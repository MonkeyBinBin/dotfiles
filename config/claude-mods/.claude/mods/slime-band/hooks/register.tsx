import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, Timer } from 'claude-code'

import type { BandInfo } from '../types'
import { SLIME_FRAMES, SLIME_PALETTE, SLIME_ROWS, SLIME_WIDTH } from './slime-sprite'
import type { SlimePose } from './slime-sprite'
import { layoutHud } from './hud'
import type { HudFact, HudPixel } from './hud'

const info = atom({ plugin: 'slime-band', key: 'info' } as const, {
  branch: '',
  dirty: 0,
  lastMs: 0,
  inTokens: 0,
  outTokens: 0,
})

const FRAME_MS = 80
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

// The whole track as Raster cells: the slime at `x`, the HUD's big numbers,
// the rest see-through.
export const composeTrack = (
  trackWidth: number,
  slime: { x: number; dir: 1 | -1; pose: SlimePose; snore: number; alert?: boolean },
  hud: readonly HudPixel[] = [],
): string => {
  const lit = new Map(hud.map(pixel => [pixel.y * trackWidth + pixel.x, pixel.rgb]))
  const colorAt = (col: number, y: number): number | undefined => {
    const floor = floorAt(col, y)
    if (floor !== undefined) return floor
    const spriteCol = col - slime.x
    if (spriteCol >= 0 && spriteCol < SLIME_WIDTH) {
      const sprite = pixelAt(slime.pose, y, spriteCol, slime.dir)
      if (sprite !== undefined) return sprite
    }
    return lit.get(y * trackWidth + col)
  }
  const words = new Uint32Array(trackWidth * TRACK_ROWS * 3)
  for (let row = 0; row < TRACK_ROWS; row += 1) {
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

export const formatTokens = (n: number): string =>
  n < 1000 ? `${n}` : `${(n / 1000).toFixed(1)}k`

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
  requestId: '',
  ticker: undefined as Timer | undefined,
  shown: '',
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
  const cells = composeTrack(slime.trackWidth, { x: slime.x, dir: slime.dir, pose, snore, alert }, slime.hud)
  if (cells === slime.shown) return

  // A refusal and a failed blit both mean the track is not on screen.
  const done = await $.ui
    .blit({ requestId: slime.requestId, key: 'track', cells, columns: slime.trackWidth, rows: TRACK_ROWS })
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

// Only what the person's status line leaves out: it already shows the model,
// the branch and a dirty mark, so the band adds the count of changed files.
// The big numbers need RGB; the labels use the matching named colour.
const FACT_COLORS = {
  yellow: 0xffd23c,
  cyan: 0x56c8dc,
  magenta: 0xc88cff,
  blue: 0x5aa9ff,
  green: 0x5ad27a,
} as const

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
    segments.push(fact('dirty', '✎', `${value.dirty}`, 'changed', 'yellow'))
  }
  segments.push(fact('turns', '↻', `${turns}`, turns === 1 ? 'turn' : 'turns', 'cyan'))
  if (value.lastMs > 0) {
    segments.push(
      fact('last', '◷', `${Math.round(value.lastMs / 1000)}s`, 'last turn', 'magenta'),
      fact('in', '↓', formatTokens(value.inTokens), 'in', 'blue'),
      fact('out', '↑', formatTokens(value.outTokens), 'out', 'green'),
    )
  }
  return segments
}

const SEPARATOR = '  │  '

export const infoLine = (value: BandInfo, turns: number): string =>
  infoSegments(value, turns)
    .map(s => `${s.icon} ${s.value} ${s.label}`)
    .join(SEPARATOR)

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    slime.idleSince = await $.clock.now()
    await refreshGit($).catch(() => undefined)

    return next(e)
  })

  // A permission prompt is about to ask the person; the slime waits with them until that tool is done. A hook
  // beneath that decides leaves no prompt to wait on.
  on('classic.PermissionRequest', async ($, e, next) => {
    const result = await next(e)
    if (result.decision === undefined) {
      slime.waitingFor = e.tool_name
      slime.waitingAgent = e.agent_id
    }
    return result
  })

  // A question to the person waits on them while it is open; a call of the tool a prompt asked about, in the
  // same loop, ends the wait once it has run or been refused.
  on('tool.call', async ($, e, next) => {
    if (e.tool === 'AskUserQuestion') {
      slime.waitingFor = e.tool
      slime.waitingAgent = e.agentId
    }
    try {
      return await next(e)
    } finally {
      if (slime.waitingFor === e.tool && slime.waitingAgent === e.agentId) slime.waitingFor = undefined
    }
  })

  on('prompt.submit', async ($, e, next) => {
    slime.isWorking = true
    slime.waitingFor = undefined

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
    }

    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) {
      return next(e)
    }
    const engine = await next(e)
    const value = await read($, info)

    if (e.surface !== 'terminal') {
      const { Box, Text } = $.ui.resolve(e)
      return (
        <Box flexDirection="column">
          <Text wrap="truncate">◕‿◕ {infoLine(value, await $.session.turns())}</Text>
          {engine}
        </Box>
      )
    }

    const { Box, Text, Raster } = $.ui.resolve(e)
    if (e.props.isWorking && !slime.isWorking) {
      slime.isWorking = true
    }
    const trackWidth = e.props.bodyColumns
    const hud = layoutHud(infoSegments(value, await $.session.turns()), trackWidth)
    slime.trackWidth = trackWidth
    slime.areaWidth = hud.areaWidth
    slime.hud = hud.pixels
    slime.x = Math.min(slime.x, Math.max(0, hud.areaWidth - SLIME_WIDTH))
    slime.requestId = e.requestId
    slime.ticker ??= $.clock.every(FRAME_MS, () => void paint($))
    const pose = slimePose(slime.isWorking, (await $.clock.now()) - slime.idleSince, slime.tick, slime.waitingFor !== undefined)
    slime.shown = composeTrack(trackWidth, { x: slime.x, dir: slime.dir, pose, snore: 0 }, hud.pixels)

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
        <Raster key="track" columns={trackWidth} rows={TRACK_ROWS} cells={slime.shown} />
        {engine}
      </Box>
    )
  })
}
