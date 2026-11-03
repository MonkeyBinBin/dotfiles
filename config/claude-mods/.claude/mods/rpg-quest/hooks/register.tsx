import type { EngineInterface, Register } from 'claude-code'

// Emoji with default emoji presentation only: no VS16, so every terminal gives them two cells.
const ENDINGS: Record<string, string> = { completed: '✅', failed: '❌', killed: '🛑' }
const OTHER_ENDING = '📨'

export type TaskKind = 'shell' | 'agent' | 'remote'
const KIND_MARKS: Record<TaskKind, string> = { shell: '⚙', agent: '◈', remote: '☁' }

type Task = { id?: string; status?: string; type?: string; toolUseId?: string }
type Known = { jobs: { id: string; toolUseId: string }[]; pets: { id: string; agentId?: string }[] }

// rpg-hud's jobs and pets name the task when that mod runs; another plugin's state is read-only.
async function readKnown($: EngineInterface): Promise<Known> {
  const [jobs, pets] = await Promise.all([
    $.state.get({ plugin: 'rpg-hud', key: 'jobs' } as never).catch(() => undefined),
    $.state.get({ plugin: 'rpg-hud', key: 'pets' } as never).catch(() => undefined),
  ])
  return {
    jobs: (jobs?.value as Known['jobs'] | undefined) ?? [],
    pets: (pets?.value as Known['pets'] | undefined) ?? [],
  }
}

export const endingMark = (status: string | undefined): string =>
  (status === undefined ? undefined : ENDINGS[status]) ?? OTHER_ENDING

// A remote agent says so in `type`; a shell or a subagent leaves it out, so rpg-hud's lists tell them apart.
export const kindOf = (task: Task, known: Known): TaskKind | undefined => {
  if (task.type === 'remote_agent') return 'remote'
  const matches = (id: string | undefined, other: string | undefined) => id !== undefined && id === other
  if (known.jobs.some(job => matches(job.id, task.id) || matches(job.toolUseId, task.toolUseId))) return 'shell'
  if (known.pets.some(pet => matches(pet.agentId, task.id) || matches(pet.id, task.toolUseId))) return 'agent'
  return undefined
}

export const questPrefix = (task: Task, kind: TaskKind | undefined): string =>
  kind === undefined ? `${endingMark(task.status)} ` : `${endingMark(task.status)} ${KIND_MARKS[kind]} `

// A quest back plays its ending once under the row: pixelfx effects
// (https://github.com/patch-gg/pixelfx, MIT) baked by rpg-battle's tools/bake-fx.mjs at one frame per tick into
// assets/fx/<status>/, as pictures where the terminal draws them, else as half-block cells. See assets/fx/NOTICE.md.
const BURSTS: Record<string, string> = { completed: 'completed', failed: 'failed', killed: 'killed' }
export const burstOf = (status: string | undefined): string | undefined => (status === undefined ? undefined : BURSTS[status])

const TICK_MS = 80
// Rows drawn this soon after the mod loads are the transcript coming back (a resume, a reload): they keep still.
export const SETTLE_MS = 2000
// Rows whose blit keeps being refused (scrolled away, unmounted) stop animating after this.
const MAX_MISSES = 5

// A burst as pictures (PNG base64 a frame) or, where the terminal draws none, as Raster cells baked in half blocks
// (raster-<C>x<R>.json, packed cells a frame).
export type Burst = { kind: 'image' | 'cells'; frames: string[]; columns: number; rows: number }
// Read once each: absent until read, null once a read failed (not tried again).
const bursts = new Map<string, Burst | null>()
// Learnt from the first refusal that says so; from then on endings play as cells.
let canDrawBurst = true

// The Raster each ending bakes as. A completed quest's banner keeps its words only as glyphs (questBanner below):
// at two pixels a row the baked one is a smudge.
const RASTERS: Record<string, string> = { failed: 'raster-12x5', killed: 'raster-12x5' }

// The quest-complete banner in glyphs, after pixelfx's ui/quest-complete: the ribbon unfurls from the middle, the
// seal stamps on, a shine sweeps across under twinkling stars, and it rolls up from its ends.
const BANNER_TEXT = ' QUEST COMPLETE '
const SEAL = ' ✓ '
// Tail, words, seal, tail.
export const BANNER_COLUMNS = 1 + BANNER_TEXT.length + SEAL.length + 1
export const BANNER_ROWS = 3
export const BANNER_FRAMES = 31
const UNFURL_FRAMES = 6
const SEAL_AT = 7
const SHINE_FROM = 9
const SHINE_FRAMES = 12
const ROLL_FROM = 25
const STARS_FROM = 8
const STARS_TO = 25

