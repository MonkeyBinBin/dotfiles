import type { EngineInterface, Register } from 'claude-code'

type Mode = 'requesting' | 'responding' | 'thinking' | 'tool-input' | 'tool-use'

// One pool per phase of the turn, so the line says what the hero is doing.
// Emoji with default emoji presentation only: no VS16, so every terminal gives them two cells.
export const VERBS: Record<Mode, readonly string[]> = {
  requesting: ['🧭 Setting out', '🐎 Riding forth', '🚪 Entering the dungeon', '🔦 Scouting ahead'],
  thinking: ['🔮 Channeling', '📖 Studying the tome', '🧠 Consulting the oracle', '✨ Charging mana'],
  'tool-input': ['📜 Inscribing runes', '🪄 Preparing a spell', '🎯 Taking aim'],
  'tool-use': ['🤺 Attacking', '🔥 Casting Fireball', '🧱 Holding the line', '🏹 Loosing arrows', '🔑 Picking the lock'],
  responding: ['🎶 Singing the saga', '📯 Reporting to the guild', '🪶 Writing the chronicle'],
}

export const PAST_VERBS: readonly string[] = [
  '🤺 Battled', '🐉 Slew dragons', '🪓 Quested', '🏰 Raided', '💎 Looted', '🌋 Adventured',
]

