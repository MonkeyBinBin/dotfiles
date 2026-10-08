import type { Register } from 'claude-code'

type Mode = 'requesting' | 'responding' | 'thinking' | 'tool-input' | 'tool-use'

// One pool per phase of the turn, so the line says what the hero is doing.
export const VERBS: Record<Mode, readonly string[]> = {
  requesting: ['🗺️ Setting out', '🐎 Riding forth', '🚪 Entering the dungeon', '🔦 Scouting ahead'],
  thinking: ['🔮 Channeling', '📖 Studying the tome', '🧠 Consulting the oracle', '✨ Charging mana'],
  'tool-input': ['📜 Inscribing runes', '🪄 Preparing a spell', '🎯 Taking aim'],
  'tool-use': ['⚔️ Attacking', '🔥 Casting Fireball', '🛡️ Holding the line', '🏹 Loosing arrows', '🗝️ Picking the lock'],
  responding: ['🎶 Singing the saga', '📯 Reporting to the guild', '🪶 Writing the chronicle'],
}

export const PAST_VERBS: readonly string[] = [
  '⚔️ Battled', '🐉 Slew dragons', '🗡️ Quested', '🏰 Raided', '💎 Looted', '🧭 Adventured',
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

export const pick = <T>(pool: readonly T[], seed: string): T => pool[hash(seed) % pool.length] as T

export const register: Register = on => {
  // Seeded by the engine's own per-turn word: a new verb each turn, steady within one.
  on('ui.render', { component: 'Spinner' }, ($, e, next) =>
    next({ ...e, props: { ...e.props, word: pick(VERBS[e.props.mode], e.props.word + e.props.mode) } }))

  on('ui.render', { component: 'TurnDuration' }, ($, e, next) =>
    next({ ...e, props: { ...e.props, word: pick(PAST_VERBS, e.props.word + e.requestId) } }))
}
