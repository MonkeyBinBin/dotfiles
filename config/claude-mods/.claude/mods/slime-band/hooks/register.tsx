import { atom, read, update } from 'claude-code'
import type { ElementTable, EngineInterface, Register, Timer } from 'claude-code'

import type { BandInfo, ContextInfo } from '../types'
import { layoutGauge, manaLevel } from './context-bar'
import { TUBE_ROWS, TUBE_TICKS, groundPixels, groundSvg } from './mana-tube'
import type { ContextGauge } from './context-bar'
import { SLIME_FRAMES, SLIME_PALETTE, SLIME_ROWS, SLIME_WIDTH } from './slime-sprite'
import type { SlimePose } from './slime-sprite'
import { dropIn, formatTokens, glintAt, glintLine, layoutHud, mixToward, rollValue } from './hud'
import type { HudFact, HudPixel } from './hud'
import { CAST_MS, sceneSize, sceneSvg, sceneWidth, walkAt } from './desktop'
import { bannerFor, readMoments } from './banner'
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
// The hop, and the ticks each of its frames stays up: a crouch, the leap (a shadow on the grass under it), the
// landing (a puff of dust either side), standing round again.
const HOP: ReadonlyArray<readonly [SlimePose, number]> = [['run1', 2], ['run2', 4], ['run3', 2], ['run4', 2]]
const HOP_TICKS = HOP.reduce((sum, [, ticks]) => sum + ticks, 0)
// Sitting, it shuts its eyes for a tick this often.
const BLINK_EVERY = 40
// Ticks a changed number rolls from its old value to the new one.
export const ROLL_TICKS = 8
// How long the slime sits after a turn before it naps.
export const NAP_AFTER_MS = 20_000
// How long the slime naps at the inn once the conversation is compacted, the mana poured back.
export const REST_MS = 4000
// Ticks each 'z Z' frame of the nap stays up.
const SNORE_TICKS = 10

const UPPER_HALF = 0x2580
const LOWER_HALF = 0x2584
const SPACE = 0x20
const DEFAULT_COLOR = 0x01000000
const SNORE_COLOR = 0xc8d2ff
const ALERT_COLOR = 0xffd23c
const SWEAT_COLOR = 0x7ad0ff
const NOTE_COLOR = 0xffb4dc
const FLASH = 0xffffff
const SPARKS = [0xfff07a, 0xffffff, 0xffd23c]
const DUST = 0xd8c8a8
// The shadow: how far the grass under the slime darkens, and the sprite columns at either end it leaves out.
const SHADOW = 0.45
const SHADOW_FROM = 3
// How far a slime low on mana pales toward white.
const PALE = 0.35
// Each step of the sweat drop's slide holds for this many blinks of the danger.
const SWEAT_STEPS = 3
// While the person types, the slime stops to listen, and keeps listening this long after the last key.
export const LISTEN_MS = 3000
// A sent prompt: the slime crouches, leaps with a flash, and a ring of sparks flies off it. Ticks in all.
export const CAST_TICKS = 9
// The ring's directions from the slime's middle, a step of radius each tick.
const SPARK_RAYS: ReadonlyArray<readonly [number, number]> = [[1, 0], [-1, 0], [0, -1], [1, -1], [-1, -1], [2, -1], [-2, -1]]
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
  if (isWorking && !isWaiting) return hopAt(tick).pose
  if (!isWaiting && idleMs >= NAP_AFTER_MS) return 'sleep'
  return tick % BLINK_EVERY === BLINK_EVERY - 1 ? 'blink' : 'sit'
}

