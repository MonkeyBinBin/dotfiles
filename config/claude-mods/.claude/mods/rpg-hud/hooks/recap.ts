import type { Boss, Tally, ToolCall, TouchedFile } from '../types'
import { rankOf } from './classes'
import type { HeroClass } from './classes'

export type RecapData = {
  hero: HeroClass
  level: number
  // Every main-loop call this session; `calls` holds only the latest.
  casts: number
  calls: readonly ToolCall[]
  elapsedMs?: number
  tally: Tally
  bestCombo: number
  boss: Boss | null
  touched: readonly TouchedFile[]
  usd?: number
  budget?: number
  contextPercent?: number
  // Titles of the trophies unlocked since the session started.
  trophies: readonly string[]
}

// `2h 05m`, `14m`, or `40s` under a minute.
export const formatDuration = (ms: number): string => {
  const minutes = Math.floor(Math.max(0, ms) / 60_000)
  if (minutes === 0) return `${Math.round(Math.max(0, ms) / 1000)}s`
  const hours = Math.floor(minutes / 60)
  return hours === 0 ? `${minutes}m` : `${hours}h ${String(minutes % 60).padStart(2, '0')}m`
}

// The tools cast most among the latest calls, refusals left out, most first: `Bash 12 · Read 9 · Edit 5`.
export const topTools = (calls: readonly ToolCall[], count = 3): string =>
  [...calls.filter(call => call.status !== 'deny').reduce((tally, call) => tally.set(call.tool, (tally.get(call.tool) ?? 0) + 1), new Map<string, number>())]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, count)
    .map(([tool, uses]) => `${tool} ${uses}`)
    .join(' · ')

// The session's adventure log as text, one line a topic; topics with nothing to say are left out.
export const recapText = (data: RecapData): string => {
  const { hero, tally } = data
  const head = `⚔ Claude the ${hero.title.toLowerCase()} · Lv.${data.level} ${rankOf(hero, data.level)}`
  const lines = [data.elapsedMs === undefined ? head : `${head} · ${formatDuration(data.elapsedMs)}`]

  const casting = [`✦ ${data.casts} casts`, `✗ ${tally.failures} ${hero.failures}`]
  if (tally.refusals > 0) casting.push(`⊘ ${tally.refusals} refused`)
  casting.push(`⚡ best combo ${data.bestCombo}`)
  lines.push(casting.join(' · '))
  const most = topTools(data.calls)
  if (most !== '') lines.push(`📖 most cast: ${most}`)

  if (tally.bossesDefeated > 0 || data.boss !== null) {
    const slain = `☠ ${tally.bossesDefeated} ${tally.bossesDefeated === 1 ? 'boss' : 'bosses'} defeated`
    lines.push(data.boss === null ? slain : `${slain} · ${data.boss.name} still stands (HP ${data.boss.hp})`)
  }
  if (tally.petsSummoned > 0) lines.push(`♣ ${tally.petsSummoned} ${tally.petsSummoned === 1 ? 'pet' : 'pets'} summoned`)

  const edited = data.touched.filter(file => file.edits > 0).length
  if (data.touched.length > 0) {
    lines.push(`🗺 ${data.touched.length} ${data.touched.length === 1 ? 'file' : 'files'} explored · ✎ ${edited} edited`)
  }

  const purse: string[] = []
  if (data.usd !== undefined) {
    const spent = `⛁ $${data.usd.toFixed(2)}`
    purse.push(data.budget === undefined ? spent : `${spent} of $${data.budget.toFixed(2)}`)
  }
  if (data.contextPercent !== undefined) purse.push(`🔮 context ${Math.round(data.contextPercent)}% full`)
  if (purse.length > 0) lines.push(purse.join(' · '))

  if (data.trophies.length > 0) lines.push(`🏆 ${data.trophies.join(', ')}`)
  return lines.join('\n')
}
