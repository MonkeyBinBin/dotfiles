import type { EngineInterface, Register, Timer } from 'claude-code'

import { modelOf, runOf, trainSignsOf, trainCells, trainColumnsOf, TRAIN_ROWS } from './train'
import type { TrainModel } from './train'
import { ALARM, clockOf, columnsOf, MOTION, pillsOf, rowCells, ROWS } from './wave'
import type { Motion, Status } from './wave'

// The spinner as three rows: a braille sound wave moving to suit what's going on, the sub, the dive's clock and status pills, in place of the
// engine's star, word and counts (wave.ts). In Herdr's dispatch layout it is four rows instead: this terminal's own train from the track
// map, running down the line (train.ts). The turn's closing line says how it ended, with an icon, and its figures in quiet pills, in the
// layout's inks. Only inside a Herdr app terminal, though only Herdr's branch of 01-env.zsh loads this mod.

const FRAME_MS = 120
const TICKS_TO_LOOK = 4 // how often the status is read again from helm-bridge
const MAX_MISSES = 8 // refused blits in a row before a row counts as gone: one can be refused on the way to a redraw
const SAME_TURN_MS = 2000 // how far a closing line's duration can be from what turn.complete said
const SPACER_ROWS = 1 // the engine's spinner opens with a blank row
const CLOCK_ICON = '\uf017'
const FILE_ICON = '\uf15b'
const LEFT_CAP = '\ue0b6'
const RIGHT_CAP = '\ue0b4'
// themes/sub.json's: its raised surface for the pills, as these stay in the transcript and shouldn't shout.
// `arrived` is how a turn that got there ends: home at anchor.
const INK = { pill: '#173b42', text: '#a8e8c4', dim: '#5a8a8c', gold: '#f0d07a', added: '#5cff9a', removed: '#ff9a8a', arrived: '\uf13d' }
// themes/dispatch.json's: the board's dark flap and cream lettering, its signal colours; a train arrives under the chequered flag.
export const DISPATCH_INK = { pill: '#1b2025', text: '#f2ead8', dim: '#8a8476', gold: '#ffb03a', added: '#5cf08a', removed: '#ff4a3a', arrived: '\uf11e' }
type Ink = typeof INK
// Which layout the Herdr app shows: shared state it keeps in this file, `layout` its name, `dispatch.trains` each terminal's train.
const HERDR_SHARED = '.config/herdr-app/shared.json'

export type Tally = { files: Set<string>; added: number; removed: number; costAtStart: number | undefined }

const lines = (text: unknown) => (typeof text === 'string' && text.length > 0 ? text.split('\n').length : 0)

// Lines an edit touched, from what the call asked for: a full rewrite counts as all added, as what it replaced isn't known.
export function countEdit(tally: Tally, e: Record<string, unknown>) {
  const path = e.file_path ?? e.notebook_path
  if (typeof path === 'string') tally.files.add(path)
  tally.added += lines(e.new_string) + lines(e.content)
  tally.removed += lines(e.old_string)
  for (const edit of Array.isArray(e.edits) ? (e.edits as Record<string, unknown>[]) : []) {
    tally.added += lines(edit.new_string)
    tally.removed += lines(edit.old_string)
  }
}

export type Figures = { files: number; added: number; removed: number; spent: number; ended: string }

// How the turn ended, as an icon and its ink: home safe at anchor, stopped by the person, or something went wrong.
// On the dispatch board a train that got there arrives under the chequered flag rather than at anchor.
export function endingOf(ended: string | undefined, ink: Ink = INK): [string, string] {
  if (ended === 'aborted') return ['\uf256', ink.dim]
  if (ended === 'refusal') return ['\uf05e', ink.removed]
  if (ended === 'error') return ['\uf071', ink.removed]
  return [ink.arrived, ink.gold]
}

export function figuresOf(tally: Tally, cost: number | undefined, ended = 'answer'): Figures {
  const spent = cost === undefined || tally.costAtStart === undefined ? 0 : cost - tally.costAtStart
  return { files: tally.files.size, added: tally.added, removed: tally.removed, spent: spent >= 0.005 ? spent : 0, ended }
}