// Where `tick` falls in the hop: its frame, and how many ticks into that frame.
export const hopAt = (tick: number): { pose: SlimePose; step: number } => {
  let left = ((tick % HOP_TICKS) + HOP_TICKS) % HOP_TICKS
  for (const [pose, ticks] of HOP) {
    if (left < ticks) return { pose, step: left }
    left -= ticks
  }
  return { pose: 'run1', step: 0 }
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
  slime: {
    x: number
    dir: 1 | -1
    pose: SlimePose
    // Napping: 0 quiet, 1 a 'z', 2 a 'Z' risen up and out past it.
    snore: number
    alert?: boolean
    // Low on mana, a drop of sweat sliding down behind its head, this many pixels from its start.
    sweat?: number
    embers?: boolean
    // Low on mana, the slime pales.
    pale?: boolean
    // Ticks into a landing: the puff of dust either side, rising and spreading.
    dust?: number
    // Listening to the person type: a note above its head, 0 on its right, 1 on its left.
    note?: number
    // Ticks into a cast: the slime flashes white, then sparks fly from it.
    cast?: number
  },
  hud: readonly HudPixel[] = [],
  ground?: readonly (readonly number[])[],
): string => {
  const lit = new Map(hud.map(pixel => [pixel.y * trackWidth + pixel.x, pixel.rgb]))
  const groundTop = GRASS_Y + 2
  // The cast: a white flash as it leaps, then the ring of sparks widening, a colour per step, gone at the end.
  const isFlash = slime.cast !== undefined && slime.cast >= 2 && slime.cast <= 3
  const sparks = new Map<number, number>()
  if (slime.cast !== undefined && slime.cast >= 3) {
    const reach = slime.cast - 2
    const centerX = slime.x + SLIME_WIDTH / 2
    for (const [dx, dy] of SPARK_RAYS) {
      const x = Math.round(centerX + dx * (reach + 3))
      const y = 3 + dy * Math.min(reach, 3)
      if (x >= 0 && x < trackWidth && y >= 0 && y < GRASS_Y) sparks.set(y * trackWidth + x, SPARKS[reach % SPARKS.length]!)
    }
  }
  // Pixels drawn beside the slime: its puff of dust as it lands, a drop of sweat.
  const extras = new Map<number, number>()
  const put = (x: number, y: number, rgb: number) => {
    if (x >= 0 && x < trackWidth && y >= 0 && y < GRASS_Y) extras.set(y * trackWidth + x, rgb)
  }
  if (slime.dust !== undefined) {
    const out = slime.dust > 0 ? 1 : 0
    put(slime.x - 1 - out, GRASS_Y - 1 - out, DUST)
    put(slime.x + SLIME_WIDTH + out, GRASS_Y - 1 - out, DUST)
  }
  if (slime.sweat !== undefined) {
    const col = slime.dir === 1 ? slime.x - 1 : slime.x + SLIME_WIDTH
    put(col, 2 + slime.sweat, SWEAT_COLOR)
    put(col, 3 + slime.sweat, SWEAT_COLOR)
  }
  // In the air, its shadow darkens the grass under its middle.
  const isAirborne = slime.pose === 'run2'
  const rows = TRACK_ROWS + Math.ceil((ground?.length ?? 0) / 2)
  const colorAt = (col: number, y: number): number | undefined => {
    if (y >= groundTop) return ground?.[y - groundTop]?.[col]
    if (slime.embers === true && y === GRASS_Y + 1 && isCrack(col)) return EMBER
    const spriteCol = col - slime.x
    const floor = floorAt(col, y)
    if (floor !== undefined) {
      return isAirborne && y === GRASS_Y && spriteCol >= SHADOW_FROM && spriteCol < SLIME_WIDTH - SHADOW_FROM
        ? mixToward(floor, 0, SHADOW)
        : floor
    }
    if (spriteCol >= 0 && spriteCol < SLIME_WIDTH) {
      const sprite = pixelAt(slime.pose, y, spriteCol, slime.dir)
      if (sprite !== undefined) return isFlash ? FLASH : slime.pale === true ? mixToward(sprite, 0xffffff, PALE) : sprite
    }
    const extra = extras.get(y * trackWidth + col)
    if (extra !== undefined) return extra
    const spark = sparks.get(y * trackWidth + col)
    if (spark !== undefined) return spark
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
  // While napping, a 'z' beside its head, then a 'Z' a row up and a column further out.
  if (slime.pose === 'sleep' && slime.snore > 0) {
    const at = (offset: number) => Math.max(0, Math.min(trackWidth - 1, slime.dir === 1 ? slime.x + offset : slime.x + SLIME_WIDTH - 1 - offset))
    words.set([0x7a, SNORE_COLOR, DEFAULT_COLOR], (1 * trackWidth + at(SLIME_WIDTH - 2)) * 3)
    if (slime.snore === 2) words.set([0x5a, SNORE_COLOR, DEFAULT_COLOR], (0 * trackWidth + at(SLIME_WIDTH - 1)) * 3)
  }
  // Listening, a note bobs above its head, now on one side, now the other.
  if (slime.note !== undefined) {
    const col = Math.max(0, Math.min(trackWidth - 1, slime.x + (slime.note === 0 ? SLIME_WIDTH - 3 : 2)))
    words.set([0x266a, NOTE_COLOR, DEFAULT_COLOR], (0 * trackWidth + col) * 3)
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
  // The facts behind the big numbers, and the tick their last change began rolling with the values it rolls from.
  facts: [] as HudFact[],
  roll: undefined as { from: Map<string, string>; tick: number } | undefined,
  // While a banner shows: which one, the tick it arrived (its letters drop in, then a glint sweeps them) and its burst.
  banner: undefined as { key: string; tick: number } | undefined,
  burst: undefined as { key: string; burst: Burst; tick: number } | undefined,
  // The banner whose burst has played, so a redraw within it does not play it again.
  burstPlayed: '',
  // Draws the band again once the banner's moment passes.
  bannerTimer: undefined as Timer | undefined,
  requestId: '',
  ticker: undefined as Timer | undefined,
  shown: '',
  // The context window the ground below the grass shows as a tube of mana; none, and the track ends at the soil.
  mana: undefined as ContextInfo | undefined,
  // The mana near the rune: the slime sweats.
  isManaCritical: false,
  // Until when the slime listens to the person typing.
  listenUntil: 0,
  // Until when it naps at the inn after the conversation was compacted.
  restUntil: 0,
  // The tick a sent prompt's cast began, while it plays.
  castFrom: undefined as number | undefined,
  // On an SVG surface: when the cast began, so a redraw within it keeps the sparks.
  castAt: 0,
  listenTimer: undefined as Timer | undefined,
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

// The big numbers this tick: a changed one rolling to its new value, a banner's letters dropping in then glinting.
const hudFrame = (): HudPixel[] => {
  const banner = slime.banner
  if (banner !== undefined) {
    const ticks = slime.tick - banner.tick
    const pixels = dropIn(slime.hud, ticks)
    const line = glintLine(slime.hud, ticks)
    return line === undefined ? pixels : glintAt(pixels, line)
  }
  const roll = slime.roll
  if (roll === undefined) return slime.hud
  const t = (slime.tick - roll.tick) / ROLL_TICKS
  if (t >= 1) {
    slime.roll = undefined
    return slime.hud
  }
  // A rolling number glows toward white, fading back to its colour as it settles.
  const facts = slime.facts.map(fact => {
    const from = roll.from.get(fact.key)
    return from === undefined ? fact : { ...fact, value: rollValue(from, fact.value, t), rgb: mixToward(fact.rgb, 0xffffff, ROLL_GLOW * (1 - t)) }
  })
  return layoutHud(facts, slime.trackWidth).pixels
}

// A rolling number's glow toward white as it starts.
const ROLL_GLOW = 0.6

// A big moment's burst: a pixelfx effect baked into frames under assets/fx/<name>/ (see assets/fx/NOTICE.md).
type Burst = { frames: string[]; columns: number; rows: number }
const BURSTS: Readonly<Record<string, string>> = {
  'LEVEL UP!': 'level-up',
  'VICTORY!': 'confetti',
  'QUEST CLEAR': 'collect-burst',
  'DELIVERED!': 'loot-beam',
}
export const burstOf = (banner: Banner): string | undefined => BURSTS[banner.word]
// Read once each: absent until read, null once a read failed (not tried again).
const bursts = new Map<string, Burst | null>()
// A terminal that draws the alt instead of the picture refuses its blit; later banners then go without.
let canDrawBurst = true

const loadBurst = async ($: EngineInterface, name: string): Promise<Burst | undefined> => {
  if (!bursts.has(name)) {
    const dir = `${$.plugin.root}/assets/fx/${name}`
    const burst = await $.fs
      .read(`${dir}/meta.json`)
      .then(async text => {
        const meta = JSON.parse(text) as { frames: number; cells: [number, number] }
        const frames = await Promise.all(
          Array.from({ length: meta.frames }, async (_, n) => (await $.fs.read(`${dir}/${n}.png`, { as: 'bytes' })).base64),
        )
        return { frames, columns: meta.cells[0], rows: meta.cells[1] }
      })
      .catch(() => null)
    bursts.set(name, burst)
  }
  return bursts.get(name) ?? undefined
}

// The burst stands on the grass just left of the banner's letters; the slime keeps clear of it, with this much
// room to hop at least, or the burst goes.
const BURST_ROOM = SLIME_WIDTH + 4

async function paint($: EngineInterface) {
  if (slime.trackWidth === 0) return
  const now = await $.clock.now()
  slime.tick += 1
  const isWaiting = slime.waitingFor !== undefined
  const isListening = !isWaiting && now < slime.listenUntil
  const cast = slime.castFrom === undefined ? undefined : slime.tick - slime.castFrom
  if (cast !== undefined && cast >= CAST_TICKS) slime.castFrom = undefined
  const casting = cast !== undefined && cast < CAST_TICKS ? cast : undefined
  // Casting it crouches then leaps; listening it sits still; otherwise as the turn has it.
  const isResting = now < slime.restUntil
  const pose: SlimePose =
    casting !== undefined
      ? casting < 2 ? 'run1' : casting < 5 ? 'run2' : 'sit'
      : isListening ? 'sit'
      : isResting ? 'sleep'
      : slimePose(slime.isWorking, now - slime.idleSince, slime.tick, isWaiting)
  const alert = isWaiting && Math.floor(slime.tick / ALERT_TICKS) % 2 === 0
  // The slime only travels while it is in the air.
  if (pose === 'run2' && casting === undefined) {
    const moved = stepSlime(slime.x, slime.dir, slime.areaWidth)
    slime.x = moved.x
    slime.dir = moved.dir
  }
  const snore = pose === 'sleep' ? Math.floor(slime.tick / SNORE_TICKS) % 3 : 0
  const hud = hudFrame()
  // Near the rune the slime sweats and the cracks glow, by turns; each time it shows, the drop has slid a pixel.
  const blinks = Math.floor(slime.tick / ALERT_TICKS)
  const danger = slime.isManaCritical && blinks % 2 === 1
  const landing = casting === undefined && pose === 'run3' ? hopAt(slime.tick).step : undefined
  const ground = slime.mana === undefined ? undefined : groundPixels(slime.mana, slime.trackWidth, slime.tick, slime.isWorking)
  const cells = composeTrack(
    slime.trackWidth,
    {
      x: slime.x,
      dir: slime.dir,
      pose,
      snore,
      alert,
      ...(danger ? { sweat: Math.floor(blinks / 2) % SWEAT_STEPS } : {}),
      embers: danger,
      pale: slime.isManaCritical,
      ...(landing === undefined ? {} : { dust: landing }),
      ...(isListening ? { note: Math.floor(slime.tick / ALERT_TICKS) % 2 } : {}),
      ...(casting === undefined ? {} : { cast: casting }),
    },
    hud,
    ground,
  )
  const burst = slime.burst
  const burstAt = burst === undefined ? undefined : slime.tick - burst.tick
  // Played out, the burst leaves the band: a redraw takes its picture away and gives the slime its room back.
  if (burst !== undefined && burstAt !== undefined && burstAt >= burst.burst.frames.length) {
    slime.burst = undefined
    $.ui.invalidate('ui.render')
  }
  const burstBlit =
    burst === undefined || burstAt === undefined || burstAt >= burst.burst.frames.length
      ? undefined
      : $.ui
          .blit({ requestId: slime.requestId, key: 'burst', source: { png: burst.burst.frames[burstAt]! } })
          .catch(() => ({ deny: 'blit failed' }))
          .then(shown => {
            if (shown.deny === undefined || slime.burst !== burst) return
            slime.burst = undefined
            // Refused on its first frames the picture is the terminal's to refuse: later banners go without.
            if (burstAt <= 2) canDrawBurst = false
            $.ui.invalidate('ui.render')
          })
  if (cells === slime.shown) {
    await burstBlit
    return
  }

  // A refusal and a failed blit both mean the track is not on screen.
  const [done] = await Promise.all([
    $.ui
      .blit({ requestId: slime.requestId, key: 'track', cells, columns: slime.trackWidth, rows: trackRows() })
      .catch(() => ({ deny: 'blit failed' })),
    burstBlit,
  ])
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

const LABEL_HEX: Record<string, string> = Object.fromEntries(
  Object.entries(FACT_COLORS).map(([name, rgb]) => [name, `#${rgb.toString(16).padStart(6, '0')}`]),
)

const MODE_ALT: Record<SceneSlime['mode'], string> = {
  walk: 'hopping while Claude works',
  sit: 'sitting',
  sleep: 'napping',
  wait: 'waiting on you',
  listen: 'listening to you type',
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
  // A compaction is a night at the inn: the slime naps while the mana pours back. Not a precompute, which installs
  // nothing, nor a subagent's own.
  on('session.compact', async ($, e, next) => {
    const result = await next(e)
    if (e.trigger === 'precompute' || e.agentId !== undefined || result.skip !== undefined) return result
    slime.restUntil = (await $.clock.now()) + REST_MS
    redraw($)
    $.clock.after(REST_MS, () => redraw($))
    return result
  })

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

  // The person typing: the slime stops to listen, until the box empties or the keys stop for a while.
  on('prompt.edit', async ($, e, next) => {
    const box = await next(e)
    const now = await $.clock.now()
    const wasListening = now < slime.listenUntil
    slime.listenUntil = box.text.trim() === '' ? 0 : now + LISTEN_MS
    // Typing wakes it from a nap.
    slime.idleSince = Math.max(slime.idleSince, now)
    if (slime.surface !== undefined && slime.surface !== 'terminal') {
      slime.listenTimer?.cancel()
      slime.listenTimer = slime.listenUntil === 0 ? undefined : $.clock.after(LISTEN_MS, () => $.ui.invalidate('ui.render'))
      if (wasListening !== slime.listenUntil > now) redraw($)
    }
    return box
  })

  on('prompt.submit', async ($, e, next) => {
    slime.isWorking = true
    slime.waitingFor = undefined
    // Sent: the slime casts it.
    slime.listenUntil = 0
    slime.castFrom = slime.tick
    slime.castAt = await $.clock.now()
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
      const isListening = !isWaiting && now < slime.listenUntil
      // A lap that ends (rest, a wait, the person typing, a resize) leaves the slime where it had hopped to.
      if (slime.walk !== undefined && (!slime.isWorking || isWaiting || isListening || slime.walk.last !== last)) {
        const at = walkAt(slime.walk.x, slime.walk.dir, slime.walk.last, now - slime.walk.since)
        slime.x = at.x
        slime.dir = at.dir
        slime.walk = undefined
      }
      slime.x = Math.min(slime.x, last)
      if (slime.isWorking && !isWaiting && !isListening && slime.walk === undefined) {
        slime.walk = { x: slime.x, dir: slime.dir, last, since: now }
      }
      const idleMs = now - slime.idleSince
      const isResting = now < slime.restUntil
      const mode: SceneSlime['mode'] = isWaiting ? 'wait' : isListening ? 'listen' : isResting ? 'sleep' : slime.walk ? 'walk' : idleMs >= NAP_AFTER_MS ? 'sleep' : 'sit'
      const castMs = now - slime.castAt < CAST_MS ? now - slime.castAt : undefined
      slime.napTimer?.cancel()
      slime.napTimer = mode === 'sit' ? $.clock.after(NAP_AFTER_MS - idleMs, () => $.ui.invalidate('ui.render')) : undefined
      const gauge = layoutGauge(context, e.props.bodyColumns)
      // The ground under the soil shows the mana, a step of its ripple each hop.
      const ground = gauge === undefined ? undefined : { info: context, isWorking: slime.isWorking, frameMs: TUBE_FRAME_MS }
      const scene = sceneSvg(
        width,
        hud,
        { mode, x: slime.walk?.x ?? slime.x, dir: slime.walk?.dir ?? slime.dir, last, ...(castMs === undefined ? {} : { castMs }) },
        LABEL_HEX,
        ground,
      )
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

    const { Box, Text, Raster, Image } = $.ui.resolve(e)
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
    slime.hud = hud.pixels
    if (band.banner === undefined) {
      slime.banner = undefined
      slime.burst = undefined
      // A fact whose value changed since the last drawing rolls to its new one.
      const before = new Map(slime.facts.map(fact => [fact.key, fact.value]))
      const changed = new Map(band.facts.flatMap(fact => {
        const from = before.get(fact.key)
        return from === undefined || from === fact.value ? [] : [[fact.key, from] as const]
      }))
      if (changed.size > 0) slime.roll = { from: changed, tick: slime.tick }
      slime.facts = band.facts
    } else {
      const key = `${band.banner.word}@${band.banner.until}`
      if (slime.banner?.key !== key) slime.banner = { key, tick: slime.tick }
      // A big moment's burst plays once, beside the letters, while there is room for it and the slime.
      const name = burstOf(band.banner)
      if (name !== undefined && slime.burstPlayed !== key && canDrawBurst) {
        slime.burstPlayed = key
        const burst = await loadBurst($, name)
        if (burst !== undefined && hud.areaWidth - burst.columns - 1 >= BURST_ROOM) slime.burst = { key, burst, tick: slime.tick }
      }
      if (slime.burst !== undefined && slime.burst.key !== key) slime.burst = undefined
    }
    const burst = slime.burst
    const burstLeft = burst === undefined ? 0 : hud.areaWidth - burst.burst.columns - 1
    slime.areaWidth = burst === undefined ? hud.areaWidth : burstLeft - 1
    slime.x = Math.min(slime.x, Math.max(0, slime.areaWidth - SLIME_WIDTH))
    slime.requestId = e.requestId
    slime.ticker ??= $.clock.every(FRAME_MS, () => void paint($))
    const pose = slimePose(slime.isWorking, (await $.clock.now()) - slime.idleSince, slime.tick, slime.waitingFor !== undefined)
    const ground = slime.mana === undefined ? undefined : groundPixels(slime.mana, trackWidth, slime.tick, slime.isWorking)
    slime.shown = composeTrack(trackWidth, { x: slime.x, dir: slime.dir, pose, snore: 0 }, hudFrame(), ground)

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
          <Text color={LABEL_HEX[label.color] ?? label.color}>{label.text}</Text>
        </Text>
      )
    })

    return (
      <Box flexDirection="column">
        <Text wrap="truncate">{labelPieces}</Text>
        <Raster key="track" columns={trackWidth} rows={trackRows()} cells={slime.shown} />
        {burst && (
          // Over the label row and the slime's rows, standing on the grass.
          <Box position="absolute" top={Math.max(0, TRACK_ROWS - burst.burst.rows)} left={burstLeft}>
            <Image
              key="burst"
              source={{ png: burst.burst.frames[Math.min(slime.tick - burst.tick, burst.burst.frames.length - 1)]! }}
              columns={burst.burst.columns}
              rows={burst.burst.rows}
              alt=" "
            />
          </Box>
        )}
        {gauge && renderGauge({ Box, Text }, gauge)}
        {engine}
      </Box>
    )
  })
}
