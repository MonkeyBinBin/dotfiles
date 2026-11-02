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

// The spinners on screen, by their site's requestId: the phase each shows and how far its aura has played.
const auras = new Map<string, { mode: Mode; tick: number; misses: number }>()
let ticker: ReturnType<EngineInterface['clock']['every']> | undefined
let isPainting = false

async function paint($: EngineInterface) {
  if (isPainting) return
  isPainting = true
  try {
    await Promise.all(
      [...auras].map(async ([site, aura]) => {
        aura.tick += 1
        const shown = await $.ui
          .blit({ requestId: site, key: 'aura', cells: pack(auraCells(aura.mode, aura.tick)) })
          .catch(() => ({ deny: 'blit failed' }))
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
    const aura = auras.get(e.requestId)
    if (aura === undefined || aura.mode !== e.props.mode) auras.set(e.requestId, { mode: e.props.mode, tick: 0, misses: 0 })
    ensureTicker($)
    const { Box, Raster } = $.ui.resolve(e)
    const tick = auras.get(e.requestId)?.tick ?? 0
    return (
      <Box flexDirection="row">
        <Raster key="aura" columns={AURA_COLUMNS} rows={1} cells={pack(auraCells(e.props.mode, tick))} />
        <Box marginLeft={1}>{drawn}</Box>
      </Box>
    )
  })

  on('ui.render', { component: 'TurnDuration' }, ($, e, next) =>
    next({ ...e, props: { ...e.props, word: pick(PAST_VERBS, e.props.word + e.requestId) } }))
}