const RIBBON = 0xc8342c
const RIBBON_DARK = 0x7a1d1a
const SHINE = 0xff7a5c
const CREAM = 0xffe9b0
const GOLD = 0xffc53d
const GOLD_INK = 0x5a3a00
const STAR = 0xfff3b0
const DEFAULT_COLOR = 0x01000000

type Cell = readonly [number, number, number]
const glyph = (ch: string, fg: number, bg: number): Cell => [ch.codePointAt(0) ?? 0x20, fg, bg]
const BLANK: Cell = glyph(' ', DEFAULT_COLOR, DEFAULT_COLOR)
const STARS = ['✦', '✧', '·']

export const packCells = (cells: readonly Cell[]): string => {
  const words = new Uint32Array(cells.length * 3)
  cells.forEach((cell, i) => words.set(cell, i * 3))
  return btoa(String.fromCharCode(...new Uint8Array(words.buffer)))
}

// One frame of the banner, `frame` from 0: BANNER_ROWS rows of BANNER_COLUMNS cells.
export const questBanner = (frame: number): string => {
  const middle = (BANNER_COLUMNS - 1) / 2
  // How far from the middle the ribbon reaches: out as it unfurls, back in as it rolls up.
  const reach =
    frame < UNFURL_FRAMES ? ((frame + 1) / UNFURL_FRAMES) * (middle + 1)
    : frame >= ROLL_FROM ? Math.max(0, 1 - (frame - ROLL_FROM + 1) / (BANNER_FRAMES - ROLL_FROM)) * (middle + 1)
    : middle + 1
  const shineAt = frame >= SHINE_FROM && frame < SHINE_FROM + SHINE_FRAMES ? Math.round(((frame - SHINE_FROM) / (SHINE_FRAMES - 1)) * (BANNER_COLUMNS - 1)) : -9
  const ribbon = (x: number): Cell => {
    if (Math.abs(x - middle) >= reach) return BLANK
    if (x === 0) return glyph('◢', RIBBON_DARK, DEFAULT_COLOR)
    if (x === BANNER_COLUMNS - 1) return glyph('◣', RIBBON_DARK, DEFAULT_COLOR)
    const sealAt = x - 1 - BANNER_TEXT.length
    if (sealAt >= 0) {
      if (frame < SEAL_AT) return glyph(' ', RIBBON, RIBBON)
      // The stamp lands white, then settles gold.
      const face = frame === SEAL_AT ? 0xffffff : GOLD
      return glyph(SEAL[sealAt]!, GOLD_INK, face)
    }
    const isShine = Math.abs(x - shineAt) <= 1
    return glyph(BANNER_TEXT[x - 1]!, isShine ? 0xffffff : CREAM, isShine ? SHINE : RIBBON)
  }
  // Stars twinkle above and below, each at its own beat.
  const star = (x: number, row: number): Cell => {
    if (frame < STARS_FROM || frame >= STARS_TO) return BLANK
    const seed = Math.imul(x * 7 + row * 13 + 1, 2654435761) >>> 0
    if (seed % 5 !== 0) return BLANK
    const phase = (frame + (seed >>> 8)) % 6
    return phase < STARS.length ? glyph(STARS[phase]!, STAR, DEFAULT_COLOR) : BLANK
  }
  const cells: Cell[] = []
  for (let row = 0; row < BANNER_ROWS; row += 1)
    for (let x = 0; x < BANNER_COLUMNS; x += 1) cells.push(row === 1 ? ribbon(x) : star(x, row))
  return packCells(cells)
}

export const refusesPictures = (shown: { deny?: string; fix?: string }): boolean =>
  shown.fix === 'tmux-passthrough' || /\balt\b|placeholder/i.test(shown.deny ?? '')

const readBurst = async ($: EngineInterface, name: string, kind: Burst['kind']): Promise<Burst | null> => {
  const dir = `${$.plugin.root}/assets/fx/${name}`
  if (kind === 'cells') {
    if (name === 'completed')
      return { kind, frames: Array.from({ length: BANNER_FRAMES }, (_, frame) => questBanner(frame)), columns: BANNER_COLUMNS, rows: BANNER_ROWS }
    const file = RASTERS[name]
    if (file === undefined) return null
    const raster = JSON.parse(await $.fs.read(`${dir}/${file}.json`)) as { columns: number; rows: number; frames: string[] }
    return { kind, frames: raster.frames, columns: raster.columns, rows: raster.rows }
  }
  const meta = JSON.parse(await $.fs.read(`${dir}/meta.json`)) as { frames: number; cells: [number, number] }
  const frames = await Promise.all(
    Array.from({ length: meta.frames }, async (_, n) => (await $.fs.read(`${dir}/${n}.png`, { as: 'bytes' })).base64),
  )
  return { kind, frames, columns: meta.cells[0], rows: meta.cells[1] }
}