// A turn's pills, as [text, ink]: how long it took, then only what it did. Segments of one pill are side by side.
export function closingPills(durationMs: number, figures: Figures | undefined, ink: Ink = INK): [string, string][][] {
  const pills: [string, string][][] = [[[`${CLOCK_ICON} ${clockOf(durationMs)}`, ink.text]]]
  if (figures && figures.files > 0) pills.push([[`${FILE_ICON} ${figures.files}`, ink.text]])
  if (figures && figures.added + figures.removed > 0) pills.push([[`+${figures.added}`, ink.added], [' ', ink.text], [`−${figures.removed}`, ink.removed]])
  if (figures && figures.spent > 0) pills.push([[`$${figures.spent.toFixed(2)}`, ink.gold]])
  return pills
}

// What the spinner draws: the sub's wave, or in the dispatch layout this terminal's train.
export type Scene = { kind: 'sub' } | { kind: 'train'; model: TrainModel }

/** The scene for the Herdr app's shared state (shared.json's text) and this terminal's address. */
export function sceneOf(sharedText: string, terminal: string): Scene {
  const shared = JSON.parse(sharedText) as Record<string, unknown>
  return shared.layout === 'dispatch' ? { kind: 'train', model: modelOf(shared['dispatch.trains'], terminal) } : { kind: 'sub' }
}

const EDITS = new Set(['Edit', 'MultiEdit', 'Write', 'NotebookEdit'])

let inHerdr: boolean | undefined
let isCompacting = false
let tally: Tally = { files: new Set(), added: 0, removed: 0, costAtStart: undefined }
// What the closing line of the turn that just ended adds, until that line first draws; then what each line drew. A line's only
// tie to its turn is the duration, and without it an older line drawn now would take these figures.
// A closing line keeps the inks of the layout its turn ran in, so a later switch of layout doesn't repaint it.
let pending: { figures: Figures; durationMs: number; ink: Ink } | undefined
const tails = new Map<string, { figures: Figures; ink: Ink }>()
// the spinner rows on screen: how each one moves, and how far its train has come
const rows = new Map<string, { motion: Motion; misses: number; travelled: number }>()
let ticker: Timer | undefined
let tick = 0
let diveStart = 0
let now = 0
let status: Status = { op: '', hull: 0, o2: 0, fuel: 0 }
let isSos = false
let drawnIcons = ''
let scene: Scene = { kind: 'sub' }
let terminal: string | null = null
let home: string | undefined

// Which layout is up, read again with the bridge so a switch of layout shows within a look; a read that fails (the app
// rewriting the file, or no app) keeps the last scene.
async function lookAtHerdr($: EngineInterface) {
  if (!terminal) return
  home ??= await $.env.get('HOME').catch(() => undefined)
  if (!home) return
  const text = await $.fs.read(`${home}/${HERDR_SHARED}`).catch(() => undefined)
  if (typeof text !== 'string') return
  try {
    scene = sceneOf(text, terminal)
  } catch {
    // half-written: keep the last scene
  }
}

const shownOf = () => JSON.stringify([scene, scene.kind === 'train' ? trainSignsOf(status) : pillsOf(status), isSos])
const sizeOf = () => (scene.kind === 'train' ? { columns: trainColumnsOf(status), rows: TRAIN_ROWS } : { columns: columnsOf(status), rows: ROWS })
const runNow = (motion: Motion) => runOf(motion, isSos || motion === ALARM)
const inkNow = (): Ink => (scene.kind === 'train' ? DISPATCH_INK : INK)
function cellsOf(motion: Motion, travelled: number) {
  return scene.kind === 'train'
    ? trainCells(scene.model, runNow(motion), tick, travelled, now - diveStart, status)
    : rowCells(isSos ? ALARM : motion, tick, now - diveStart, status)
}
const rasterKey = () => (scene.kind === 'train' ? 'helm-train' : 'helm-wave')

// Another plugin's state is read-only, and absent where that mod isn't loaded.
async function lookAtBridge($: EngineInterface) {
  const [live, sos] = await Promise.all([
    $.state.get({ plugin: 'helm-bridge', key: 'live' } as never).catch(() => undefined),
    $.state.get({ plugin: 'helm-bridge', key: 'sos' } as never).catch(() => undefined),
    lookAtHerdr($),
  ])
  if (live?.value) status = live.value as Status
  isSos = Boolean(sos?.value)
  now = await $.clock.now()
  // The row grows with its pills, and a blit can't resize it: a change of pills, or of layout, is a redraw.
  const shown = shownOf()
  if (shown !== drawnIcons) {
    drawnIcons = shown
    $.ui.invalidate('ui.render')
  }
}