// FNV-1a: stable picks, so a verb holds still for the whole turn.
export const hash = (text: string): number => {
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

export const pick = <T,>(pool: readonly T[], seed: string): T => pool[hash(seed) % pool.length] as T

// The aura: a few cells before the verb, animated in the phase's own colours on the terminal.
export const AURA_COLUMNS = 5
// Rows the engine's spinner draws above its line.
export const SPACER_ROWS = 1
const AURA_MS = 120
// Sites whose blit keeps being refused (the spinner is gone) stop animating after this.
const MAX_MISSES = 8
const DEFAULT = 0x01000000

type Cell = readonly [glyph: number, fg: number, bg: number]

const mix = (a: number, b: number, k: number): number => {
  const ch = (shift: number) => Math.round(((a >> shift) & 0xff) * (1 - k) + ((b >> shift) & 0xff) * k) << shift
  return ch(16) | ch(8) | ch(0)
}
const at = (glyph: string, fg: number): Cell => [glyph.codePointAt(0) ?? 0x20, fg, DEFAULT]
const BLANK = at(' ', DEFAULT)

const GOLD = 0xffe14a
const VIOLET = 0xc88cff
const BLUE = 0x5aa9ff
const CYAN = 0x56c8dc
const EMBER = 0xff5f5f
const FLAME = 0xffa53c
const PINK = 0xff8caa
const SHADOW = 0x3a3a46

const TWINKLE = ['·', '⋆', '✧', '✦', '✧', '⋆']
const RUNES = ['◇', '◆', '◈', '◆', '◇']
const FLAMES = ['▁', '▂', '▃', '▄', '▅', '▆']
const NOTES = ['♪', '♫']

// One frame of a phase's aura, `tick` counting from when it was first drawn.
export const auraCells = (mode: Mode, tick: number): readonly Cell[] =>
  Array.from({ length: AURA_COLUMNS }, (_, i): Cell => {
    switch (mode) {
      // A mote rides ahead, a fading trail behind it.
      case 'requesting': {
        const lead = tick % (AURA_COLUMNS + 2)
        const behind = lead - i
        if (behind === 0) return at('▸', GOLD)
        if (behind > 0 && behind <= 2) return at('·', mix(GOLD, SHADOW, behind / 3))
        return BLANK
      }
      // Stars twinkle out of step, violet into blue.
      case 'thinking': {
        const phase = (tick + i * 2) % TWINKLE.length
        return at(TWINKLE[phase]!, mix(VIOLET, BLUE, i / (AURA_COLUMNS - 1)))
      }
      // Gems are set one by one, the newest bright, then the line is wiped.
      case 'tool-input': {
        const written = tick % (AURA_COLUMNS + 3)
        if (i > written) return at('·', SHADOW)
        return at(RUNES[i]!, i === written ? 0xffffff : CYAN)
      }
      // A fire flickers, hottest in the middle.
      case 'tool-use': {
        const heat = 1 - Math.abs(i - (AURA_COLUMNS - 1) / 2) / ((AURA_COLUMNS - 1) / 2)
        const flicker = (Math.imul(tick + 1, 2654435761) >>> (i * 3)) % 3
        const height = Math.min(FLAMES.length - 1, Math.round(heat * 3) + flicker)
        return at(FLAMES[height]!, mix(EMBER, FLAME, height / (FLAMES.length - 1)))
      }
      // Notes bob along the line in turn.
      case 'responding': {
        const beat = tick % AURA_COLUMNS
        if (i % 2 === 1) return BLANK
        return at(NOTES[(i + tick) % 2]!, i === beat || i === beat - 1 ? PINK : mix(PINK, SHADOW, 0.5))
      }
    }
  })

const pack = (cells: readonly Cell[]): string => {
  const words = new Uint32Array(cells.length * 3)
  cells.forEach((cell, i) => words.set(cell, i * 3))
  return btoa(String.fromCharCode(...new Uint8Array(words.buffer)))
}

// Where the terminal draws pictures the aura is a pixelfx loop (https://github.com/patch-gg/pixelfx, MIT) per phase,
// baked by rpg-battle's tools/bake-fx.mjs at one frame per AURA_MS tick into assets/fx/<mode>/, filling the aura's
// cells exactly (see assets/fx/NOTICE.md). The glyph aura above stays for every other terminal.
export type AuraLoop = { frames: string[] }
// Read once each: absent until read, null once a read failed (not tried again).
const loops = new Map<Mode, AuraLoop | null>()
// A terminal that draws the alt instead of the picture refuses its blits; from then on the glyphs play.
let canDrawLoop = true
// Spinners in a row whose picture was refused as soon as drawn. One alone is a phase that ended at once (the
// spinner unmounted); several, with no word of why, are the terminal's.
let earlyRefusals = 0
const MAX_EARLY_REFUSALS = 3

// Whether a refused picture says the terminal will not draw it: its alt drawn instead, or tmux holding it back.
export const refusesPictures = (shown: { deny?: string; fix?: string }): boolean =>
  shown.fix === 'tmux-passthrough' || /\balt\b|placeholder/i.test(shown.deny ?? '')

const loadLoop = async ($: EngineInterface, mode: Mode): Promise<AuraLoop | undefined> => {
  if (!loops.has(mode)) {
    const dir = `${$.plugin.root}/assets/fx/${mode}`
    const loop = await $.fs
      .read(`${dir}/meta.json`)
      .then(async text => {
        const meta = JSON.parse(text) as { frames: number; cells: [number, number] }
        if (meta.cells[0] !== AURA_COLUMNS || meta.cells[1] !== 1 || meta.frames < 1) return null
        const frames = await Promise.all(
          Array.from({ length: meta.frames }, async (_, n) => (await $.fs.read(`${dir}/${n}.png`, { as: 'bytes' })).base64),
        )
        return { frames }
      })
      .catch(() => null)
    loops.set(mode, loop)
  }
  return loops.get(mode) ?? undefined
}

// A loop's frame `tick` ticks in: round and round, the bake one period long so it tiles.
export const loopFrame = (loop: AuraLoop, tick: number): string => loop.frames[tick % loop.frames.length]!

// The spinners on screen, by their site's requestId: the phase each shows, how far its aura has played, and the
// loop it plays as a picture, if it does.
const auras = new Map<string, { mode: Mode; tick: number; misses: number; loop?: AuraLoop }>()
let ticker: ReturnType<EngineInterface['clock']['every']> | undefined
let isPainting = false

async function paint($: EngineInterface) {
  if (isPainting) return
  isPainting = true
  try {
    await Promise.all(
      [...auras].map(async ([site, aura]) => {
        aura.tick += 1
        const loop = aura.loop
        const shown = await $.ui
          .blit(
            loop === undefined
              ? { requestId: site, key: 'aura', cells: pack(auraCells(aura.mode, aura.tick)) }
              : { requestId: site, key: 'aura-fx', source: { png: loopFrame(loop, aura.tick) } },
          )
          .catch(() => ({ deny: 'blit failed' }))
        if (loop !== undefined && shown.deny === undefined) earlyRefusals = 0
        // A picture the terminal will not draw, said so or refused just drawn at spinner after spinner: the glyphs
        // take over, drawn again in its place.
        if (loop !== undefined && shown.deny !== undefined && aura.tick <= 2) earlyRefusals += aura.tick === 1 ? 1 : 0
        if (loop !== undefined && shown.deny !== undefined && (refusesPictures(shown) || earlyRefusals >= MAX_EARLY_REFUSALS)) {
          canDrawLoop = false
          aura.loop = undefined
          $.ui.invalidate('ui.render')
          return
        }
        aura.misses = shown.deny === undefined ? 0 : aura.misses + 1
        if (aura.misses >= MAX_MISSES) auras.delete(site)
      }),
    )
  } finally {
    isPainting = false
    if (auras.size === 0) {
      ticker?.cancel()
      ticker = undefined
    }
  }
}

function ensureTicker($: EngineInterface) {
  ticker ??= $.clock.every(AURA_MS, () => void paint($))
}

export const register: Register = on => {
  // Seeded by the engine's own per-turn word: a new verb each turn, steady within one.
  on('ui.render', { component: 'Spinner' }, async ($, e, next) => {
    const drawn = await next({ ...e, props: { ...e.props, word: pick(VERBS[e.props.mode], e.props.word + e.props.mode) } })
    if (e.surface !== 'terminal') return drawn
    // A new phase starts its aura over; the same one keeps playing where it was.
    const known = auras.get(e.requestId)
    const loop = canDrawLoop ? await loadLoop($, e.props.mode) : undefined
    const aura = known === undefined || known.mode !== e.props.mode ? { mode: e.props.mode, tick: 0, misses: 0 } : known
    if (loop === undefined) delete aura.loop
    else aura.loop = loop
    auras.set(e.requestId, aura)
    ensureTicker($)
    const { Box, Raster, Image } = $.ui.resolve(e)
    // The engine's spinner opens with a blank spacer row: the aura starts one row down, on the verb's.
    return (
      <Box flexDirection="row" alignItems="flex-start">
        <Box marginTop={SPACER_ROWS}>
        {aura.loop === undefined ? (
          <Raster key="aura" columns={AURA_COLUMNS} rows={1} cells={pack(auraCells(e.props.mode, aura.tick))} />
        ) : (
          <Image key="aura-fx" source={{ png: loopFrame(aura.loop, aura.tick) }} columns={AURA_COLUMNS} rows={1} alt=" " />
        )}
        </Box>
        <Box marginLeft={1}>{drawn}</Box>
      </Box>
    )
  })

  on('ui.render', { component: 'TurnDuration' }, ($, e, next) =>
    next({ ...e, props: { ...e.props, word: pick(PAST_VERBS, e.props.word + e.requestId) } }))
}