const loadBurst = async ($: EngineInterface, name: string, kind: Burst['kind']): Promise<Burst | undefined> => {
  const id = `${name}:${kind}`
  if (!bursts.has(id)) bursts.set(id, await readBurst($, name, kind).catch(() => null))
  return bursts.get(id) ?? undefined
}

// The quests whose ending has had its moment, by task: a row drawn again (a resize) never plays it twice.
const played = new Set<string>()
// The endings playing, by task: the row's site, the ending, the burst and how far it has played.
const playing = new Map<string, { site: string; name: string; burst: Burst; tick: number; misses: number }>()
let loadedAt: number | undefined
let ticker: ReturnType<EngineInterface['clock']['every']> | undefined
let isPainting = false

const taskKey = (task: Task, site: string): string => task.id ?? task.toolUseId ?? site

const frameOf = (burst: Burst, tick: number): string => burst.frames[Math.min(tick, burst.frames.length - 1)]!

async function paint($: EngineInterface) {
  if (isPainting) return
  isPainting = true
  try {
    let isOver = false
    await Promise.all(
      [...playing].map(async ([key, play]) => {
        play.tick += 1
        if (play.tick >= play.burst.frames.length) {
          playing.delete(key)
          isOver = true
          return
        }
        const frame = frameOf(play.burst, play.tick)
        const shown = await $.ui
          .blit(
            play.burst.kind === 'image'
              ? { requestId: play.site, key: 'quest-fx', source: { png: frame } }
              : { requestId: play.site, key: 'quest-fx-cells', cells: frame },
          )
          .catch(() => ({ deny: 'blit failed' }))
        if (shown.deny === undefined) {
          play.misses = 0
          return
        }
        // Its alt drawn instead, or tmux holding it back: the terminal draws no pictures, so this ending and every
        // later one plays as cells, drawn again in the picture's place.
        if (play.burst.kind === 'image' && refusesPictures(shown)) {
          canDrawBurst = false
          const cells = await loadBurst($, play.name, 'cells')
          if (cells !== undefined) {
            play.burst = cells
            isOver = true
            return
          }
        }
        if (play.tick <= 2 || (play.misses += 1) >= MAX_MISSES) {
          playing.delete(key)
          isOver = true
        }
      }),
    )
    // A finished ending leaves its row, a refused picture turns to cells: redraw.
    if (isOver) $.ui.invalidate('ui.render')
  } finally {
    isPainting = false
    if (playing.size === 0) {
      ticker?.cancel()
      ticker = undefined
    }
  }
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    loadedAt = await $.clock.now()
    return next(e)
  })

  // The engine keeps its row and the duration after it; ctrl+o shows the notification untouched.
  on('ui.render', { component: 'UserMessage' }, async ($, e, next) => {
    const task = e.props.task
    if (e.props.origin.kind !== 'task-notification' || task === undefined || e.props.isExpanded) return next(e)
    const prefix = questPrefix(task, kindOf(task, await readKnown($)))
    const drawn = await next({ ...e, props: { ...e.props, text: prefix + e.props.text } })
    if (e.surface !== 'terminal') return drawn

    const key = taskKey(task, e.requestId)
    if (!playing.has(key) && !played.has(key)) {
      played.add(key)
      const now = await $.clock.now()
      loadedAt ??= now
      const name = burstOf(task.status)
      const burst =
        name !== undefined && now - loadedAt >= SETTLE_MS ? await loadBurst($, name, canDrawBurst ? 'image' : 'cells') : undefined
      if (name !== undefined && burst !== undefined) playing.set(key, { site: e.requestId, name, burst, tick: 0, misses: 0 })
    }
    const play = playing.get(key)
    if (play === undefined) return drawn
    play.site = e.requestId
    ticker ??= $.clock.every(TICK_MS, () => void paint($))
    const { Box, Image, Raster } = $.ui.resolve(e)
    const { burst } = play
    return (
      <Box flexDirection="column">
        {drawn}
        <Box marginLeft={2}>
          {burst.kind === 'image' ? (
            <Image key="quest-fx" source={{ png: frameOf(burst, play.tick) }} columns={burst.columns} rows={burst.rows} alt=" " />
          ) : (
            <Raster key="quest-fx-cells" cells={frameOf(burst, play.tick)} columns={burst.columns} rows={burst.rows} />
          )}
        </Box>
      </Box>
    )
  })
}