function animate($: EngineInterface) {
  tick += 1
  // nothing on screen, nothing to look at: the ticker outlives the spinner
  if (tick % TICKS_TO_LOOK === 0 && rows.size > 0) void lookAtBridge($).catch(() => undefined)
  for (const [requestId, row] of rows) {
    row.travelled += runNow(row.motion).speed
    const missed = () => {
      row.misses += 1
      if (row.misses >= MAX_MISSES && rows.get(requestId) === row) rows.delete(requestId)
    }
    void $.ui
      .blit({ requestId, key: rasterKey(), cells: cellsOf(row.motion, row.travelled), ...sizeOf() })
      .then(shown => {
        if (shown.deny === undefined) row.misses = 0
        else missed()
      })
      .catch(missed)
  }
}

async function herdr($: EngineInterface) {
  if (inHerdr === undefined) {
    terminal = (await $.env.get('HC_TERMINAL_ID').catch(() => undefined)) || null
    inHerdr = Boolean(terminal)
  }
  return inHerdr
}

const costNow = async ($: EngineInterface) => (await $.session.usage().catch(() => undefined))?.cost?.usd

export const register: Register = on => {
  on('turn.start', async ($, e, next) => {
    if (e.agentId === undefined && (await herdr($))) {
      diveStart = await $.clock.now()
      now = diveStart
      tally = { files: new Set(), added: 0, removed: 0, costAtStart: await costNow($) }
    }
    return next(e)
  })

  on('tool.call', async ($, e, next) => {
    const ran = await next(e)
    if (e.agentId === undefined && EDITS.has(e.tool) && ran.deny === undefined && ran.isError !== true && (await herdr($)))
      countEdit(tally, e as unknown as Record<string, unknown>)
    return ran
  })

  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    if (e.agentId === undefined && (await herdr($))) pending = { figures: figuresOf(tally, await costNow($), e.reason), durationMs: e.durationMs, ink: inkNow() }
    return result
  })

  // A compaction blows the ballast. Not a precompute, which ends nothing, nor a subagent's own.
  on('session.compact', async ($, e, next) => {
    const isOurs = e.trigger !== 'precompute' && e.agentId === undefined
    if (isOurs) isCompacting = true
    try {
      return await next(e)
    } finally {
      if (isOurs) isCompacting = false
    }
  })

  on('ui.render', { component: 'Spinner' }, async ($, e, next) => {
    if (e.surface !== 'terminal' || !(await herdr($))) return next(e)
    const motion = isCompacting ? ALARM : MOTION[e.props.mode]
    rows.set(e.requestId, { motion, misses: 0, travelled: rows.get(e.requestId)?.travelled ?? 0 })
    await lookAtBridge($).catch(() => undefined)
    ticker ??= $.clock.every(FRAME_MS, () => animate($))
    drawnIcons = shownOf()
    const { columns, rows: height } = sizeOf()
    const { Box, Raster } = $.ui.resolve(e)
    return (
      <Box marginTop={SPACER_ROWS}>
        <Raster key={rasterKey()} columns={columns} rows={height} cells={cellsOf(motion, rows.get(e.requestId)!.travelled)} />
      </Box>
    )
  })

  // A line waiting on background agents still has that to say.
  on('ui.render', { component: 'TurnDuration' }, async ($, e, next) => {
    if (!(await herdr($)) || e.surface !== 'terminal' || e.props.waitingFor || e.props.isExpanded) return next(e)
    if (pending !== undefined && !tails.has(e.requestId) && Math.abs(e.props.durationMs - pending.durationMs) <= SAME_TURN_MS) {
      tails.set(e.requestId, { figures: pending.figures, ink: pending.ink })
      pending = undefined
    }
    const tail = tails.get(e.requestId)
    const figures = tail?.figures
    const ink = tail?.ink ?? inkNow()
    const [ending, endingInk] = endingOf(figures?.ended, ink)
    const { Box, Text } = $.ui.resolve(e)
    return (
      <Box flexDirection="row" columnGap={1}>
        <Text color={endingInk}>{ending} </Text>
        {closingPills(e.props.durationMs, figures, ink).map((segments, i) => (
          <Box key={`pill-${i}`} flexDirection="row">
            <Text color={ink.pill}>{LEFT_CAP}</Text>
            <Text backgroundColor={ink.pill}> </Text>
            {segments.map(([text, color], j) => (
              <Text key={`segment-${j}`} color={color} backgroundColor={ink.pill}>{text}</Text>
            ))}
            <Text backgroundColor={ink.pill}> </Text>
            <Text color={ink.pill}>{RIGHT_CAP}</Text>
          </Box>
        ))}
      </Box>
    )
  })
}
