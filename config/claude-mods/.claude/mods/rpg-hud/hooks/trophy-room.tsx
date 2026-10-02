import type { ElementTable } from 'claude-code'

import type { Progress } from '../types'
import { TROPHIES } from './trophies'
import { oneLine } from './util'
import type { Item } from './window'

const formatDate = (ms: number): string => {
  const date = new Date(ms)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

export const featsSubtitle = (progress: Progress): string =>
  `${TROPHIES.filter(t => progress.unlocked[t.id] !== undefined).length}/${TROPHIES.length} earned`

// Earned feats first in the list's own order, locked ones dim with their hint, then lifetime figures.
export function featItems(ui: ElementTable, progress: Progress, width: number): Item[] {
  const { Text } = ui
  const row = (key: string, node: Item['node']): Item => ({ key, rows: 1, node })
  const earned = TROPHIES.filter(t => progress.unlocked[t.id] !== undefined)
  const locked = TROPHIES.filter(t => progress.unlocked[t.id] === undefined)
  const stats: [string, number][] = [
    ['casts', progress.totalCalls],
    ['bosses slain', progress.bossesDefeated],
    ['companions summoned', progress.petsSummoned],
    ['best combo', progress.bestCombo],
    ['best clean streak', progress.bestTurnStreak],
  ]
  return [
    ...earned.map(trophy =>
      row(
        trophy.id,
        <Text wrap="truncate">
          <Text color="yellow">★ </Text>
          <Text bold color="yellow">{trophy.title}</Text>
          <Text dimColor> · {formatDate(progress.unlocked[trophy.id] ?? 0)}</Text>
        </Text>,
      ),
    ),
    ...locked.map(trophy =>
      row(
        trophy.id,
        <Text wrap="truncate" dimColor>
          ☆ {trophy.title} · {oneLine(trophy.hint, width - trophy.title.length - 5)}
        </Text>,
      ),
    ),
    row('gap', <Text> </Text>),
    row(
      'lifetime',
      <Text bold color="yellow">
        ✧ Lifetime
      </Text>,
    ),
    ...stats.map(([label, value]) =>
      row(
        `stat-${label}`,
        <Text wrap="truncate">
          <Text bold>{String(value).padStart(6)} </Text>
          <Text dimColor>{label}</Text>
        </Text>,
      ),
    ),
  ]
}
